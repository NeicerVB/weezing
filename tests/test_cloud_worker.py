import importlib.util
from pathlib import Path

import pytest


def worker():
    path = Path(__file__).parents[1] / "infra/lambda_worker.py"
    assert path.exists(), "Falta el worker Lambda de Dev 3"
    spec = importlib.util.spec_from_file_location("lambda_worker", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_worker_matches_local_batch_summary():
    module = worker()
    body = {"n": 70, "days": 3, "seed": 42, "initial": {"tarqui": 2}}
    first = module.handler({"base": body, "seed": 42}, None)
    assert "strategies" in first and "frames" not in first
    assert first == module.handler({"base": body, "seed": 42}, None)
    result = module.handler({"results": [first, first]}, None)
    assert result["replicas"] == 2
    assert result["strategies"]["none"]["avoided_infections"] == {
        "mean": 0, "p2_5": 0, "p97_5": 0, "min": 0, "max": 0}


def test_worker_bounds_input_and_aggregation():
    module = worker()
    with pytest.raises(ValueError):
        module.handler({"results": []}, None)
    with pytest.raises(ValueError):
        module.handler({"base": {"n": 2001}, "seed": 42}, None)
