"""Protocolo dinámico de contención en 3 pasos, líneas base con paridad de dosis y métricas epidemiológicas."""

import random
from dataclasses import asdict
from typing import Any

from .config import InitialState, SimulationConfig
from .engine import DayRecord, SeirEngine
from .states import State
from .topology import SECTORS, TerritorialGraph


def compute_r0(beta: float, average_degree: float, gamma: float) -> float:
    """Calcula analíticamente el número básico de reproducción R0 = beta * <k> / gamma."""
    if beta == 0.0 or average_degree == 0.0:
        return 0.0
    if gamma <= 0.0:
        return float("inf")
    return round((beta * average_degree) / gamma, 4)


def compute_dynamic_quota(n: int, active_i: int, active_e: int) -> int:
    """Calcula deterministamente la cuota diaria flotante según la carga de casos activos."""
    if n <= 0:
        return 0
    activos = active_i + 0.5 * active_e
    fraction = 0.015 + 0.7 * (activos / n)
    clamped = min(0.05, max(0.015, fraction))
    return round(clamped * n)


def _is_eligible_for_vaccine(engine: SeirEngine, node: int) -> bool:
    mod = engine.modifiers[node]
    return engine.state[node] is State.S and not mod.is_vaccinated and not mod.is_pending


def _select_proposed_candidates(
    t_graph: TerritorialGraph,
    engine: SeirEngine,
    quota: int,
) -> list[int]:
    """Selecciona hasta `quota` candidatos siguiendo el Protocolo en 3 Pasos con Cascada y Regla de Sobrantes."""
    if quota <= 0:
        return []

    # 1. Identificar y ordenar sectores activos por carga viral descendente (I + 0.5E)
    sector_loads: dict[str, float] = {}
    for s in SECTORS:
        nodes = t_graph.nodes_in_sector(s)
        i_count = sum(1 for u in nodes if engine.state[u] is State.I)
        e_count = sum(1 for u in nodes if engine.state[u] is State.E)
        sector_loads[s] = i_count + 0.5 * e_count

    active_sectors = [s for s in SECTORS if sector_loads[s] > 0]
    if not active_sectors:
        return []
    # Desempate determinista por carga desc, nombre asc
    active_sectors.sort(key=lambda s: (-sector_loads[s], s))

    selected: list[int] = []
    seen: set[int] = set()

    def try_add(node: int) -> bool:
        if len(selected) < quota and node not in seen and _is_eligible_for_vaccine(engine, node):
            selected.append(node)
            seen.add(node)
            return True
        return False

    # Paso 1 (Freno Macro): Nodos frontera (puentes) del sector activo
    for s in active_sectors:
        boundary = [u for u in t_graph.boundary_nodes(s) if _is_eligible_for_vaccine(engine, u)]
        boundary.sort(key=lambda u: (-t_graph.graph.degree(u), u))
        for u in boundary:
            try_add(u)
            if len(selected) >= quota:
                return selected

    # Paso 2 (Freno Interno): Hubs internos del sector activo
    for s in active_sectors:
        hubs = [u for u in t_graph.hubs_in_sector(s) if _is_eligible_for_vaccine(engine, u)]
        hubs.sort(key=lambda u: (-t_graph.graph.degree(u), u))
        for u in hubs:
            try_add(u)
            if len(selected) >= quota:
                return selected

    # Paso 3 (Anillo Micro): Vecinos directos de casos I en el sector activo
    for s in active_sectors:
        inf_nodes = [u for u in t_graph.nodes_in_sector(s) if engine.state[u] is State.I]
        dist1 = set()
        for inf_node in inf_nodes:
            for neighbor in t_graph.graph.neighbors(inf_node):
                if _is_eligible_for_vaccine(engine, neighbor):
                    dist1.add(neighbor)
        sorted_dist1 = sorted(dist1, key=lambda u: (-t_graph.graph.degree(u), u))
        for u in sorted_dist1:
            try_add(u)
            if len(selected) >= quota:
                return selected

        # Brigadistas amplían la profundidad a distancia 2 si están activos en el sector
        volunteers_in_sec = [
            u for u in t_graph.nodes_in_sector(s) if engine.modifiers[u].is_volunteer
        ]
        if volunteers_in_sec:
            dist2 = set()
            for d1_node in dist1:
                for neighbor in t_graph.graph.neighbors(d1_node):
                    if neighbor not in dist1 and _is_eligible_for_vaccine(engine, neighbor):
                        dist2.add(neighbor)
            sorted_dist2 = sorted(dist2, key=lambda u: (-t_graph.graph.degree(u), u))
            for u in sorted_dist2:
                try_add(u)
                if len(selected) >= quota:
                    return selected

    # Regla de Sobrantes: Hubs preventivos de otros sectores
    non_active = [s for s in SECTORS if s not in active_sectors]
    for s in non_active:
        hubs = [u for u in t_graph.hubs_in_sector(s) if _is_eligible_for_vaccine(engine, u)]
        hubs.sort(key=lambda u: (-t_graph.graph.degree(u), u))
        for u in hubs:
            try_add(u)
            if len(selected) >= quota:
                return selected

    return selected


