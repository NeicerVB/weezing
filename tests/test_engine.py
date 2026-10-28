import random
import unittest
from dataclasses import replace

from seir import Graph, SeirEngine, SimulationConfig, resolve_initial_sets, simulate
from seir.config import InitialState
from seir.states import State
from seir.rng import event_uniform


def test_delayed_vaccine_lost_upon_infection():
    graph = Graph.from_edges(2, [(0, 1)])
    config = SimulationConfig(n=2, beta=0, sigma=0, gamma=0, delay=3, i0=1, efficacy=1)
    initial = InitialState(e=frozenset(), i=frozenset({0}), r=frozenset())
    engine = SeirEngine(graph, config, initial)
    assert engine.vaccinate(1, day=0)
    assert not engine.vaccinate(1, day=0)
    engine.step(1)
    assert engine.modifiers[1].is_pending
    engine.config = replace(config, beta=1)
    engine.step(2)
    assert engine.state[1] is State.E
    assert not engine.modifiers[1].is_pending
    engine.step(3)
    assert not engine.modifiers[1].is_vaccinated
    assert sum(engine.doses_by_day.values()) == 1


def test_leaky_vaccine_with_two_infectious_contacts():
    graph = Graph.from_edges(3, [(0,2),(1,2)])
    initial = InitialState(frozenset(), frozenset({0,1}), frozenset())
    for seed in range(100):
        config = SimulationConfig(n=3, beta=.5, sigma=0, gamma=0, efficacy=.8, seed=seed)
        engine = SeirEngine(graph, config, initial)
        engine.vaccinate(2, day=0)
        # Dos contactos: susceptibilidad residual 0.1 por enlace -> 0.19 total.
        expected = int(event_uniform(seed, 1, 2, "s2e") < .19)
        assert engine.step(1).new_s_to_e == expected


def test_exposed_nodes_do_not_transmit_before_next_snapshot():
    graph = Graph.from_edges(2, [(0,1)])
    config = SimulationConfig(n=2, beta=1, sigma=1, gamma=0)
    engine = SeirEngine(graph, config, InitialState(frozenset({0}),frozenset(),frozenset()))
    first = engine.step(1)
    assert (first.s, first.e, first.i, first.new_s_to_e) == (1,0,1,0)
    second = engine.step(2)
    assert (second.s, second.e, second.i, second.new_s_to_e) == (0,1,1,1)


def seeded_graph(n, degree, seed):
    from seir import generate_graph

    return generate_graph(n, degree, random.Random(seed))


