"""API pública del motor SEIR sobre grafos."""

from .config import InitialState, SimulationConfig, resolve_initial_sets
from .engine import DayRecord, SeirEngine, SimulationResult, simulate
from .graph import Graph, generate_graph, load_edges
from .states import STATE_ORDER, State
from .topology import (
    SECTORS,
    SECTOR_ADJACENCY,
    TerritorialGraph,
    generate_manta_graph,
    resolve_initial_infections,
)

__all__ = [
    "SECTORS",
    "SECTOR_ADJACENCY",
    "STATE_ORDER",
    "DayRecord",
    "Graph",
    "InitialState",
    "SeirEngine",
    "SimulationConfig",
    "SimulationResult",
    "State",
    "TerritorialGraph",
    "generate_graph",
    "generate_manta_graph",
    "load_edges",
    "resolve_initial_infections",
    "resolve_initial_sets",
    "simulate",
]
