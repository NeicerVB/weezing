"""Parámetros del modelo agregado."""

from dataclasses import dataclass
from math import isfinite


@dataclass(frozen=True)
class SimulationConfig:
    n: int
    days: int
    beta: float
    sigma: float
    gamma: float
    seed: int = 0
    e0: int = 0
    i0: int = 0
    r0: int = 0

    def __post_init__(self) -> None:
        for name in ("n", "days", "seed", "e0", "i0", "r0"):
            if type(getattr(self, name)) is not int:
                raise ValueError(f"{name} debe ser un entero")
        if self.n < 1:
            raise ValueError("n debe ser mayor que 0")
        for name in ("days", "e0", "i0", "r0"):
            if getattr(self, name) < 0:
                raise ValueError(f"{name} no puede ser negativo")
        if self.e0 + self.i0 + self.r0 > self.n:
            raise ValueError("e0 + i0 + r0 no puede superar n")
        for name in ("beta", "sigma", "gamma"):
            value = getattr(self, name)
            if not isinstance(value, (int, float)) or not 0 <= value <= 1 or not isfinite(value):
                raise ValueError(f"{name} debe estar entre 0 y 1 y ser finito")

    @property
    def s0(self) -> int:
        return self.n - self.e0 - self.i0 - self.r0
