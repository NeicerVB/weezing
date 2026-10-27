import unittest

from seir import SimulationConfig


class ConfigTests(unittest.TestCase):
    def test_initial_counts_and_defaults(self):
        config = SimulationConfig(n=9, days=0, beta=0, sigma=1, gamma=1, e0=2, i0=3, r0=1)
        self.assertEqual(config.s0, 3)
        self.assertEqual(config.seed, 0)

    def test_invalid_counts(self):
        common = dict(n=3, days=0, beta=0, sigma=0, gamma=0)
        for changes in ({"n": 0}, {"days": -1}, {"e0": -1}, {"e0": 2, "i0": 2}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                SimulationConfig(**(common | changes))

    def test_invalid_probabilities(self):
        common = dict(n=1, days=0, beta=0, sigma=0, gamma=0)
        for field in ("beta", "sigma", "gamma"):
            for value in (-0.1, 1.1, float("nan"), float("inf")):
                with self.subTest(field=field, value=value), self.assertRaisesRegex(ValueError, field):
                    SimulationConfig(**(common | {field: value}))


if __name__ == "__main__":
    unittest.main()
