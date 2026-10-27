"""Interfaz de línea de comandos para la serie diaria agregada."""

import argparse
import json
import sys
from dataclasses import asdict

from .config import SimulationConfig
from .engine import SimulationResult, simulate


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Simulación SEIR agregada y didáctica")
    parser.add_argument("--n", type=int, required=True, help="tamaño de la población")
    parser.add_argument("--days", type=int, required=True, help="número de pasos diarios")
    parser.add_argument("--beta", type=float, required=True, help="mezcla abstracta diaria [0, 1]")
    parser.add_argument("--sigma", type=float, required=True, help="probabilidad E→I diaria [0, 1]")
    parser.add_argument("--gamma", type=float, required=True, help="probabilidad I→R diaria [0, 1]")
    parser.add_argument("--seed", type=int, default=0, help="semilla reproducible (predeterminado: 0)")
    parser.add_argument("--e0", type=int, default=0, help="expuestos iniciales")
    parser.add_argument("--i0", type=int, default=0, help="activos iniciales")
    parser.add_argument("--r0", type=int, default=0, help="retirados iniciales")
    parser.add_argument("--format", choices=("table", "json"), default="table")
    return parser


def format_table(result: SimulationResult) -> str:
    columns = ("day", "s", "e", "i", "r", "new_s_to_e", "cumulative")
    rows = result.to_rows()
    widths = {key: max(len(key), *(len(str(row[key])) for row in rows)) for key in columns}
    return "\n".join(
        ["  ".join(key.rjust(widths[key]) for key in columns)]
        + ["  ".join(str(row[key]).rjust(widths[key]) for key in columns) for row in rows]
    )


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        config = SimulationConfig(
            n=args.n, days=args.days, beta=args.beta, sigma=args.sigma,
            gamma=args.gamma, seed=args.seed, e0=args.e0, i0=args.i0, r0=args.r0,
        )
        result = simulate(config)
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if args.format == "json":
        print(json.dumps({"meta": asdict(config), "days": result.to_rows()}, allow_nan=False))
    else:
        print(format_table(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
