"""API oficial del simulador de Manta y servidor de la interfaz de Dev 2."""
import asyncio
import gzip
import json
import math
import random
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from starlette.middleware.gzip import GZipMiddleware

from .config import BatchRequest, SimulateRequest, SimulationConfig, resolve_initial_sets
from .strategies import run_paired_simulation
from .topology import generate_manta_graph, resolve_initial_infections


def simulate_request(payload: dict) -> dict:
    request = SimulateRequest.model_validate(payload)
    graph = generate_manta_graph(request.n, request.degree, random.Random(request.seed))
    initial = resolve_initial_infections(
        graph, request.initial, request.initial_ids, random.Random(f"{request.seed}:initial")
    )
    counts = request.initial_state
    if counts is not None and request.initial_ids is None:
        pool = [node for node in range(request.n) if node not in initial]
        remainder = random.Random(f"{request.seed}:initial-remainder").sample(pool, counts.i - len(initial))
        initial = initial | frozenset(remainder)
    import_node = None
    if counts is not None and counts.s == request.n and request.all_s_import:
        import_node = random.Random(f"{request.seed}:external-import").randrange(request.n)
    config = SimulationConfig(n=request.n, days=request.days, seed=request.seed,
                              beta=request.beta, sigma=request.sigma, gamma=request.gamma,
                              e0=counts.e if counts else 0, i0=len(initial), r0=counts.r if counts else 0,
                              init_i=initial, import_node=import_node)
    initial_state = resolve_initial_sets(config, random.Random(f"{request.seed}:initial-state"))
    intervention = request.intervention
    result = run_paired_simulation(
        graph, config, initial, intervention.mode, intervention.quota,
        intervention.k_max, intervention.efficacy, intervention.delay,
        request.volunteers.enlist, request.volunteers.reinfection, request.include_frames,
        initial_state=initial_state,
    )
    # El motor usa infinito para R0 con gamma=0; JSON admite null, no Infinity.
    if not math.isfinite(result["meta"]["r0"]):
        result["meta"]["r0"] = None
    for strategy in result["strategies"].values():
        for row in strategy["days"]:
            row["volunteers"] = row["active_volunteers"]
    if request.include_frames:
        # El motor distingue vacuna (V) y brigadista (V_brigade); el contrato
        # visual de Dev 2 reserva V para brigadistas. Recuperar estado SEIR
        # de vacunados: la vacuna no cambia el estado S.
        for frame in result["frames"]:
            for change in frame["changed"]:
                change["state"] = {"V_brigade": "V", "V": "S"}.get(change["state"], change["state"])
        result["graph"] = {
            "nodes": [{"id": i, "x": xy[0], "y": xy[1],
                       "state": "E" if i in initial_state.e else "I" if i in initial_state.i else "R" if i in initial_state.r else "S",
                       "sector": graph.sectors[i], "label": graph.labels[i]}
                      for i, xy in enumerate(graph.coords)],
            "edges": list(graph.graph.unique_edges()),
        }
        encoded = json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(gzip.compress(encoded, compresslevel=6)) >= 50_000:
            result["graph"] = None
            result["frames"] = None
            result["meta"]["animation_warning"] = (
                "La animación supera 50 KB comprimidos. Se conservan todas las curvas y métricas; "
                "reduzca población o grado para animar la red."
            )
    return result


def replica_metrics(payload: dict, include_series: bool = False) -> dict:
    result = simulate_request(payload | {"include_frames": False})
    summary = {"r0": result["meta"]["r0"], "strategies": {
        key: value["metrics"] for key, value in result["strategies"].items()
    }}
    if include_series:
        summary["series"] = {key: [row["i"] for row in strategy["days"]]
                             for key, strategy in result["strategies"].items()}
    return summary


def batch_replica(job: dict) -> dict:
    return replica_metrics(job["base"], job["include_series"])


