"""Handler compartido por las réplicas y la reducción del Inline Map.

Empaquetar este archivo junto al paquete seir y sus dependencias Python 3.12.
No se conecta a AWS ni requiere credenciales para pruebas locales.
"""
from seir.app import aggregate_replicas, replica_metrics
from seir.config import SimulateRequest


def handler(event, context):
    if "results" in event:
        results = event["results"]
        if not isinstance(results, list) or not 1 <= len(results) <= 100:
            raise ValueError("Se requieren entre 1 y 100 resultados")
        return aggregate_replicas(results)
    request = SimulateRequest.model_validate(event["base"] | {"seed": event["seed"]})
    return replica_metrics(request.model_dump())
