"""Topología territorial de Manta y generador de red de contactos sobre grafos."""

import random
from dataclasses import dataclass
from typing import Final

from .graph import Graph

SECTORS: Final[tuple[str, ...]] = (
    "tarqui",
    "eloy_alfaro",
    "los_esteros",
    "manta_centro",
    "murcielago",
    "barbasquillo",
    "san_mateo",
)

SECTOR_ADJACENCY: Final[tuple[tuple[str, str], ...]] = (
    ("tarqui", "eloy_alfaro"),
    ("tarqui", "los_esteros"),
    ("tarqui", "manta_centro"),
    ("manta_centro", "murcielago"),
    ("manta_centro", "barbasquillo"),
    ("barbasquillo", "san_mateo"),
    ("eloy_alfaro", "los_esteros"),
)

SECTOR_CENTERS: Final[dict[str, tuple[float, float]]] = {
    "san_mateo": (15.0, 75.0),
    "barbasquillo": (30.0, 60.0),
    "murcielago": (42.0, 38.0),
    "manta_centro": (54.0, 48.0),
    "tarqui": (68.0, 48.0),
    "los_esteros": (82.0, 32.0),
    "eloy_alfaro": (74.0, 72.0),
}

SECTOR_HUB_NAMES: Final[dict[str, str]] = {
    "tarqui": "Mercado Central de Tarqui",
    "eloy_alfaro": "Terminal Terrestre Eloy Alfaro",
    "los_esteros": "Puerto Pesquero Los Esteros",
    "manta_centro": "Plaza Central Manta Centro",
    "murcielago": "Malecón Escénico Murciélago",
    "barbasquillo": "Zona Universitaria ULEAM",
    "san_mateo": "Caleta Pesquera San Mateo",
}


@dataclass(frozen=True)
class TerritorialGraph:
    """Grafo atribuido con sectorización urbana, coordenadas y hubs de Manta."""

    graph: Graph
    sectors: tuple[str, ...]
    hubs: frozenset[int]
    labels: tuple[str, ...]
    coords: tuple[tuple[float, float], ...]

    def __post_init__(self) -> None:
        n = self.graph.n
        if len(self.sectors) != n:
            raise ValueError(f"sectors debe tener {n} elementos, pero tiene {len(self.sectors)}")
        if len(self.labels) != n:
            raise ValueError(f"labels debe tener {n} elementos, pero tiene {len(self.labels)}")
        if len(self.coords) != n:
            raise ValueError(f"coords debe tener {n} elementos, pero tiene {len(self.coords)}")
        for i, sector in enumerate(self.sectors):
            if sector not in SECTORS:
                raise ValueError(f"Sector '{sector}' en nodo {i} no es reconocido")
        for hub in self.hubs:
            if not isinstance(hub, int) or not (0 <= hub < n):
                raise ValueError(f"Hub ID {hub} fuera del rango [0, {n})")
        for i, (x, y) in enumerate(self.coords):
            if not (0.0 <= x <= 100.0 and 0.0 <= y <= 100.0):
                raise ValueError(f"Coordenadas ({x}, {y}) del nodo {i} fuera de [0, 100]^2")

    def nodes_in_sector(self, sector: str) -> list[int]:
        """Devuelve los IDs de los nodos asignados a un sector."""
        return [i for i, s in enumerate(self.sectors) if s == sector]

    def hubs_in_sector(self, sector: str) -> frozenset[int]:
        """Devuelve los nodos hub que pertenecen al sector."""
        return frozenset(h for h in self.hubs if self.sectors[h] == sector)

    def boundary_nodes(self, sector: str) -> frozenset[int]:
        """Nodos del sector que tienen al menos un enlace con otro sector."""
        boundary = set()
        for node in self.nodes_in_sector(sector):
            for neighbor in self.graph.neighbors(node):
                if self.sectors[neighbor] != sector:
                    boundary.add(node)
                    break
        return frozenset(boundary)


