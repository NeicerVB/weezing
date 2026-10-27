import random
import unittest

from seir import SimulationConfig, resolve_initial_sets


class ConfigTests(unittest.TestCase):
    def config(self, **changes):
        options = dict(n=10, beta=0.1, sigma=0.2, gamma=0.1, days=0)
        options.update(changes)
        return SimulationConfig(**options)

    def test_derived_s0(self):
        for values, expected in (
            ({"n": 10}, 10),
            ({"n": 10, "e0": 2}, 8),
            ({"n": 10, "e0": 2, "i0": 3, "r0": 1}, 4),
            ({"n": 3, "i0": 3}, 0),
        ):
            with self.subTest(values=values):
                self.assertEqual(self.config(**values).s0, expected)

    def test_invalid_counts(self):
        for changes in ({"e0": 11}, {"e0": 4, "i0": 4, "r0": 3}, {"i0": -1}, {"days": -1}, {"n": 0}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.config(**changes)

    def test_invalid_probabilities(self):
        for field in ("beta", "sigma", "gamma"):
            for value in (-0.1, 1.1, float("nan"), float("inf")):
                with self.subTest(field=field, value=value), self.assertRaisesRegex(ValueError, field):
                    self.config(**{field: value})

    def test_manual_sets_accepted(self):
        config = self.config(e0=2, i0=1, r0=1, init_e=frozenset({1, 2}),
                             init_i=frozenset({3}), init_r=frozenset({4}))
        initial = resolve_initial_sets(config, random.Random(0))
        self.assertEqual((initial.e, initial.i, initial.r), (frozenset({1, 2}), frozenset({3}), frozenset({4})))

    def test_overlapping_manual_sets_rejected(self):
        config = self.config(e0=1, i0=1, init_e=frozenset({1}), init_i=frozenset({1}))
        with self.assertRaises(ValueError):
            resolve_initial_sets(config, random.Random(0))

    def test_incomplete_manual_set_rejected(self):
        with self.assertRaises(ValueError):
            self.config(e0=2, init_e=frozenset({1}))

    def test_random_selection_is_reproducible_and_sized(self):
        config = self.config(e0=2, i0=3, r0=1)
        first = resolve_initial_sets(config, random.Random(42))
        second = resolve_initial_sets(config, random.Random(42))
        self.assertEqual(first, second)
        self.assertEqual((len(first.e), len(first.i), len(first.r)), (2, 3, 1))
        combined = first.e | first.i | first.r
        self.assertEqual(len(combined), 6, "los conjuntos deben ser disjuntos")
        self.assertTrue(combined <= set(range(config.n)))


if __name__ == "__main__":
    unittest.main()
