"""CLI: valida, simula y serializa; no imprime adornos en stdout."""

import argparse
import json
import random
import sys
from dataclasses import asdict
from pathlib import Path

from .config import SimulationConfig
from .engine import SimulationResult, simulate
from .graph import generate_graph, load_edges


def _id_set(text: str) -> frozenset[int]:
    try:
        return frozenset(int(part) for part in text.split(",") if part.strip())
    except ValueError:
        raise argparse.ArgumentTypeError(f"IDs inválidos: {text!r}") from None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Simulación SEIR sobre un grafo sintético")
    parser.add_argument("--n", type=int, help="número de nodos; se infiere de --edges si se omite")
    parser.add_argument("--days", type=int, default=30, help="pasos diarios (predeterminado: 30)")
    parser.add_argument("--beta", type=float, required=True, help="probabilidad por enlace y día [0, 1]")
    parser.add_argument("--sigma", type=float, required=True, help="probabilidad diaria E→I [0, 1]")
    parser.add_argument("--gamma", type=float, required=True, help="probabilidad diaria I→R [0, 1]")
    parser.add_argument("--seed", type=int, default=0, help="semilla reproducible (predeterminado: 0)")
    parser.add_argument("--degree", type=float, default=6, help="grado promedio objetivo (predeterminado: 6)")
    parser.add_argument("--edges", type=Path, help="CSV/TSV con aristas simétricas; tiene prioridad sobre --degree")
    parser.add_argument("--e0", type=int, help="expuestos iniciales (predeterminado: 0)")
    parser.add_argument("--i0", type=int, help="infecciosos iniciales (predeterminado: 0)")
    parser.add_argument("--r0", type=int, help="retirados iniciales (predeterminado: 0)")
    parser.add_argument("--init-e", type=_id_set, help="IDs expuestos, p. ej. 1,2")
    parser.add_argument("--init-i", type=_id_set, help="IDs infecciosos, p. ej. 7,8,9")
    parser.add_argument("--init-r", type=_id_set, help="IDs retirados, p. ej. 10")
    parser.add_argument("--format", choices=("table", "json"), default="table")
    return parser


def _count(value: int | None, ids: frozenset[int] | None) -> int:
    if ids is None:
        return value or 0
    if value is None:
        return len(ids)
    return value


def format_table(result: SimulationResult) -> str:
    headers = ("day", "S", "E", "I", "R", "new_s_to_e", "cumulative")
    keys = ("day", "s", "e", "i", "r", "new_s_to_e", "cumulative")
    rows = result.to_rows()
    widths = {key: max(len(header), *(len(str(row[key])) for row in rows))
              for key, header in zip(keys, headers)}
    lines = ["  ".join(header.rjust(widths[key]) for key, header in zip(keys, headers))]
    lines += ["  ".join(str(row[key]).rjust(widths[key]) for key in keys) for row in rows]
    return "\n".join(lines)


def format_json(result: SimulationResult) -> str:
    meta = asdict(result.config)
    for name in ("init_e", "init_i", "init_r"):
        if meta[name] is not None:
            meta[name] = sorted(meta[name])
    meta["average_degree"] = round(result.average_degree, 6)
    return json.dumps({"meta": meta, "days": result.to_rows()}, allow_nan=False)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.edges is not None:
            graph = load_edges(args.edges, n=args.n)
        else:
            if args.n is None:
                raise ValueError("--n es obligatorio cuando no se usa --edges")
            graph = generate_graph(args.n, args.degree, random.Random(args.seed))
        config = SimulationConfig(
            n=graph.n,
            beta=args.beta,
            sigma=args.sigma,
            gamma=args.gamma,
            days=args.days,
            seed=args.seed,
            e0=_count(args.e0, args.init_e),
            i0=_count(args.i0, args.init_i),
            r0=_count(args.r0, args.init_r),
            init_e=args.init_e,
            init_i=args.init_i,
            init_r=args.init_r,
        )
        result = simulate(graph, config)
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    except Exception as error:  # fallo inesperado: no ocultar el detalle
        print(f"error inesperado: {error}", file=sys.stderr)
        return 1

    print(format_json(result) if args.format == "json" else format_table(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