def run_paired_simulation(
    t_graph: TerritorialGraph,
    config: SimulationConfig,
    initial_infections: frozenset[int],
    intervention_mode: str,
    quota: int,
    k_max: int,
    efficacy: float,
    delay: int,
    p_vol: float,
    p_reinf: float,
    include_frames: bool = False,
) -> dict[str, Any]:
    """Ejecuta sincrónicamente las tres estrategias emparejadas con paridad estricta de dosis administradas."""
    n = t_graph.graph.n
    initial_state = InitialState(
        e=frozenset(),
        i=initial_infections,
        r=frozenset(),
    )

    # 1. Configuración adaptada con parámetros tácticos
    sim_config = SimulationConfig(
        n=n,
        beta=config.beta,
        sigma=config.sigma,
        gamma=config.gamma,
        days=config.days,
        seed=config.seed,
        i0=len(initial_infections),
        init_i=initial_infections,
        efficacy=efficacy,
        delay=delay,
        p_vol=p_vol,
        p_reinf=p_reinf,
    )

    # 2. Instanciar los tres motores con el mismo estado inicial y topología
    engine_prop = SeirEngine(t_graph.graph, sim_config, initial_state, territorial_graph=t_graph)
    engine_rand = SeirEngine(t_graph.graph, sim_config, initial_state, territorial_graph=t_graph)
    engine_none = SeirEngine(t_graph.graph, sim_config, initial_state, territorial_graph=t_graph)

    # Generador pseudoaleatorio aislado para la selección al azar
    rng_random = random.Random(f"{config.seed}:random_pick")

    # Registros día 0
    c_prop = engine_prop._counts()
    records_prop = [
        DayRecord(0, c_prop[State.S], c_prop[State.E], c_prop[State.I], c_prop[State.R], 0, engine_prop.cumulative)
    ]
    c_rand = engine_rand._counts()
    records_rand = [
        DayRecord(0, c_rand[State.S], c_rand[State.E], c_rand[State.I], c_rand[State.R], 0, engine_rand.cumulative)
    ]
    c_none = engine_none._counts()
    records_none = [
        DayRecord(0, c_none[State.S], c_none[State.E], c_none[State.I], c_none[State.R], 0, engine_none.cumulative)
    ]

    total_doses_prop = 0
    frames: list[dict[str, Any]] | None = [] if include_frames else None

    # Función auxiliar para registrar snapshot de visualización
    def node_visual_state(engine: SeirEngine, node: int) -> str:
        mod = engine.modifiers[node]
        if mod.is_volunteer:
            return "V_brigade"
        return engine.state[node].value

    prev_visual_states = [node_visual_state(engine_prop, u) for u in range(n)] if include_frames else []

    # 3. Bucle sincrónico día a día
    for day in range(1, config.days + 1):
        # A. Estrategia propuesta: calcular cuota y vacunar
        remaining_budget = max(0, k_max - total_doses_prop)
        if remaining_budget > 0:
            if intervention_mode == "dynamic":
                act_i = records_prop[-1].i
                act_e = records_prop[-1].e
                daily_quota = min(compute_dynamic_quota(n, act_i, act_e), remaining_budget)
            else:
                daily_quota = min(quota, remaining_budget)

            # La comparación emparejada no puede gastar más dosis que las
            # disponibles en cualquiera de las dos poblaciones susceptibles.
            available_random = sum(_is_eligible_for_vaccine(engine_rand, u) for u in range(n))
            daily_quota = min(daily_quota, available_random)
            candidates_prop = _select_proposed_candidates(t_graph, engine_prop, daily_quota)
            doses_administered_today = engine_prop.vaccinate_nodes(candidates_prop, day)
        else:
            doses_administered_today = 0

        total_doses_prop += doses_administered_today
        rec_prop = engine_prop.step(day)
        records_prop.append(rec_prop)

        # B. Estrategia al azar: paridad estricta de dosis gastadas
        if doses_administered_today > 0:
            eligible_rand = [
                u for u in range(n) if _is_eligible_for_vaccine(engine_rand, u)
            ]
            eligible_rand.sort()  # Orden canónico antes de sample
            doses_to_sample = min(doses_administered_today, len(eligible_rand))
            candidates_rand = rng_random.sample(eligible_rand, doses_to_sample)
            engine_rand.vaccinate_nodes(candidates_rand, day)

        rec_rand = engine_rand.step(day)
        records_rand.append(rec_rand)

        # C. Do Nothing: cero intervenciones
        rec_none = engine_none.step(day)
        records_none.append(rec_none)

        # D. Registro de diferencias de animación si include_frames es True
        if include_frames and frames is not None:
            curr_visual_states = [node_visual_state(engine_prop, u) for u in range(n)]
            changed = []
            for u in range(n):
                if curr_visual_states[u] != prev_visual_states[u]:
                    changed.append({"id": u, "state": curr_visual_states[u]})
            frames.append({"day": day, "changed": changed})
            prev_visual_states = curr_visual_states

    # 4. Cálculo de métricas
    def compute_metrics(
        records: list[DayRecord],
        is_prop: bool = False,
    ) -> dict[str, Any]:
        doses_spent = sum(r.doses_administered for r in records)
        cum_inf = records[-1].cumulative
        peak_i = max(r.i for r in records)
        peak_day = next(r.day for r in records if r.i == peak_i)
        avoided = records_none[-1].cumulative - cum_inf

        metrics: dict[str, Any] = {
            "doses_spent": doses_spent,
            "cumulative_infections": cum_inf,
            "peak_i": peak_i,
            "peak_day": peak_day,
            "avoided_infections": avoided,
        }
        if is_prop:
            metrics["active_volunteers"] = records[-1].active_volunteers
            metrics["volunteer_reinfections"] = sum(r.volunteer_reinfections for r in records)
        return metrics

    r0_val = compute_r0(config.beta, t_graph.graph.average_degree(), config.gamma)

    return {
        "meta": {
            "n": n,
            "days": config.days,
            "seed": config.seed,
            "average_degree": round(t_graph.graph.average_degree(), 4),
            "sectors": list(SECTORS),
            "r0": r0_val,
            "effective": {
                "beta": config.beta,
                "sigma": config.sigma,
                "gamma": config.gamma,
                "quota": quota,
                "k_max": k_max,
            },
        },
        "strategies": {
            "proposed": {
                "days": [asdict(r) for r in records_prop],
                "metrics": compute_metrics(records_prop, is_prop=True),
            },
            "random": {
                "days": [asdict(r) for r in records_rand],
                "metrics": compute_metrics(records_rand, is_prop=False),
            },
            "none": {
                "days": [asdict(r) for r in records_none],
                "metrics": {
                    "doses_spent": 0,
                    "cumulative_infections": records_none[-1].cumulative,
                    "peak_i": max(r.i for r in records_none),
                    "peak_day": next(r.day for r in records_none if r.i == max(r.i for r in records_none)),
                    "avoided_infections": 0,
                },
            },
        },
        "frames": frames if include_frames else None,
    }
