"""Aceptación transversal del Anexo B, con expectativas independientes."""
import math
import random

import pytest

from seir.app import simulate_request
from seir.topology import SECTOR_ADJACENCY, generate_manta_graph, resolve_initial_infections


@pytest.mark.parametrize("n,degree", [(7, 6), (14, 13), (70, 50), (1000, 8)])
def test_dense_topology_never_connects_nonadjacent_sectors(n, degree):
    graph = generate_manta_graph(n, degree, random.Random(42))
    allowed = {frozenset(pair) for pair in SECTOR_ADJACENCY}
    for a, b in graph.graph.unique_edges():
        assert graph.sectors[a] == graph.sectors[b] or frozenset((graph.sectors[a], graph.sectors[b])) in allowed


def test_explicit_empty_initial_ids_means_no_outbreak():
    graph = generate_manta_graph(70, 6, random.Random(42))
    assert resolve_initial_infections(graph, {"tarqui": 3}, [], random.Random(42)) == frozenset()


@pytest.mark.parametrize("mode", ["static", "dynamic"])
@pytest.mark.parametrize("seed", [0, 1, 2, 42, 99])
def test_annex_b_invariants_across_seeds_and_modes(mode, seed):
    result = simulate_request({"n": 70, "days": 30, "seed": seed, "beta": .2,
        "degree": 8, "initial": {"tarqui": 3, "los_esteros": 2},
        "intervention": {"mode": mode, "quota": 2, "k_max": 28, "delay": 3}})
    rows = result["strategies"]
    for strategy in rows.values():
        spent = 0
        for row in strategy["days"]:
            assert sum(row[key] for key in ("s", "e", "i", "r")) == 70
            assert all(row[key] >= 0 for key in ("s", "e", "i", "r"))
            spent += row["doses_administered"]
            assert spent <= 28
        assert spent == strategy["metrics"]["doses_spent"]
        assert strategy["metrics"]["avoided_infections"] == (
            rows["none"]["metrics"]["cumulative_infections"] - strategy["metrics"]["cumulative_infections"])
    assert [r["doses_administered"] for r in rows["proposed"]["days"]] == [r["doses_administered"] for r in rows["random"]["days"]]


@pytest.mark.parametrize("change", [{"beta": 0}, {"sigma": 0}, {"gamma": 0}])
def test_annex_b_zero_rates(change):
    result = simulate_request({"n": 70, "days": 20, "initial": {"tarqui": 3}, **change})
    for strategy in result["strategies"].values():
        rows = strategy["days"]
        if "beta" in change:
            assert all(row["new_s_to_e"] == 0 for row in rows)
        if "sigma" in change:
            assert all(b["e"] >= a["e"] for a, b in zip(rows, rows[1:]))
        if "gamma" in change:
            assert all(row["r"] == 0 for row in rows)


def test_zero_stock_compares_identical_curves_even_with_volunteers():
    data = simulate_request({"n": 70, "days": 40, "initial": {"tarqui": 3},
                             "intervention": {"k_max": 0}})
    curves = [strategy["days"] for strategy in data["strategies"].values()]
    assert curves[0] == curves[1] == curves[2]


def test_default_hubs_have_approximately_four_times_mean_degree():
    graph = generate_manta_graph(1000, 8, random.Random(42))
    mean = graph.graph.average_degree()
    assert all(3 * mean <= graph.graph.degree(hub) <= 5 * mean for hub in graph.hubs)


def test_explicit_seir_allocation_and_day_one_import():
    from collections import Counter
    from seir.app import simulate_request
    base = {"n": 70, "days": 2, "degree": 0, "beta": 0.0, "sigma": 0.0, "gamma": 0.0,
            "initial": {"tarqui": 2}, "initial_state": {"s": 60, "e": 3, "i": 5, "r": 2},
            "include_frames": True, "all_s_import": True}
    result = simulate_request(base)
    assert result == simulate_request(base)
    assert Counter(node["state"] for node in result["graph"]["nodes"]) == {"S": 60, "E": 3, "I": 5, "R": 2}
    for strategy in result["strategies"].values():
        assert [strategy["days"][0][key] for key in ("s", "e", "i", "r")] == [60, 3, 5, 2]
        assert all(sum(row[key] for key in ("s", "e", "i", "r")) == 70 for row in strategy["days"])
    imported = simulate_request(base | {"initial": {}, "initial_state": {"s": 70, "e": 0, "i": 0, "r": 0}})
    assert imported["meta"]["external_import"] == {"day": 1, "node": imported["meta"]["external_import"]["node"], "state": "I"}
    assert all(node["state"] == "S" for node in imported["graph"]["nodes"])
    for strategy in imported["strategies"].values():
        assert strategy["days"][0]["i"] == 0
        assert strategy["days"][1]["i"] == 1
        assert strategy["days"][1]["imported_cases"] == 1
        assert strategy["days"][1]["cumulative"] == 1
    assert len(imported["frames"][0]["changed"]) == 1
    legacy = simulate_request({"n": 70, "days": 2, "initial": {}})
    assert all(row["i"] == 0 for row in legacy["strategies"]["none"]["days"])
    exposed = simulate_request(base | {"initial": {}, "initial_state": {"s": 67, "e": 3, "i": 0, "r": 0}})
    assert exposed["meta"]["external_import"] is None
