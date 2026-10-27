"""Evolución diaria simultánea de cuatro compartimentos agregados."""

from dataclasses import asdict, dataclass
from random import Random

from .config import SimulationConfig


@dataclass(frozen=True)
class DayRecord:
    day: int
    s: int
    e: int
    i: int
    r: int
    new_s_to_e: int
    cumulative: int


@dataclass(frozen=True)
class SimulationResult:
    config: SimulationConfig
    records: tuple[DayRecord, ...]

    def to_rows(self) -> list[dict]:
        return [asdict(record) for record in self.records]


def _draw(rng: Random, count: int, probability: float) -> int:
    return sum(rng.random() < probability for _ in range(count))


def simulate(config: SimulationConfig) -> SimulationResult:
    """Un paso por día; los cambios nuevos no progresan hasta el día siguiente."""
    rng = Random(config.seed)
    s, e, i, r = config.s0, config.e0, config.i0, config.r0
    cumulative = e + i
    records = [DayRecord(0, s, e, i, r, 0, cumulative)]

    for day in range(1, config.days + 1):
        # Parámetro abstracto de mezcla homogénea; no representa contactos reales.
        new_s_to_e = _draw(rng, s, config.beta * i / config.n)
        new_e_to_i = _draw(rng, e, config.sigma)
        new_i_to_r = _draw(rng, i, config.gamma)
        s -= new_s_to_e
        e += new_s_to_e - new_e_to_i
        i += new_e_to_i - new_i_to_r
        r += new_i_to_r
        cumulative += new_s_to_e
        assert s + e + i + r == config.n
        records.append(DayRecord(day, s, e, i, r, new_s_to_e, cumulative))

    return SimulationResult(config, tuple(records))
