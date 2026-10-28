from pathlib import Path

p = Path("src/seir/app.py")
s = p.read_text(encoding="utf-8")

old = """    payload = body.base.model_dump()
    results = await execute(request, [
        (batch_replica, {"base": payload | {"seed": body.base.seed + index}, "include_series": body.include_series})
        for index in range(body.replicas)
    ])
    return aggregate_replicas(results)"""

new = """    payload = body.base.model_dump()

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
    return aggregate_replicas(results)"""

if old not in s:
    raise SystemExit("ERROR: No se encontró el endpoint esperado. No se modificó nada.")

backup = p.with_suffix(".py.backup")
backup.write_text(s, encoding="utf-8")
p.write_text(s.replace(old, new, 1), encoding="utf-8")

req = Path("requirements.txt")
deps = req.read_text(encoding="utf-8")
if not any(line.strip().startswith(("boto3==", "boto3>=", "boto3~=")) for line in deps.splitlines()):
    req.write_text(deps.rstrip() + "\nboto3>=1.35,<2\n", encoding="utf-8")

print("OK: FastAPI preparado para Monte Carlo AWS con respaldo local")
