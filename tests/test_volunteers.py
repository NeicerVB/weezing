"""Pruebas unitarias para vacunación leaky, retraso inmunológico y brigadas de convalecientes."""

import random
import unittest
from dataclasses import replace
from seir.config import InitialState, SimulationConfig
from seir.engine import DayRecord, SeirEngine, simulate
from seir.graph import Graph
from seir.states import State
from seir.topology import generate_manta_graph


class VolunteerAndVaccineTests(unittest.TestCase):
    def test_leaky_vaccine_reduces_susceptibility(self):
        # Dos nodos: 0 (infectado I), 1 (susceptible S)
        graph = Graph.from_edges(2, [(0, 1)])
        # Con beta=1.0, un nodo no vacunado se contagia con prob 1.0
        config_unvac = SimulationConfig(
            n=2, beta=1.0, sigma=0.0, gamma=0.0, days=1, seed=42,
            i0=1, init_i=frozenset({0}), efficacy=0.8, delay=0,
        )
        init_state = InitialState(e=frozenset(), i=frozenset({0}), r=frozenset())
        engine_unvac = SeirEngine(graph, config_unvac, init_state)
        rec_unvac = engine_unvac.step(1)
        self.assertEqual(rec_unvac.new_s_to_e, 1)

        # Ahora el nodo 1 está vacunado con eficacia 1.0 -> 0 contagios
        config_vac_100 = SimulationConfig(
            n=2, beta=1.0, sigma=0.0, gamma=0.0, days=1, seed=42,
            i0=1, init_i=frozenset({0}), efficacy=1.0, delay=0,
        )
        engine_vac_100 = SeirEngine(graph, config_vac_100, init_state)
        engine_vac_100.vaccinate(1, day=0)
        rec_vac_100 = engine_vac_100.step(1)
        self.assertEqual(rec_vac_100.new_s_to_e, 0)
        self.assertEqual(engine_vac_100.state[1], State.S)

    def test_vaccine_delay_and_dose_loss(self):
        graph = Graph.from_edges(2, [(0, 1)])
        # Nodo 1 se vacuna en día 1 con delay=2 -> efectivo en día 3
        config = SimulationConfig(
            n=2, beta=0.0, sigma=0.0, gamma=0.0, days=3, seed=42,
            i0=1, init_i=frozenset({0}), efficacy=0.8, delay=2,
        )
        init_state = InitialState(e=frozenset(), i=frozenset({0}), r=frozenset())
        engine = SeirEngine(graph, config, init_state)
        
        # Vacunar en día 0
        administered = engine.vaccinate(1, day=0)
        self.assertTrue(administered)
        self.assertTrue(engine.modifiers[1].is_pending)
        self.assertFalse(engine.modifiers[1].is_vaccinated)

        # Paso día 1: aún pendiente
        engine.step(1)
        self.assertTrue(engine.modifiers[1].is_pending)
        self.assertFalse(engine.modifiers[1].is_vaccinated)

        # Paso día 2: madura hoy (0 + 2 = 2)
        engine.step(2)
        self.assertFalse(engine.modifiers[1].is_pending)
        self.assertTrue(engine.modifiers[1].is_vaccinated)

        # Ahora probar pérdida de dosis: nodo se contagia antes de madurar la vacuna
        config_loss = SimulationConfig(
            n=2, beta=1.0, sigma=0.0, gamma=0.0, days=2, seed=42,
            i0=1, init_i=frozenset({0}), efficacy=0.8, delay=2,
        )
        engine_loss = SeirEngine(graph, config_loss, init_state)
        engine_loss.vaccinate(1, day=0)
        # En el paso 1, beta=1.0 expone al nodo 1
        rec = engine_loss.step(1)
        self.assertEqual(rec.new_s_to_e, 1)
        self.assertEqual(engine_loss.state[1], State.E)
        # La vacuna pendiente se pierde
        self.assertFalse(engine_loss.modifiers[1].is_vaccinated)
        self.assertFalse(engine_loss.modifiers[1].is_pending)

    def test_volunteer_enlistment_on_recovery(self):
        # 1 nodo en I que pasa a R con prob gamma=1.0
        graph = Graph.from_edges(1, [])
        config = SimulationConfig(
            n=1, beta=0.0, sigma=0.0, gamma=1.0, days=1, seed=42,
            i0=1, init_i=frozenset({0}), p_vol=1.0, p_reinf=0.0,
        )
        init_state = InitialState(e=frozenset(), i=frozenset({0}), r=frozenset())
        engine = SeirEngine(graph, config, init_state)
        record = engine.step(1)

        self.assertEqual(engine.state[0], State.R)
        self.assertTrue(engine.modifiers[0].is_volunteer)
        self.assertEqual(record.active_volunteers, 1)

    def test_volunteer_clean_sector_zero_risk(self):
        # Grafo territorial de Manta: 70 nodos
        t_graph = generate_manta_graph(70, 6.0, random.Random(42))
        # Poner 1 infectado en 'tarqui'
        tarqui_nodes = t_graph.nodes_in_sector("tarqui")
        san_mateo_nodes = t_graph.nodes_in_sector("san_mateo")

        config = SimulationConfig(
            n=70, beta=0.0, sigma=0.0, gamma=0.0, days=1, seed=42,
            i0=1, init_i=frozenset({tarqui_nodes[0]}), p_vol=0.0, p_reinf=1.0,
        )
        init_state = InitialState(e=frozenset(), i=frozenset({tarqui_nodes[0]}), r=frozenset())
        engine = SeirEngine(t_graph.graph, config, init_state, territorial_graph=t_graph)

        # Crear un voluntario artificial en san_mateo (sector limpio donde I=0)
        clean_node = san_mateo_nodes[0]
        engine.state[clean_node] = State.R
        engine.modifiers[clean_node].is_volunteer = True
        engine.modifiers[clean_node].enlistment_count = 1

        # Paso 1 con p_reinf=1.0: en san_mateo no hay infectados, riesgo debe ser estrictamente 0
        record = engine.step(1)
        self.assertEqual(engine.state[clean_node], State.R)
        self.assertTrue(engine.modifiers[clean_node].is_volunteer)
        self.assertEqual(record.volunteer_reinfections, 0)

        # En cambio, si ponemos el voluntario en tarqui (donde tarqui_nodes[0] está infectado)
        active_sector_node = tarqui_nodes[1]
        engine.state[active_sector_node] = State.R
        engine.modifiers[active_sector_node].is_volunteer = True
        engine.modifiers[active_sector_node].enlistment_count = 1

        record2 = engine.step(2)
        # Debe reinfectarse pasando a E y perdiendo rol voluntario
        self.assertEqual(engine.state[active_sector_node], State.E)
        self.assertFalse(engine.modifiers[active_sector_node].is_volunteer)
        self.assertGreaterEqual(record2.volunteer_reinfections, 1)


