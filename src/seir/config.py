"""Parámetros, validación y resolución de los conjuntos iniciales."""

import random
from dataclasses import dataclass

from .states import State


@dataclass(frozen=True)
class SimulationConfig:
    n: int
    beta: float
    sigma: float
    gamma: float
    days: int = 30
    seed: int = 0
    e0: int = 0
    i0: int = 0
    r0: int = 0
    init_e: frozenset[int] | None = None
    init_i: frozenset[int] | None = None
    init_r: frozenset[int] | None = None
    efficacy: float = 0.8
    delay: int = 0
    p_vol: float = 0.0
    p_reinf: float = 0.0

    def __post_init__(self) -> None:
        self.validate()

    def validate(self) -> None:
        for name in ("n", "days", "seed", "e0", "i0", "r0"):
            if type(getattr(self, name)) is not int:
                raise ValueError(f"{name} debe ser un entero")
        if type(self.delay) is not int or self.delay < 0:
            raise ValueError("delay debe ser un entero no negativo")
        if self.n < 1:
            raise ValueError("n debe ser mayor que 0")
        if self.days < 0:
            raise ValueError("days no puede ser negativo")
        for name in ("e0", "i0", "r0"):
            if getattr(self, name) < 0:
                raise ValueError(f"{name} no puede ser negativo")
        if self.e0 + self.i0 + self.r0 > self.n:
            raise ValueError("e0 + i0 + r0 no puede superar n")
        for name in ("beta", "sigma", "gamma", "efficacy", "p_vol", "p_reinf"):
            value = getattr(self, name)
            if not isinstance(value, (int, float)) or not 0 <= value <= 1:
                raise ValueError(f"{name} debe estar entre 0 y 1")
        for name, count in (("init_e", self.e0), ("init_i", self.i0), ("init_r", self.r0)):
            ids = getattr(self, name)
            if ids is None:
                continue
            if not isinstance(ids, frozenset):
                raise ValueError(f"{name} debe ser un frozenset de IDs")
            if len(ids) != count:
                raise ValueError(f"{name} debe contener exactamente {count} IDs")
            for node in ids:
                if not isinstance(node, int) or not 0 <= node < self.n:
                    raise ValueError(f"{name} contiene un ID fuera de [0, {self.n})")

    @property
    def s0(self) -> int:
        return self.n - self.e0 - self.i0 - self.r0


@dataclass(frozen=True)
class InitialState:
    e: frozenset[int]
    i: frozenset[int]
    r: frozenset[int]


def resolve_initial_sets(config: SimulationConfig, rng: random.Random) -> InitialState:
    """Usa los IDs manuales y completa el resto en el orden R, I, E."""
    manual = {State.R: config.init_r, State.I: config.init_i, State.E: config.init_e}
    counts = {State.R: config.r0, State.I: config.i0, State.E: config.e0}
    chosen: dict[State, frozenset[int]] = {}
    taken: set[int] = set()

    for state in (State.R, State.I, State.E):
        ids = manual[state]
        if ids is None:
            continue
        if taken & ids:
            raise ValueError(f"init_{state.value.lower()} comparte IDs con otro conjunto inicial")
        chosen[state] = ids
        taken.update(ids)

    for state in (State.R, State.I, State.E):
        if state in chosen:
            continue
        pool = [node for node in range(config.n) if node not in taken]
        selected = frozenset(rng.sample(pool, counts[state]))
        chosen[state] = selected
        taken.update(selected)

    return InitialState(e=chosen[State.E], i=chosen[State.I], r=chosen[State.R])
