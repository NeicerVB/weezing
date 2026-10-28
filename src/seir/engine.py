"""Autómata SEIR que avanza un paso por día sobre la topología real."""

import random
from collections import Counter
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING

from .config import InitialState, SimulationConfig, resolve_initial_sets
from .graph import Graph
from .rng import event_uniform
from .states import NodeModifier, State

if TYPE_CHECKING:
    from .topology import TerritorialGraph


@dataclass(frozen=True)
class DayRecord:
    day: int
    s: int
    e: int
    i: int
    r: int
    new_s_to_e: int
    cumulative: int
    doses_administered: int = 0
    active_volunteers: int = 0
    volunteer_reinfections: int = 0


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
    def __init__(
        self,
        graph: Graph,
        config: SimulationConfig,
        initial_state: InitialState,
        territorial_graph: "TerritorialGraph | None" = None,
    ) -> None:
        self.graph = graph
        self.config = config
        self.territorial_graph = territorial_graph
        self.state = {node: State.S for node in graph.nodes}
        self.modifiers = {node: NodeModifier() for node in graph.nodes}
        self.initial_states = {node: "S" for node in graph.nodes}
        self.transition_e: dict[int, int] = {}
        self.transition_i: dict[int, int] = {}
        self.transition_r: dict[int, int] = {}
        self.doses_by_day: dict[int, int] = {}

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

    def vaccinate(self, node: int, day: int) -> bool:
        """Intenta administrar una dosis al nodo en el día dado.
        
        Solo se vacuna si el nodo está en estado S, no está vacunado y no tiene vacuna pendiente.
        Si config.delay == 0, se inmuniza inmediatamente.
        Si config.delay > 0, queda pendiente hasta day + config.delay.
        """
        if self.state[node] is not State.S:
            return False
        mod = self.modifiers[node]
        if mod.is_vaccinated or mod.is_pending:
            return False
        if self.config.delay == 0:
            mod.is_vaccinated = True
        else:
            mod.pending_vaccine_day = day + self.config.delay
        self.doses_by_day[day] = self.doses_by_day.get(day, 0) + 1
        return True

    def vaccinate_nodes(self, nodes: Iterable[int], day: int) -> int:
        """Vacuna los nodos elegibles y retorna el total de dosis administradas."""
        count = 0
        for node in nodes:
            if self.vaccinate(node, day):
                count += 1
        return count

    def step(self, day: int) -> DayRecord:
        # 1. Maduración de vacunas pendientes
        for node, mod in self.modifiers.items():
            if mod.is_pending and mod.pending_vaccine_day == day:
                if self.state[node] is State.S:
                    mod.is_vaccinated = True
                mod.pending_vaccine_day = None

        snapshot = self.state.copy()
        infectious = {node for node, state in snapshot.items() if state is State.I}
        config = self.config
        to_exposed: set[int] = set()
        to_infectious: set[int] = set()
        to_removed: set[int] = set()
        to_reinfected: set[int] = set()

        infectious_by_sector: dict[str, int] = {}
        if self.territorial_graph is not None:
            for inf_node in infectious:
                sec = self.territorial_graph.sectors[inf_node]
                infectious_by_sector[sec] = infectious_by_sector.get(sec, 0) + 1

        for node, state in snapshot.items():
            mod = self.modifiers[node]
            if state is State.S:
                exposed = sum(1 for neighbor in self.graph.adjacency[node] if neighbor in infectious)
                if exposed:
                    if mod.is_vaccinated:
                        eff_beta = (1.0 - config.efficacy) * config.beta
                        probability = 1.0 - (1.0 - eff_beta) ** exposed
                    else:
                        probability = 1.0 - (1.0 - config.beta) ** exposed
                    if event_uniform(config.seed, day, node, "s2e") < probability:
                        to_exposed.add(node)
                        if mod.is_pending:
                            mod.pending_vaccine_day = None
            elif state is State.E:
                if event_uniform(config.seed, day, node, "e2i") < config.sigma:
                    to_infectious.add(node)
            elif state is State.I:
                if event_uniform(config.seed, day, node, "i2r") < config.gamma:
                    to_removed.add(node)
            elif state is State.R and mod.is_volunteer:
                if self.territorial_graph is not None:
                    sec = self.territorial_graph.sectors[node]
                    sector_has_i = infectious_by_sector.get(sec, 0) > 0
                else:
                    sector_has_i = len(infectious) > 0

                if sector_has_i and config.p_reinf > 0.0:
                    if event_uniform(config.seed, day, node, "volunteer_reinf") < config.p_reinf:
                        to_reinfected.add(node)

        # Aplicación simultánea de transiciones
        for node in to_exposed:
            self.state[node] = State.E
            self.transition_e[node] = day
        for node in to_infectious:
            self.state[node] = State.I
            self.transition_i[node] = day
        for node in to_removed:
            self.state[node] = State.R
            self.transition_r[node] = day
            mod = self.modifiers[node]
            if mod.enlistment_count < 2 and config.p_vol > 0.0:
                tag = f"volunteer_{mod.enlistment_count}"
                if event_uniform(config.seed, day, node, tag) < config.p_vol:
                    mod.is_volunteer = True
                    mod.enlistment_count += 1
        for node in to_reinfected:
            self.modifiers[node].is_volunteer = False
            self.state[node] = State.E
            self.transition_e[node] = day

        new_infections = len(to_exposed) + len(to_reinfected)
        self.cumulative += new_infections

        counts = self._counts()
        total = sum(counts.values())
        assert total == self.graph.n, f"se conservaron {total} de {self.graph.n} nodos"

        active_volunteers = sum(1 for m in self.modifiers.values() if m.is_volunteer)
        return DayRecord(
            day=day,
            s=counts[State.S],
            e=counts[State.E],
            i=counts[State.I],
            r=counts[State.R],
            new_s_to_e=new_infections,
            cumulative=self.cumulative,
            doses_administered=self.doses_by_day.get(day, 0),
            active_volunteers=active_volunteers,
            volunteer_reinfections=len(to_reinfected),
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
                doses_administered=self.doses_by_day.get(0, 0),
                active_volunteers=sum(1 for m in self.modifiers.values() if m.is_volunteer),
                volunteer_reinfections=0,
            )
        ]
        for day in range(1, self.config.days + 1):
            records.append(self.step(day))
        return records


def simulate(
    graph: Graph,
    config: SimulationConfig,
    territorial_graph: "TerritorialGraph | None" = None,
) -> SimulationResult:
    if config.n != graph.n:
        raise ValueError(f"n={config.n} no coincide con el grafo de {graph.n} nodos")
    initial = resolve_initial_sets(config, random.Random(config.seed))
    engine = SeirEngine(graph, config, initial, territorial_graph=territorial_graph)
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
