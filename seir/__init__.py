"""API pública del motor SEIR sobre grafos."""

from .config import InitialState, SimulationConfig, resolve_initial_sets
from .engine import DayRecord, SeirEngine, SimulationResult, simulate
from .graph import Graph, generate_graph, load_edges
from .states import STATE_ORDER, State

__all__ = [
    "STATE_ORDER",
    "DayRecord",
    "Graph",
    "InitialState",
    "SeirEngine",
    "SimulationConfig",
    "SimulationResult",
    "State",
    "generate_graph",
    "load_edges",
    "resolve_initial_sets",
    "simulate",
]
