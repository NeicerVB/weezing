"""Pruebas unitarias para estrategias de intervención, paridad de dosis y R0."""

import random
import unittest
from seir.config import SimulationConfig
from seir.strategies import (
    compute_dynamic_quota,
    compute_r0,
    run_paired_simulation,
)
from seir.topology import SECTORS, TerritorialGraph, generate_manta_graph
from seir.graph import Graph
from seir.engine import SeirEngine
from seir.config import InitialState
from seir.strategies import _select_proposed_candidates


def test_zero_infection_edge_case():
    graph = generate_manta_graph(70, 6, random.Random(42))
    config = SimulationConfig(n=70, beta=.03, sigma=.2, gamma=.1, days=20)
    data = run_paired_simulation(graph, config, frozenset(), "dynamic", 30, 28, .8, 3, .12, .04)
    for strategy in data["strategies"].values():
        assert strategy["metrics"]["doses_spent"] == 0
        for row in strategy["days"]:
            assert (row["s"], row["e"], row["i"], row["r"], row["cumulative"]) == (70, 0, 0, 0, 0)
    assert data["meta"]["r0"] >= 0  # R0 depende de beta/grado/gamma, no del I0.


def test_susceptible_depletion_cascades_to_hubs():
    graph = TerritorialGraph(
        graph=Graph.from_edges(11, [(0,1),(0,2),(0,3),(1,4),(4,5),(4,6),(0,7),(7,8),(7,9),(9,10)]),
        sectors=("tarqui",)*4 + ("eloy_alfaro",)*2 + tuple(SECTORS[2:]),
        hubs=frozenset({2,4,6,7,8,9,10}), labels=tuple(str(i) for i in range(11)),
        coords=tuple((float(i), 0.) for i in range(11)))
    config = SimulationConfig(n=11, beta=0, sigma=0, gamma=0, i0=1)
    engine = SeirEngine(graph.graph, config, InitialState(frozenset(),frozenset({0}),frozenset()),graph)
    chosen = _select_proposed_candidates(graph, engine, 20)
    assert chosen[:2] == [1, 2]  # frontera y hub interno
    assert chosen.index(3) < chosen.index(4)  # anillo antes que hub preventivo
    assert 4 in chosen  # reinversión en hub de otro sector
    assert 5 not in chosen  # no gastar sobrantes en un nodo arbitrario sin prioridad
    assert len(chosen) == len(set(chosen)) == 9


def test_avoided_infections_preserves_negative_paired_difference():
    from seir.app import simulate_request
    data = simulate_request({"n":70,"days":60,"seed":121,"beta":.03,
        "initial":{"tarqui":1},"intervention":{"mode":"static","quota":1,"k_max":28}})
    none = data["strategies"]["none"]["metrics"]["cumulative_infections"]
    assert data["strategies"]["random"]["metrics"]["avoided_infections"] == -5
    for strategy in data["strategies"].values():
        metrics = strategy["metrics"]
        assert metrics["avoided_infections"] == none - metrics["cumulative_infections"]


