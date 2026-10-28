"""Estados del autómata. Sin lógica: el motor compara miembros del enum."""

from enum import Enum


class State(Enum):
    S = "S"
    E = "E"
    I = "I"
    R = "R"


STATE_ORDER = (State.S, State.E, State.I, State.R)
