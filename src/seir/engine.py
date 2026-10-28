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
    graph: Graph | None = None
    initial_states: dict[int, str] | None = None
    transition_e: dict[int, int] | None = None
    transition_i: dict[int, int] | None = None
    transition_r: dict[int, int] | None = None

    def to_rows(self) -> list[dict]:
        return [asdict(record) for record in self.records]

    def to_payload(self) -> dict:
        meta = asdict(self.config)
        for name in ("init_e", "init_i", "init_r"):
            if meta[name] is not None:
                meta[name] = sorted(meta[name])
        meta["average_degree"] = round(self.average_degree, 6)
        payload = {"meta": meta, "days": self.to_rows()}
        if self.graph is not None:
            init = self.initial_states or {}
            te = self.transition_e or {}
            ti = self.transition_i or {}
            tr = self.transition_r or {}
            nodes = [
                {
                    "id": node,
                    "initial": init.get(node, "S"),
                    "t_e": te.get(node),
                    "t_i": ti.get(node),
                    "t_r": tr.get(node),
                }
                for node in self.graph.nodes
            ]
            payload["network"] = {
                "edges": self.graph.unique_edges(),
                "nodes": nodes,
            }
        return payload


class SeirEngine:
    def __init__(self, graph: Graph, config: SimulationConfig, initial_state: InitialState) -> None:
        self.graph = graph
        self.config = config
        self.state = {node: State.S for node in graph.nodes}
        self.initial_states = {node: "S" for node in graph.nodes}
        self.transition_e: dict[int, int] = {}
        self.transition_i: dict[int, int] = {}
        self.transition_r: dict[int, int] = {}
        for node in initial_state.e:
            self.state[node] = State.E
            self.initial_states[node] = "E"
            self.transition_e[node] = 0
        for node in initial_state.i:
            self.state[node] = State.I
            self.initial_states[node] = "I"
            self.transition_i[node] = 0
        for node in initial_state.r:
            self.state[node] = State.R
            self.initial_states[node] = "R"
            self.transition_r[node] = 0
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
            self.transition_e[node] = day
        for node in to_infectious:
            self.state[node] = State.I
            self.transition_i[node] = day
        for node in to_removed:
            self.state[node] = State.R
            self.transition_r[node] = day
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
    engine = SeirEngine(graph, config, initial)
    records = engine.run()
    return SimulationResult(
        config=config,
        average_degree=graph.average_degree(),
        records=tuple(records),
        graph=graph,
        initial_states=engine.initial_states,
        transition_e=engine.transition_e,
        transition_i=engine.transition_i,
        transition_r=engine.transition_r,
    )