class StrategyTests(unittest.TestCase):
    def test_compute_r0(self):
        # beta=0.03, k=8.0, gamma=0.1 -> R0 = 2.4
        r0 = compute_r0(beta=0.03, average_degree=8.0, gamma=0.1)
        self.assertAlmostEqual(r0, 2.4, places=4)

        # beta=0 -> R0 = 0.0
        self.assertEqual(compute_r0(beta=0.0, average_degree=8.0, gamma=0.1), 0.0)

        # gamma=0 -> División segura sin excepción numérica
        r0_inf = compute_r0(beta=0.03, average_degree=8.0, gamma=0.0)
        self.assertTrue(r0_inf == float("inf") or r0_inf >= 1e9)

    def test_compute_dynamic_quota_bounds(self):
        n = 1000
        # Caso 0 activos: cuota mínima clamp 0.015 * 1000 = 15
        q_min = compute_dynamic_quota(n=n, active_i=0, active_e=0)
        self.assertEqual(q_min, 15)

        # Caso brote masivo: cuota máxima clamp 0.05 * 1000 = 50
        q_max = compute_dynamic_quota(n=n, active_i=800, active_e=200)
        self.assertEqual(q_max, 50)

        # Caso intermedio: proporcional y dentro de [15, 50]
        for active in (10, 50, 100, 200):
            q = compute_dynamic_quota(n=n, active_i=active, active_e=0)
            self.assertTrue(15 <= q <= 50, f"Cuota {q} fuera de rango para {active} activos")

    def test_strict_dose_parity_and_conservation(self):
        n = 140
        t_graph = generate_manta_graph(n, 6.0, random.Random(42))
        tarqui_nodes = t_graph.nodes_in_sector("tarqui")
        initial_infections = frozenset(tarqui_nodes[:3])

        config = SimulationConfig(
            n=n,
            beta=0.06,
            sigma=0.2,
            gamma=0.1,
            days=25,
            seed=42,
            i0=len(initial_infections),
            init_i=initial_infections,
        )

        result = run_paired_simulation(
            t_graph=t_graph,
            config=config,
            initial_infections=initial_infections,
            intervention_mode="dynamic",
            quota=10,
            k_max=50,
            efficacy=0.8,
            delay=0,
            p_vol=0.12,
            p_reinf=0.04,
            include_frames=False,
        )

        strategies = result["strategies"]
        prop_metrics = strategies["proposed"]["metrics"]
        rand_metrics = strategies["random"]["metrics"]
        none_metrics = strategies["none"]["metrics"]

        # Paridad estricta de dosis gastadas
        self.assertEqual(
            prop_metrics["doses_spent"],
            rand_metrics["doses_spent"],
            "Proposed y Random deben gastar exactamente las mismas dosis"
        )
        self.assertEqual(none_metrics["doses_spent"], 0)

        # Paridad día a día
        prop_days = strategies["proposed"]["days"]
        rand_days = strategies["random"]["days"]
        self.assertEqual(len(prop_days), len(rand_days))
        for d_prop, d_rand in zip(prop_days, rand_days):
            self.assertEqual(
                d_prop["doses_administered"],
                d_rand["doses_administered"],
                f"Disparidad de dosis en el día {d_prop['day']}"
            )
            # Conservación S + E + I + R = N
            self.assertEqual(d_prop["s"] + d_prop["e"] + d_prop["i"] + d_prop["r"], n)
            self.assertEqual(d_rand["s"] + d_rand["e"] + d_rand["i"] + d_rand["r"], n)

        # Tope global K_max respetado
        self.assertLessEqual(prop_metrics["doses_spent"], 50)
        self.assertLessEqual(rand_metrics["doses_spent"], 50)

    def test_k_max_zero_curves_coincide(self):
        n = 70
        t_graph = generate_manta_graph(n, 6.0, random.Random(10))
        initial = frozenset([0, 1])
        config = SimulationConfig(
            n=n, beta=0.05, sigma=0.2, gamma=0.1, days=15, seed=10,
            i0=2, init_i=initial,
        )

        result = run_paired_simulation(
            t_graph=t_graph,
            config=config,
            initial_infections=initial,
            intervention_mode="static",
            quota=10,
            k_max=0,  # Sin vacunas
            efficacy=0.8,
            delay=0,
            p_vol=0.0,
            p_reinf=0.0,
        )

        # Con K_max = 0, todas las estrategias deben ser numéricamente idénticas
        p_days = result["strategies"]["proposed"]["days"]
        r_days = result["strategies"]["random"]["days"]
        n_days = result["strategies"]["none"]["days"]
        for p, r, none in zip(p_days, r_days, n_days):
            self.assertEqual((p["s"], p["e"], p["i"], p["r"]), (none["s"], none["e"], none["i"], none["r"]))
            self.assertEqual((r["s"], r["e"], r["i"], r["r"]), (none["s"], none["e"], none["i"], none["r"]))

    def test_proposed_strategy_impact(self):
        n = 140
        t_graph = generate_manta_graph(n, 6.0, random.Random(42))
        tarqui_nodes = t_graph.nodes_in_sector("tarqui")
        initial = frozenset(tarqui_nodes[:4])
        config = SimulationConfig(
            n=n, beta=0.06, sigma=0.2, gamma=0.1, days=30, seed=42,
            i0=len(initial), init_i=initial,
        )

        result = run_paired_simulation(
            t_graph=t_graph,
            config=config,
            initial_infections=initial,
            intervention_mode="dynamic",
            quota=10,
            k_max=50,
            efficacy=0.85,
            delay=0,
            p_vol=0.12,
            p_reinf=0.04,
        )

        prop_metrics = result["strategies"]["proposed"]["metrics"]
        none_metrics = result["strategies"]["none"]["metrics"]
        rand_metrics = result["strategies"]["random"]["metrics"]

        # Contagios evitados positivos
        self.assertGreater(prop_metrics["avoided_infections"], 0)
        # Menor pico que Do Nothing
        self.assertLessEqual(prop_metrics["peak_i"], none_metrics["peak_i"])
        # Propuesta debe igualar o superar a random en contagios evitados
        self.assertGreaterEqual(prop_metrics["avoided_infections"], rand_metrics["avoided_infections"])

    def test_frames_option(self):
        n = 70
        t_graph = generate_manta_graph(n, 6.0, random.Random(7))
        initial = frozenset([0])
        config = SimulationConfig(
            n=n, beta=0.05, sigma=0.2, gamma=0.1, days=5, seed=7,
            i0=1, init_i=initial,
        )

        res_no_frames = run_paired_simulation(
            t_graph, config, initial, "static", 5, 20, 0.8, 0, 0.0, 0.0, include_frames=False
        )
        self.assertIsNone(res_no_frames["frames"])

        res_with_frames = run_paired_simulation(
            t_graph, config, initial, "static", 5, 20, 0.8, 0, 0.0, 0.0, include_frames=True
        )
        self.assertIsNotNone(res_with_frames["frames"])
        self.assertIsInstance(res_with_frames["frames"], list)


if __name__ == "__main__":
    unittest.main()
