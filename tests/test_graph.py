import random
import tempfile
import unittest
from pathlib import Path

from seir import Graph, generate_graph, load_edges


class GenerateGraphTests(unittest.TestCase):
    def test_generated_graph_is_simple(self):
        graph = generate_graph(40, 4, random.Random(7))
        self.assertEqual(len(graph.adjacency), 40)
        for node in graph.nodes:
            self.assertNotIn(node, graph.neighbors(node), "bucle")
            for other in graph.neighbors(node):
                self.assertIn(node, graph.neighbors(other), "arista asimétrica")

    def test_average_degree_matches_target(self):
        graph = generate_graph(500, 6, random.Random(42))
        self.assertAlmostEqual(graph.average_degree(), 6, delta=0.5)
        self.assertLessEqual(graph.average_degree(), 499)

    def test_zero_and_excessive_degree(self):
        empty = generate_graph(5, 0, random.Random(1))
        self.assertTrue(all(empty.degree(node) == 0 for node in empty.nodes))
        clipped = generate_graph(5, 50, random.Random(1))
        self.assertLessEqual(clipped.average_degree(), 4)

    def test_explicit_graph_matches_normalized_edges(self):
        graph = Graph.from_edges(3, [(0, 1), (1, 2), (2, 0)])
        self.assertEqual(graph.neighbors(0), frozenset({1, 2}))
        self.assertEqual(graph.neighbors(1), frozenset({0, 2}))
        self.assertEqual(graph.neighbors(2), frozenset({0, 1}))
        self.assertAlmostEqual(graph.average_degree(), 2.0)

    def test_unique_edges(self):
        graph = Graph.from_edges(3, [(0, 1), (1, 2), (2, 0)])
        self.assertEqual(graph.unique_edges(), [(0, 1), (0, 2), (1, 2)])



class LoadEdgesTests(unittest.TestCase):
    def write(self, text):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "red.csv"
        path.write_text(text, encoding="utf-8")
        return path

    def test_header_and_blank_lines(self):
        graph = load_edges(self.write("a,b\n\n0,1\n1,0\n"))
        self.assertEqual(graph.n, 2)
        self.assertEqual(graph.neighbors(0), frozenset({1}))

    def test_tab_separated(self):
        graph = load_edges(self.write("0\t1\n1\t0\n"))
        self.assertEqual(graph.neighbors(1), frozenset({0}))

    def test_explicit_n_allows_isolated_nodes(self):
        graph = load_edges(self.write("0,1\n1,0\n"), n=4)
        self.assertEqual(graph.n, 4)
        self.assertEqual(graph.degree(3), 0)

    def test_rejects_asymmetry_loop_and_out_of_range(self):
        cases = {
            "asinmetría": ("0,1\n", None),
            "bucle": ("0,0\n", None),
            "fuera de rango": ("0,3\n3,0\n", 2),
        }
        for name, (text, n) in cases.items():
            with self.subTest(name), self.assertRaises(ValueError):
                load_edges(self.write(text), n=n)

    def test_empty_file_without_n_fails(self):
        with self.assertRaises(ValueError):
            load_edges(self.write("\n"))


if __name__ == "__main__":
    unittest.main()
