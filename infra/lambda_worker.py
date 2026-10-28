"""Worker de simulaciones Monte Carlo para AWS Lambda."""

from seir.app import aggregate_replicas, replica_metrics
from seir.config import SimulateRequest


def handler(event, context):
    if "results" in event:
        results = event["results"]
        if not isinstance(results, list) or not 1 <= len(results) <= 100:
            raise ValueError("Se requieren entre 1 y 100 resultados")
        return aggregate_replicas(results)

    request = SimulateRequest.model_validate(
        event["base"] | {"seed": event["seed"]}
    )

    return replica_metrics(
        request.model_dump(),
        event.get("include_series", False)
    )