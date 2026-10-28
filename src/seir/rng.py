"""Sorteo determinista e independiente del orden de iteración."""

import hashlib
from typing import Final

_INV_2_64: Final[float] = 1.0 / 18446744073709551616.0


def event_uniform(seed: int, day: int, node: int, transition: str) -> float:
    """Devuelve un valor en [0, 1) derivado solo de la identidad del evento.

    Se evita `hash()` porque cambia entre procesos; BLAKE2b es estable.
    """
    key = f"{seed}:{day}:{node}:{transition}".encode("ascii")
    digest = hashlib.blake2b(key, digest_size=8).digest()
    return int.from_bytes(digest, "big") * _INV_2_64
