"""Modelo SEIR agregado de uso didáctico."""

from .config import SimulationConfig
from .engine import DayRecord, SimulationResult, simulate

__all__ = ["SimulationConfig", "DayRecord", "SimulationResult", "simulate"]
