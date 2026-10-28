"""Parámetros, validación y resolución de los conjuntos iniciales."""

import random
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .states import State


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class InterventionConfig(RequestModel):
    mode: Literal["dynamic", "static"] = "dynamic"
    efficacy: float = Field(default=.8, ge=0, le=1)
    delay: int = Field(default=0, ge=0, le=90)
    quota: int = Field(default=30, ge=0, le=2000)
    k_max: int | None = Field(default=None, ge=0, le=800)


class VolunteersConfig(RequestModel):
    enlist: float = Field(default=.12, ge=0, le=1)
    reinfection: float = Field(default=.04, ge=0, le=1)


class SimulateRequest(RequestModel):
    n: int = Field(default=1000, ge=7, le=2000)
    days: int = Field(default=60, ge=0, le=90)
    seed: int = Field(default=42, ge=0, le=2**32 - 1)
    beta: float = Field(default=.03, ge=0, le=1)
    sigma: float = Field(default=.2, ge=0, le=1)
    gamma: float = Field(default=.1, ge=0, le=1)
    degree: float = Field(default=8, ge=0, le=50)
    initial: dict[str, int] = Field(default_factory=lambda: {"tarqui": 10})
    initial_ids: list[int] | None = None
    intervention: InterventionConfig = Field(default_factory=InterventionConfig)
    volunteers: VolunteersConfig = Field(default_factory=VolunteersConfig)
    include_frames: bool = False

    @model_validator(mode="after")
    def validate_territory(self):
        from .topology import SECTORS
        if self.degree > self.n - 1:
            raise ValueError("degree no puede superar n - 1")
        if self.intervention.k_max is None:
            self.intervention.k_max = int(.4 * self.n)
        if self.intervention.k_max > int(.4 * self.n):
            raise ValueError("k_max no puede superar 0.40 N")
        for sector, count in self.initial.items():
            if sector not in SECTORS or count < 0:
                raise ValueError("Sector o número de infectados inválido")
        if self.initial_ids is not None:
            if len(set(self.initial_ids)) != len(self.initial_ids):
                raise ValueError("initial_ids contiene duplicados")
            if any(not 0 <= node < self.n for node in self.initial_ids):
                raise ValueError("initial_ids fuera de rango")
        elif sum(self.initial.values()) > self.n:
            raise ValueError("Los infectados iniciales superan N")
        return self


class BatchRequest(RequestModel):
    base: SimulateRequest = Field(default_factory=SimulateRequest)
    replicas: int = Field(default=30, ge=1, le=100)

    @model_validator(mode="after")
    def validate_seed_range(self):
        if self.base.seed + self.replicas - 1 > 2**32 - 1:
            raise ValueError("La secuencia de semillas excede el rango de 32 bits")
        return self


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