def aggregate_replicas(results: list[dict]) -> dict:
    def describe(values):
        values = sorted(values)
        def percentile(q):
            index = (len(values) - 1) * q
            lo = int(index)
            hi = min(lo + 1, len(values) - 1)
            return values[lo] + (values[hi] - values[lo]) * (index - lo)
        return {"mean": sum(values) / len(values), "p2_5": percentile(.025),
                "p97_5": percentile(.975), "min": values[0], "max": values[-1]}
    summary = {"replicas": len(results), "r0": results[0]["r0"], "strategies": {
        strategy: {metric: describe([r["strategies"][strategy][metric] for r in results])
                   for metric in ("avoided_infections", "peak_i", "doses_spent")}
        for strategy in ("proposed", "random", "none")
    }}
    if all("series" in result for result in results):
        summary["series"] = {}
        for strategy in ("proposed", "random", "none"):
            days = len(results[0]["series"][strategy])
            daily = [describe([result["series"][strategy][day] for result in results]) for day in range(days)]
            summary["series"][strategy] = {
                key: [round(row[key], 4) for row in daily]
                for key in ("mean", "p2_5", "p97_5")}
    return summary


@asynccontextmanager
async def lifespan(application):
    application.state.capacity = asyncio.Semaphore(2)
    with ProcessPoolExecutor(max_workers=2) as pool:
        application.state.pool = pool
        yield


app = FastAPI(title="Simulador de contención Manta", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.exception_handler(RequestValidationError)
async def invalid_request(request, error):
    problems = error.errors()
    first = problems[0] if problems else {}
    field = ".".join(str(part) for part in first.get("loc", ()) if part != "body")
    message = first.get("msg", "Entrada inválida")
    return JSONResponse(status_code=400, content={"error": f"Parámetro inválido: {field}: {message}"})


@app.middleware("http")
async def bounded_body(request: Request, call_next):
    if request.method == "POST":
        size = 0
        chunks = []
        async for chunk in request.stream():
            size += len(chunk)
            if size > 65536:
                return JSONResponse(status_code=400, content={"error": "Cuerpo superior a 64 KiB"})
            chunks.append(chunk)
        request._body = b"".join(chunks)
    return await call_next(request)


@app.get("/health")
async def health():
    return {"status": "healthy"}


async def execute(request: Request, jobs: list[tuple]):
    gate = request.app.state.capacity
    if gate.locked():
        raise HTTPException(status_code=429, detail="Servidor ocupado", headers={"Retry-After": "2"})
    await gate.acquire()
    work = None
    try:
        loop = asyncio.get_running_loop()
        work = asyncio.gather(*[
            loop.run_in_executor(request.app.state.pool, function, payload)
            for function, payload in jobs
        ], return_exceptions=True)
        results = await asyncio.shield(work)
        for result in results:
            if isinstance(result, BaseException):
                raise result
        return results
    except asyncio.CancelledError:
        # Una desconexión no libera capacidad mientras la CPU sigue trabajando.
        if work is not None:
            await work
        raise
    except (ValueError, ValidationError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    finally:
        gate.release()


@app.exception_handler(HTTPException)
async def controlled_error(request, error):
    return JSONResponse(status_code=error.status_code, content={"error": error.detail}, headers=error.headers)


@app.post("/api/simulate")
async def simulate(body: SimulateRequest, request: Request):
    return (await execute(request, [(simulate_request, body.model_dump())]))[0]


@app.post("/api/batch")
async def batch(body: BatchRequest, request: Request):
    payload = body.base.model_dump()

    if __import__("os").getenv("MONTECARLO_AWS", "false").lower() == "true":
        import boto3
        import json
        import logging

        jobs = [
            {
                "base": payload,
                "seed": body.base.seed + index,
                "include_series": body.include_series
            }
            for index in range(body.replicas)
        ]

        try:
            def run_cloud():
                client = boto3.client("stepfunctions", region_name="us-east-2")
                response = client.start_sync_execution(
                    stateMachineArn="arn:aws:states:us-east-2:887324469817:stateMachine:Spookython-Simulation-Express",
                    input=json.dumps(jobs)
                )
                if response.get("status") != "SUCCEEDED":
                    raise RuntimeError(
                        f"Step Functions: {response.get('error')} {response.get('cause')}"
                    )
                return json.loads(response["output"])

            return await asyncio.to_thread(run_cloud)

        except Exception:
            logging.exception("Fallo Monte Carlo AWS; usando procesamiento local")

    results = await execute(request, [
        (batch_replica, {"base": payload | {"seed": body.base.seed + index}, "include_series": body.include_series})
        for index in range(body.replicas)
    ])
    return aggregate_replicas(results)


app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="frontend")


def main():
    import uvicorn
    uvicorn.run("seir.app:app", host="0.0.0.0", port=8000)
