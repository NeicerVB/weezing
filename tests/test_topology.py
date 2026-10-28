"""Pruebas unitarias para TerritorialGraph y la topología de Manta."""

import random
import unittest
from seir.graph import Graph
from seir.topology import (
    SECTORS,
    SECTOR_ADJACENCY,
    TerritorialGraph,
    generate_manta_graph,
    resolve_initial_infections,
)


class TopologyTests(unittest.TestCase):
    def test_sectors_definition(self):
        self.assertEqual(len(SECTORS), 7)
        expected = (
            "tarqui",
            "eloy_alfaro",
            "los_esteros",
            "manta_centro",
            "murcielago",
            "barbasquillo",
            "san_mateo",
        )
        self.assertEqual(SECTORS, expected)

    def test_sector_adjacency_is_connected(self):
        # All sectors in adjacency must exist in SECTORS
        seen_sectors = set()
        adj_map: dict[str, set[str]] = {s: set() for s in SECTORS}
        for u, v in SECTOR_ADJACENCY:
            self.assertIn(u, SECTORS)
            self.assertIn(v, SECTORS)
            self.assertNotEqual(u, v)
            adj_map[u].add(v)
            adj_map[v].add(u)
            seen_sectors.add(u)
            seen_sectors.add(v)
        self.assertEqual(seen_sectors, set(SECTORS))

        # Check connectivity of the 7 sectors via BFS
        visited = set()
        queue = [SECTORS[0]]
        visited.add(SECTORS[0])
        while queue:
            curr = queue.pop(0)
            for neighbor in adj_map[curr]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        self.assertEqual(visited, set(SECTORS), "Los 7 sectores deben estar interconectados")

    def test_territorial_graph_validation(self):
        base_g = Graph.from_edges(3, [(0, 1), (1, 2)])
        # Valid graph
        tg = TerritorialGraph(
            graph=base_g,
            sectors=("tarqui", "tarqui", "manta_centro"),
            hubs=frozenset({1}),
            labels=("T0", "T1", "M2"),
            coords=((10.0, 20.0), (30.0, 40.0), (50.0, 60.0)),
        )
        self.assertEqual(tg.graph.n, 3)
        self.assertIn(1, tg.hubs)

        # Mismatched lengths
        with self.assertRaises(ValueError):
            TerritorialGraph(
                graph=base_g,
                sectors=("tarqui", "tarqui"),
                hubs=frozenset(),
                labels=("T0", "T1", "M2"),
                coords=((10.0, 20.0), (30.0, 40.0), (50.0, 60.0)),
            )

        # Invalid sector name
        with self.assertRaises(ValueError):
            TerritorialGraph(
                graph=base_g,
                sectors=("tarqui", "sector_fantasma", "manta_centro"),
                hubs=frozenset(),
                labels=("T0", "T1", "M2"),
                coords=((10.0, 20.0), (30.0, 40.0), (50.0, 60.0)),
            )

        # Invalid hub id
        with self.assertRaises(ValueError):
            TerritorialGraph(
                graph=base_g,
                sectors=("tarqui", "tarqui", "manta_centro"),
                hubs=frozenset({99}),
                labels=("T0", "T1", "M2"),
                coords=((10.0, 20.0), (30.0, 40.0), (50.0, 60.0)),
            )

        # Out-of-bounds coordinates
        with self.assertRaises(ValueError):
            TerritorialGraph(
                graph=base_g,
                sectors=("tarqui", "tarqui", "manta_centro"),
                hubs=frozenset(),
                labels=("T0", "T1", "M2"),
                coords=((10.0, 20.0), (-5.0, 40.0), (50.0, 60.0)),
            )

    def test_generate_manta_graph_properties(self):
        n = 140
        avg_deg = 8.0
        rng = random.Random(42)
        tg = generate_manta_graph(n, avg_deg, rng)

        self.assertEqual(tg.graph.n, n)
        self.assertEqual(len(tg.sectors), n)
        self.assertEqual(len(tg.coords), n)
        self.assertEqual(len(tg.labels), n)

        # All 7 sectors must have nodes assigned
        sector_counts = {s: 0 for s in SECTORS}
        for s in tg.sectors:
            sector_counts[s] += 1
        for s, count in sector_counts.items():
            self.assertGreater(count, 0, f"Sector {s} no tiene nodos asignados")

        # Coords must be in [0, 100]^2
        for x, y in tg.coords:
            self.assertTrue(0.0 <= x <= 100.0)
            self.assertTrue(0.0 <= y <= 100.0)

        # Hubs must have higher degree than average degree
        self.assertGreater(len(tg.hubs), 0)
        actual_avg_deg = tg.graph.average_degree()
        for hub in tg.hubs:
            self.assertGreater(
                tg.graph.degree(hub),
                actual_avg_deg,
                f"Hub {hub} degree ({tg.graph.degree(hub)}) must exceed average degree ({actual_avg_deg})"
            )

        # Entire graph must be connected (no isolated components)
        visited = set()
        queue = [0]
        visited.add(0)
        while queue:
            curr = queue.pop(0)
            for neighbor in tg.graph.neighbors(curr):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        self.assertEqual(len(visited), n, "El grafo territorial debe ser completamente conexo")

    def test_generate_manta_graph_reproducibility(self):
        tg1 = generate_manta_graph(70, 6.0, random.Random(1234))
        tg2 = generate_manta_graph(70, 6.0, random.Random(1234))
        self.assertEqual(tg1.graph.unique_edges(), tg2.graph.unique_edges())
        self.assertEqual(tg1.sectors, tg2.sectors)
        self.assertEqual(tg1.hubs, tg2.hubs)
        self.assertEqual(tg1.coords, tg2.coords)
        self.assertEqual(tg1.labels, tg2.labels)

    def test_resolve_initial_infections(self):
        tg = generate_manta_graph(70, 6.0, random.Random(99))

        # Explicit IDs take priority
        ids = resolve_initial_infections(tg, initial={"tarqui": 10}, initial_ids=[1, 5, 9], rng=random.Random(1))
        self.assertEqual(ids, frozenset({1, 5, 9}))

        # Multi-sector dict seeding
        ids_multi = resolve_initial_infections(tg, initial={"tarqui": 5, "los_esteros": 2}, initial_ids=None, rng=random.Random(1))
        self.assertEqual(len(ids_multi), 7)
        tarqui_count = sum(1 for node in ids_multi if tg.sectors[node] == "tarqui")
        esteros_count = sum(1 for node in ids_multi if tg.sectors[node] == "los_esteros")
        self.assertEqual(tarqui_count, 5)
        self.assertEqual(esteros_count, 2)

        # Invalid sector
        with self.assertRaises(ValueError):
            resolve_initial_infections(tg, initial={"invalido": 3}, initial_ids=None, rng=random.Random(1))

        # Exceeding sector size
        with self.assertRaises(ValueError):
            resolve_initial_infections(tg, initial={"tarqui": 9999}, initial_ids=None, rng=random.Random(1))


if __name__ == "__main__":
    unittest.main()
