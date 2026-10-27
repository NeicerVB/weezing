import unittest

from seir import SimulationConfig, simulate


class EngineTests(unittest.TestCase):
    def config(self, **changes):
        options = dict(n=30, days=10, beta=0.6, sigma=0.3, gamma=0.2, seed=42, e0=2, i0=4, r0=1)
        options.update(changes)
        return SimulationConfig(**options)

    def test_conservation_and_accumulation(self):
        config = self.config()
        records = simulate(config).records
        self.assertEqual(len(records), 11)
        self.assertEqual(records[0].new_s_to_e, 0)
        self.assertEqual(records[0].cumulative, config.e0 + config.i0)
        cumulative = config.e0 + config.i0
        for record in records:
            self.assertEqual(record.s + record.e + record.i + record.r, config.n)
            cumulative += record.new_s_to_e
            self.assertEqual(record.cumulative, cumulative)

    def test_simultaneous_transitions(self):
        config = self.config(n=2, days=2, beta=1, sigma=1, gamma=1, e0=0, i0=1, r0=0, seed=1)
        initial, first, second = simulate(config).records
        self.assertEqual((initial.s, initial.e, initial.i, initial.r), (1, 0, 1, 0))
        self.assertEqual((first.s, first.e, first.i, first.r), (0, 1, 0, 1))
        self.assertEqual((second.s, second.e, second.i, second.r), (0, 0, 1, 1))
        self.assertEqual(second.cumulative, 2)

    def test_boundary_probabilities(self):
        records = simulate(self.config(beta=0, sigma=0, gamma=0)).records
        self.assertTrue(all(row.new_s_to_e == 0 and row.cumulative == 6 for row in records))
        self.assertTrue(all((row.e, row.i, row.r) == (2, 4, 1) for row in records))

    def test_zero_days_and_extreme_initial_states(self):
        for values, expected in (({"r0": 1}, (0, 0, 0, 1, 0)), ({"i0": 1}, (0, 0, 1, 0, 1))):
            with self.subTest(values=values):
                config = SimulationConfig(n=1, days=0, beta=0, sigma=0, gamma=0, **values)
                (row,) = simulate(config).records
                self.assertEqual((row.s, row.e, row.i, row.r, row.cumulative), expected)

    def test_seed_reproducibility(self):
        config = self.config()
        self.assertEqual(simulate(config).records, simulate(config).records)
        self.assertNotEqual(simulate(config).records, simulate(self.config(seed=43)).records)


if __name__ == "__main__":
    unittest.main()
