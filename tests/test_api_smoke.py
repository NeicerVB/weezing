import asyncio
import importlib
import json

import httpx
import pytest
from fastapi.testclient import TestClient


PAYLOAD = {
    "n": 140, "days": 8, "seed": 42, "beta": .03, "sigma": .2,
    "gamma": .1, "degree": 8, "initial": {"tarqui": 5, "los_esteros": 2},
    "intervention": {"mode": "dynamic", "efficacy": .8, "delay": 0,
                     "quota": 30, "k_max": 56},
    "volunteers": {"enlist": .12, "reinfection": .04}, "include_frames": False,
}


@pytest.fixture
def application():
    return importlib.import_module("seir.app").app


def test_health_and_official_frontend(application):
    with TestClient(application) as client:
        assert client.get("/health").json() == {"status": "healthy"}
        assert "Simulación computacional ficticia" in client.get("/").text
        assert client.get("/app.js").status_code == 200


def test_simulate_contract_and_reproducibility(application):
    with TestClient(application) as client:
        response = client.post("/api/simulate", json=PAYLOAD)
        assert response.status_code == 200, response.text
        data = response.json()
        assert data == client.post("/api/simulate", json=PAYLOAD).json()
        assert data["frames"] is None
        assert data["meta"]["r0"] == 2.4
        for strategy in data["strategies"].values():
            assert len(strategy["days"]) == 9
            for row in strategy["days"]:
                assert row["s"] + row["e"] + row["i"] + row["r"] == 140
                assert "volunteers" in row


@pytest.mark.parametrize("change", [
    {"n": 2001}, {"n": True}, {"days": 91}, {"gamma": -1},
    {"initial": {"unknown": 1}}, {"initial": {"tarqui": 141}},
    {"initial_ids": [0, 140]}, {"initial_ids": [1, 1]},
    {"intervention": {"k_max": 57}}, {"degree": 2000},
    {"volunteers": {"enlist": 2}}, {"surprise": 1},
])
def test_invalid_input_returns_400(application, change):
    with TestClient(application) as client:
        response = client.post("/api/simulate", json=PAYLOAD | change)
        assert response.status_code == 400
        assert "error" in response.json()


def test_frames_use_frontend_states_and_initial_graph(application):
    with TestClient(application) as client:
        data = client.post("/api/simulate", json=PAYLOAD | {"include_frames": True}).json()
        assert len(data["graph"]["nodes"]) == 140
        assert sum(n["state"] == "I" for n in data["graph"]["nodes"]) == 7
        assert len(data["frames"]) == 8
        assert all(c["state"] in "SEIRV" for f in data["frames"] for c in f["changed"])


def test_gamma_zero_is_serializable(application):
    with TestClient(application) as client:
        response = client.post("/api/simulate", json=PAYLOAD | {"gamma": 0})
        assert response.status_code == 200
        assert response.json()["meta"]["r0"] is None


def test_batch_is_aggregated_bounded_and_reproducible(application):
    with TestClient(application) as client:
        payload = {"base": PAYLOAD, "replicas": 3}
        response = client.post("/api/batch", json=payload)
        assert response.status_code == 200, response.text
        data = response.json()
        assert data == client.post("/api/batch", json=payload).json()
        assert len(response.content) < 30_000
        assert data["replicas"] == 3
        assert "frames" not in data and "graph" not in data
        for strategy in data["strategies"].values():
            assert "days" not in strategy
            for summary in strategy.values():
                assert summary["min"] <= summary["p2_5"] <= summary["p97_5"] <= summary["max"]
                assert summary["min"] <= summary["mean"] <= summary["max"]
        assert client.post("/api/batch", json={"replicas": 101}).status_code == 400


def test_saturation_returns_immediately_and_releases_slots(application):
    async def exercise():
        async with application.router.lifespan_context(application):
            gate = application.state.capacity
            await gate.acquire()
            await gate.acquire()
            try:
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=application), base_url="http://test") as client:
                    for path, body in [("/api/simulate", PAYLOAD), ("/api/batch", {"base": PAYLOAD})]:
                        response = await asyncio.wait_for(client.post(path, json=body), timeout=.5)
                        assert response.status_code == 429
                        assert response.headers["Retry-After"] == "2"
                    assert (await client.get("/health")).status_code == 200
            finally:
                gate.release()
                gate.release()
    asyncio.run(exercise())


def test_malformed_and_oversized_body(application):
    with TestClient(application) as client:
        for body in ["{broken", "x" * 65537]:
            assert client.post("/api/simulate", content=body).status_code == 400
        assert client.post("/api/simulate", json=PAYLOAD).status_code == 200


def test_animation_states_match_epidemiological_counts(application):
    payload = PAYLOAD | {"days": 30, "beta": .5, "include_frames": True,
                         "intervention": {"efficacy": 0, "k_max": 56}}
    with TestClient(application) as client:
        data = client.post("/api/simulate", json=payload).json()
    states = {node["id"]: node["state"] for node in data["graph"]["nodes"]}
    for frame, row in zip(data["frames"], data["strategies"]["proposed"]["days"][1:]):
        states.update({change["id"]: change["state"] for change in frame["changed"]})
        for state in "SEI":
            assert sum(value == state for value in states.values()) == row[state.lower()]
        assert sum(value in ("R", "V") for value in states.values()) == row["r"]
