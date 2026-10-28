"""Estados del autómata y modificadores ortogonales."""

from dataclasses import dataclass
from enum import Enum


class State(Enum):
    S = "S"
    E = "E"
    I = "I"
    R = "R"


STATE_ORDER = (State.S, State.E, State.I, State.R)


@dataclass
class NodeModifier:
    """Modificadores ortogonales por nodo para vacunación y brigadas de convalecientes."""

    is_vaccinated: bool = False
    pending_vaccine_day: int | None = None
    is_volunteer: bool = False
    enlistment_count: int = 0

    @property
    def is_pending(self) -> bool:
        return self.pending_vaccine_day is not None
