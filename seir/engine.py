"""Autómata SEIR que avanza un paso por día sobre la topología real."""

import random
from collections import Counter
from dataclasses import asdict, dataclass

from .config import InitialState, SimulationConfig, resolve_initial_sets
from .graph import Graph
from .rng import event_uniform
from .states import State


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
    average_degree: float
    records: tuple[DayRecord, ...]

    def to_rows(self) -> list[dict]:
        return [asdict(record) for record in self.records]


class SeirEngine:
    def __init__(self, graph: Graph, config: SimulationConfig, initial_state: InitialState) -> None:
        self.graph = graph
        self.config = config
        self.state = {node: State.S for node in graph.nodes}
        for node in initial_state.e:
            self.state[node] = State.E
        for node in initial_state.i:
            self.state[node] = State.I
        for node in initial_state.r:
            self.state[node] = State.R
        self.cumulative = len(initial_state.e) + len(initial_state.i)

    def _counts(self) -> Counter[State]:
        return Counter(self.state.values())

    def step(self, day: int) -> DayRecord:
        snapshot = self.state.copy()
        infectious = {node for node, state in snapshot.items() if state is State.I}
        config = self.config
        to_exposed: set[int] = set()
        to_infectious: set[int] = set()
        to_removed: set[int] = set()

        for node, state in snapshot.items():
            if state is State.S:
                exposed = sum(1 for neighbor in self.graph.adjacency[node] if neighbor in infectious)
                probability = 1 - (1 - config.beta) ** exposed
                if exposed and event_uniform(config.seed, day, node, "s2e") < probability:
                    to_exposed.add(node)
            elif state is State.E:
                if event_uniform(config.seed, day, node, "e2i") < config.sigma:
                    to_infectious.add(node)
            elif state is State.I:
                if event_uniform(config.seed, day, node, "i2r") < config.gamma:
                    to_removed.add(node)

        # Aplicación simultánea: nada de lo calculado hoy se vuelve a evaluar hoy.
        for node in to_exposed:
            self.state[node] = State.E
        for node in to_infectious:
            self.state[node] = State.I
        for node in to_removed:
            self.state[node] = State.R
        self.cumulative += len(to_exposed)

        counts = self._counts()
        total = sum(counts.values())
        assert total == self.graph.n, f"se conservaron {total} de {self.graph.n} nodos"
        return DayRecord(
            day=day,
            s=counts[State.S],
            e=counts[State.E],
            i=counts[State.I],
            r=counts[State.R],
            new_s_to_e=len(to_exposed),
            cumulative=self.cumulative,
        )

    def run(self) -> list[DayRecord]:
        counts = self._counts()
        records = [
            DayRecord(
                day=0,
                s=counts[State.S],
                e=counts[State.E],
                i=counts[State.I],
                r=counts[State.R],
                new_s_to_e=0,
                cumulative=self.cumulative,
            )
        ]
        for day in range(1, self.config.days + 1):
            records.append(self.step(day))
        return records


def simulate(graph: Graph, config: SimulationConfig) -> SimulationResult:
    if config.n != graph.n:
        raise ValueError(f"n={config.n} no coincide con el grafo de {graph.n} nodos")
    initial = resolve_initial_sets(config, random.Random(config.seed))
    records = SeirEngine(graph, config, initial).run()
    return SimulationResult(config, graph.average_degree(), tuple(records))
