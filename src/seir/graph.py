"""Grafo no dirigido simple, inmutable, y sus dos formas de construcción."""

import random
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Graph:
    n: int
    adjacency: tuple[frozenset[int], ...]

    def __post_init__(self) -> None:
        if self.n < 1:
            raise ValueError("n debe ser mayor que 0")
        if len(self.adjacency) != self.n:
            raise ValueError(f"la lista de adyacencia debe tener {self.n} entradas")
        for node, neighbors in enumerate(self.adjacency):
            if not isinstance(neighbors, frozenset):
                raise ValueError(f"los vecinos del nodo {node} deben ser frozenset")
            if node in neighbors:
                raise ValueError(f"bucle en el nodo {node}")
            for other in neighbors:
                if not isinstance(other, int) or not 0 <= other < self.n:
                    raise ValueError(f"el nodo {node} tiene un vecino fuera de [0, {self.n})")
                if node not in self.adjacency[other]:
                    raise ValueError(f"la arista {node}-{other} no es simétrica")

    @property
    def nodes(self) -> range:
        return range(self.n)

    def neighbors(self, node: int) -> frozenset[int]:
        return self.adjacency[node]

    def degree(self, node: int) -> int:
        return len(self.adjacency[node])

    def average_degree(self) -> float:
        return sum(self.degree(node) for node in self.nodes) / self.n

    def unique_edges(self) -> list[tuple[int, int]]:
        """Devuelve la lista de aristas (u, v) con u < v ordenadas."""
        edges: list[tuple[int, int]] = []
        for u in self.nodes:
            for v in self.adjacency[u]:
                if u < v:
                    edges.append((u, v))
        return sorted(edges)

    @classmethod

    def from_edges(cls, n: int, edges: Iterable[tuple[int, int]]) -> "Graph":
        adjacency = [set() for _ in range(n)]
        for a, b in edges:
            if not (0 <= a < n and 0 <= b < n):
                raise ValueError(f"la arista {a}-{b} usa un ID fuera de [0, {n})")
            if a == b:
                raise ValueError(f"bucle en el nodo {a}")
            adjacency[a].add(b)
            adjacency[b].add(a)
        return cls(n, tuple(frozenset(neighbors) for neighbors in adjacency))


def generate_graph(n: int, average_degree: float, rng: random.Random) -> Graph:
    """Empareja stubs barajados y descarta lazos y aristas repetidas."""
    if n < 1:
        raise ValueError("n debe ser mayor que 0")
    if average_degree < 0:
        raise ValueError("average_degree no puede ser negativo")
    target = min(average_degree, n - 1)
    stubs_per_node = round(target)
    if n == 1 or stubs_per_node == 0:
        return Graph(n, tuple(frozenset() for _ in range(n)))

    adjacency = [set() for _ in range(n)]
    stubs = [node for node in range(n) for _ in range(stubs_per_node)]
    # Los emparejamientos fallidos se reintentan barajando; el tope evita bucles.
    for _ in range(10):
        if len(stubs) < 2:
            break
        rng.shuffle(stubs)
        leftover = []
        added = 0
        for index in range(0, len(stubs) - 1, 2):
            a, b = stubs[index], stubs[index + 1]
            if a == b or b in adjacency[a]:
                leftover.extend((a, b))
            else:
                adjacency[a].add(b)
                adjacency[b].add(a)
                added += 1
        if len(stubs) % 2:
            leftover.append(stubs[-1])
        if added == 0:
            break
        stubs = leftover
    return Graph(n, tuple(frozenset(neighbors) for neighbors in adjacency))


def load_edges(path: Path, n: int | None = None) -> Graph:
    """Lee `a,b` o `a<TAB>b`; cada arista debe aparecer en ambos sentidos."""
    edges: set[tuple[int, int]] = set()
    max_id = -1
    for number, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        fields = [field.strip() for field in (line.split("\t") if "\t" in line else line.split(","))]
        if len(fields) != 2:
            raise ValueError(f"línea {number}: se esperaban dos columnas a,b")
        if fields[0].lower() == "a" and fields[1].lower() == "b":
            continue
        try:
            a, b = int(fields[0]), int(fields[1])
        except ValueError:
            raise ValueError(f"línea {number}: los IDs deben ser enteros") from None
        if a < 0 or b < 0:
            raise ValueError(f"línea {number}: los IDs no pueden ser negativos")
        if a == b:
            raise ValueError(f"línea {number}: bucle en el nodo {a}")
        edges.add((a, b))
        max_id = max(max_id, a, b)

    size = n if n is not None else max_id + 1
    if size < 1:
        raise ValueError("no hay aristas: indica --n para fijar el tamaño")
    for a, b in edges:
        if a >= size or b >= size:
            raise ValueError(f"la arista {a}-{b} usa un ID fuera de [0, {size})")
        if (b, a) not in edges:
            raise ValueError(f"falta la arista inversa {b},{a} de {a},{b}")
    return Graph.from_edges(size, edges)