class EngineTests(unittest.TestCase):
    def config(self, **changes):
        options = dict(n=30, beta=0.1, sigma=0.2, gamma=0.1, days=10, seed=42, i0=4)
        options.update(changes)
        return SimulationConfig(**options)

    def test_conservation_and_length(self):
        for days, expected in ((0, 1), (10, 11)):
            with self.subTest(days=days):
                graph = seeded_graph(30, 4, 1)
                records = simulate(graph, self.config(days=days)).records
                self.assertEqual(len(records), expected)
                for record in records:
                    self.assertEqual(record.s + record.e + record.i + record.r, 30)

    def test_initial_record_and_cumulative(self):
        graph = seeded_graph(30, 4, 1)
        config = self.config(days=5, e0=2, i0=3, r0=1)
        records = simulate(graph, config).records
        self.assertEqual((records[0].day, records[0].new_s_to_e), (0, 0))
        self.assertEqual((records[0].e, records[0].i, records[0].r), (2, 3, 1))
        self.assertEqual(records[0].cumulative, 5)
        total = 5
        for record in records[1:]:
            total += record.new_s_to_e
            self.assertEqual(record.cumulative, total)

    def test_no_double_transition(self):
        graph = Graph.from_edges(2, [(0, 1)])
        config = SimulationConfig(n=2, beta=1, sigma=1, gamma=0, days=2, i0=1,
                                  init_i=frozenset({1}))
        records = simulate(graph, config).records
        self.assertEqual((records[1].s, records[1].e, records[1].i, records[1].r), (0, 1, 1, 0))
        self.assertEqual((records[2].s, records[2].e, records[2].i, records[2].r), (0, 0, 2, 0))
        self.assertEqual(records[2].cumulative, 2)

    def test_beta_zero_blocks_new_exposures(self):
        graph = seeded_graph(30, 4, 1)
        config = self.config(beta=0)
        for record in simulate(graph, config).records:
            self.assertEqual(record.new_s_to_e, 0)
            self.assertEqual(record.cumulative, 4)

    def test_sigma_zero_keeps_e_non_decreasing(self):
        graph = seeded_graph(30, 4, 1)
        records = simulate(graph, self.config(sigma=0)).records
        self.assertTrue(all(b.e >= a.e for a, b in zip(records, records[1:])))

    def test_gamma_zero_keeps_r_changing_only_by_initial(self):
        graph = seeded_graph(30, 4, 1)
        config = self.config(gamma=0, r0=2)
        records = simulate(graph, config).records
        self.assertTrue(all(record.r == 2 for record in records))

    def test_sigma_and_gamma_one_drain_e_and_i(self):
        graph = Graph.from_edges(3, [(0, 1), (1, 2), (2, 0)])
        config = SimulationConfig(n=3, beta=1, sigma=1, gamma=1, days=1, i0=1,
                                  init_i=frozenset({0}))
        record = simulate(graph, config).records[1]
        self.assertEqual((record.s, record.e, record.i), (0, 2, 0))
        self.assertEqual(record.r, 1, "el nuevo E no debe pasar a I el mismo día")

    def test_hand_checked_triangle(self):
        graph = Graph.from_edges(3, [(0, 1), (1, 2), (2, 0)])
        config = SimulationConfig(n=3, beta=1, sigma=1, gamma=0, days=2, i0=1,
                                  init_i=frozenset({0}))
        records = simulate(graph, config).records
        self.assertEqual((records[0].s, records[0].e, records[0].i, records[0].cumulative), (2, 0, 1, 1))
        self.assertEqual((records[1].s, records[1].e, records[1].i, records[1].cumulative), (0, 2, 1, 3))
        self.assertEqual((records[2].s, records[2].e, records[2].i, records[2].cumulative), (0, 0, 3, 3))

    def test_reproducibility(self):
        graph = seeded_graph(40, 4, 1)
        config = self.config(n=40, days=15, i0=3)
        self.assertEqual(simulate(graph, config).records, simulate(graph, config).records)
        self.assertNotEqual(
            simulate(graph, config).records,
            simulate(graph, self.config(n=40, days=15, i0=3, seed=43)).records,
        )

    def test_iteration_order_does_not_matter(self):
        graph = seeded_graph(30, 4, 1)
        config = self.config(days=8, i0=3)
        initial = resolve_initial_sets(config, random.Random(config.seed))
        reference = SeirEngine(graph, config, initial).run()
        reordered = SeirEngine(graph, config, initial)
        reordered.state = dict(reversed(list(reordered.state.items())))
        self.assertEqual(reference, reordered.run())

    def test_extreme_initial_states(self):
        single = Graph.from_edges(1, [])
        for values, expected in (({"r0": 1}, (0, 0, 0, 1, 0)), ({"i0": 1}, (0, 0, 1, 0, 1))):
            with self.subTest(values=values):
                config = SimulationConfig(n=1, beta=0.5, sigma=0.5, gamma=0.5, days=0, **values)
                (record,) = simulate(single, config).records
                self.assertEqual((record.s, record.e, record.i, record.r, record.cumulative), expected)

    def test_node_transitions_match_daily_counts(self):
        graph = seeded_graph(40, 5, seed=12)
        config = self.config(n=40, days=15, e0=2, i0=3, r0=1, seed=12)
        result = simulate(graph, config)
        payload = result.to_payload()
        self.assertIn("network", payload)
        network = payload["network"]
        self.assertEqual(len(network["nodes"]), 40)
        self.assertEqual(network["edges"], graph.unique_edges())

        # Verificar que el estado deducido para cada nodo en cada día coincida con DayRecord
        for record in result.records:
            day = record.day
            counts = {"S": 0, "E": 0, "I": 0, "R": 0}
            for n_info in network["nodes"]:
                init = n_info["initial"]
                te = n_info["t_e"]
                ti = n_info["t_i"]
                tr = n_info["t_r"]
                if tr is not None and day >= tr:
                    state = "R"
                elif ti is not None and day >= ti:
                    state = "I"
                elif te is not None and day >= te:
                    state = "E"
                else:
                    state = init
                counts[state] += 1
            self.assertEqual(counts["S"], record.s, f"S difiere en día {day}")
            self.assertEqual(counts["E"], record.e, f"E difiere en día {day}")
            self.assertEqual(counts["I"], record.i, f"I difiere en día {day}")
            self.assertEqual(counts["R"], record.r, f"R difiere en día {day}")

    def test_extended_day_record_fields(self):
        graph = seeded_graph(30, 4, 1)
        config = self.config(days=5, i0=2)
        records = simulate(graph, config).records
        for record in records:
            self.assertEqual(record.doses_administered, 0)
            self.assertEqual(record.active_volunteers, 0)
            self.assertEqual(record.volunteer_reinfections, 0)


if __name__ == "__main__":
    unittest.main()