if __name__ == "__main__":
    unittest.main()


def test_volunteer_zero_reinfection_in_inactive_sector():
    graph = generate_manta_graph(70, 6, random.Random(42))
    infected = graph.nodes_in_sector("tarqui")[0]
    volunteer = graph.nodes_in_sector("san_mateo")[0]
    config = SimulationConfig(n=70, beta=0, sigma=0, gamma=0, p_vol=0, p_reinf=1)
    engine = SeirEngine(graph.graph, config,
        InitialState(frozenset(), frozenset({infected}), frozenset({volunteer})), graph)
    engine.modifiers[volunteer].is_volunteer = True
    engine.modifiers[volunteer].enlistment_count = 1
    for day in range(1, 31):
        row = engine.step(day)
        assert engine.state[volunteer] is State.R
        assert row.volunteer_reinfections == 0


def test_volunteer_lifecycle_allows_at_most_one_reenlistment():
    graph = Graph.from_edges(2, [(0, 1)])
    config = SimulationConfig(n=2, beta=0, sigma=1, gamma=1, p_vol=1, p_reinf=0)
    engine = SeirEngine(graph, config, InitialState(frozenset(), frozenset({0,1}), frozenset()))
    engine.step(1)
    assert engine.modifiers[0].enlistment_count == 1
    for index in range(2):
        # Fuente ocupacional controlada: un caso activo durante cada exposición.
        engine.state[1] = State.I
        engine.modifiers[1].is_volunteer = False
        engine.config = replace(config, gamma=0, p_reinf=1)
        row = engine.step(2 + index * 3)
        assert engine.state[0] is State.E
        assert not engine.modifiers[0].is_volunteer
        assert row.volunteer_reinfections == 1
        assert row.new_s_to_e == 0  # R->E no es S->E.
        engine.config = replace(config, gamma=0)
        engine.step(3 + index * 3)
        assert engine.state[0] is State.I
        engine.config = config
        engine.step(4 + index * 3)
        assert engine.state[0] is State.R
    assert engine.modifiers[0].enlistment_count == 2
    assert not engine.modifiers[0].is_volunteer