def generate_manta_graph(n: int, average_degree: float, rng: random.Random) -> TerritorialGraph:
    """Genera procedimentalmente una red territorial de Manta con 7 sectores conexos, hubs y puentes."""
    if n < len(SECTORS):
        raise ValueError(f"n ({n}) debe ser al menos {len(SECTORS)} para cubrir los sectores")
    if average_degree < 0:
        raise ValueError("average_degree no puede ser negativo")

    # 1. Asignar nodos a sectores de forma equilibrada
    base_count = n // len(SECTORS)
    remainder = n % len(SECTORS)
    sector_nodes: dict[str, list[int]] = {s: [] for s in SECTORS}

    curr_node = 0
    for idx, s in enumerate(SECTORS):
        count = base_count + (1 if idx < remainder else 0)
        for _ in range(count):
            sector_nodes[s].append(curr_node)
            curr_node += 1

    sectors_list = ["" for _ in range(n)]
    for s, nodes in sector_nodes.items():
        for node in nodes:
            sectors_list[node] = s
    sectors = tuple(sectors_list)

    # 2. Designar hubs (nodo principal de cada sector)
    hubs_set: set[int] = set()
    for s in SECTORS:
        nodes = sector_nodes[s]
        if nodes:
            hubs_set.add(nodes[0])
    hubs = frozenset(hubs_set)

    # 3. Asignar nombres/etiquetas
    labels_list = ["" for _ in range(n)]
    for s, nodes in sector_nodes.items():
        for i, node in enumerate(nodes):
            if node in hubs:
                labels_list[node] = SECTOR_HUB_NAMES[s]
            else:
                formatted_sector = s.replace("_", " ").title()
                labels_list[node] = f"{formatted_sector} #{i}"
    labels = tuple(labels_list)

    # 4. Generar coordenadas en [0, 100]^2
    coords_list = [(0.0, 0.0) for _ in range(n)]
    for s, nodes in sector_nodes.items():
        cx, cy = SECTOR_CENTERS[s]
        for node in nodes:
            if node in hubs:
                coords_list[node] = (round(cx, 2), round(cy, 2))
            else:
                # Jitter alrededor del centro del sector
                jx = rng.uniform(-7.0, 7.0)
                jy = rng.uniform(-7.0, 7.0)
                x = min(98.0, max(2.0, cx + jx))
                y = min(98.0, max(2.0, cy + jy))
                coords_list[node] = (round(x, 2), round(y, 2))
    coords = tuple(coords_list)

    # 5. Generar aristas asegurando conectividad, hubs densos y puentes intersectoriales
    edges: set[tuple[int, int]] = set()

    def add_edge(u: int, v: int) -> None:
        if u != v:
            edges.add((min(u, v), max(u, v)))

    # A. Conectividad intra-sectorial (cadena/anillo por sector)
    for s in SECTORS:
        nodes = sector_nodes[s]
        k = len(nodes)
        for i in range(k - 1):
            add_edge(nodes[i], nodes[i + 1])
        if k > 2:
            add_edge(nodes[k - 1], nodes[0])

    # B. Puentes intersectoriales según SECTOR_ADJACENCY
    bridge_count = max(2, round(0.04 * n))
    for s1, s2 in SECTOR_ADJACENCY:
        nodes1 = sector_nodes[s1]
        nodes2 = sector_nodes[s2]
        k = min(bridge_count, len(nodes1), len(nodes2))
        chosen1 = rng.sample(nodes1, k)
        chosen2 = rng.sample(nodes2, k)
        for u, v in zip(chosen1, chosen2):
            add_edge(u, v)

    # C. Conectar hubs densamente hacia nodos de su sector para alcanzar ~4x grado medio
    target_hub_degree = min(
        round(4.0 * max(average_degree, 2.0)),
        max(1, *(len(sector_nodes[s]) - 1 for s in SECTORS)),
    )
    for s in SECTORS:
        hub = sector_nodes[s][0]
        other_nodes = [node for node in sector_nodes[s] if node != hub]
        if other_nodes:
            sample_k = min(target_hub_degree, len(other_nodes))
            for target in rng.sample(other_nodes, sample_k):
                add_edge(hub, target)

    # D. Agregar aristas adicionales hasta alcanzar el grado medio objetivo
    max_possible_edges = n * (n - 1) // 2
    target_edges = min(max_possible_edges, round(n * average_degree / 2))

    # Lista de nodos por sector y sectores adyacentes para muestreo eficiente
    adj_dict: dict[str, list[str]] = {s: [] for s in SECTORS}
    for u, v in SECTOR_ADJACENCY:
        adj_dict[u].append(v)
        adj_dict[v].append(u)

    attempts = 0
    max_attempts = (target_edges - len(edges)) * 30 + 1000
    while len(edges) < target_edges and attempts < max_attempts:
        attempts += 1
        # 75% intra-sectorial, 25% inter-sectorial adyacente
        if rng.random() < 0.75:
            sec = rng.choice(SECTORS)
            nodes = sector_nodes[sec]
            if len(nodes) >= 2:
                u, v = rng.sample(nodes, 2)
                add_edge(u, v)
        else:
            sec1 = rng.choice(SECTORS)
            if adj_dict[sec1]:
                sec2 = rng.choice(adj_dict[sec1])
                u = rng.choice(sector_nodes[sec1])
                v = rng.choice(sector_nodes[sec2])
                add_edge(u, v)

    # Si aún no alcanza (en grafos muy densos), intentar con pares aleatorios generales
    while len(edges) < target_edges and attempts < max_attempts * 2:
        attempts += 1
        u = rng.randint(0, n - 1)
        v = rng.randint(0, n - 1)
        add_edge(u, v)

    base_graph = Graph.from_edges(n, edges)
    return TerritorialGraph(
        graph=base_graph,
        sectors=sectors,
        hubs=hubs,
        labels=labels,
        coords=coords,
    )


def resolve_initial_infections(
    t_graph: TerritorialGraph,
    initial: dict[str, int] | None,
    initial_ids: list[int] | None,
    rng: random.Random,
) -> frozenset[int]:
    """Resuelve el conjunto inicial de infectados según IDs explícitos o diccionario multi-sectorial."""
    n = t_graph.graph.n
    if initial_ids is not None and len(initial_ids) > 0:
        for node_id in initial_ids:
            if not isinstance(node_id, int) or not (0 <= node_id < n):
                raise ValueError(f"initial_id {node_id} fuera de rango [0, {n})")
        return frozenset(initial_ids)

    if initial is not None and len(initial) > 0:
        infected: set[int] = set()
        for sector, count in initial.items():
            if sector not in SECTORS:
                raise ValueError(f"Sector '{sector}' desconocido en siembra inicial")
            if count < 0:
                raise ValueError(f"Conteo negativo de infectados en sector '{sector}': {count}")
            if count == 0:
                continue
            sector_nodes = t_graph.nodes_in_sector(sector)
            if count > len(sector_nodes):
                raise ValueError(
                    f"Conteo de infectados ({count}) supera el total de nodos en sector '{sector}' ({len(sector_nodes)})"
                )
            chosen = rng.sample(sector_nodes, count)
            infected.update(chosen)
        return frozenset(infected)

    return frozenset()
