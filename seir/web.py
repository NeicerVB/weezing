"""Servidor local mínimo: formulario, simulación y estáticos."""

import argparse
import json
import random
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from math import isfinite
from pathlib import Path

from .config import SimulationConfig
from .engine import simulate
from .graph import generate_graph

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
MAX_N = 2000
MAX_DAYS = 365
MAX_BODY = 64 * 1024

STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
}


def _required(payload: dict, name: str):
    if name not in payload:
        raise ValueError(f"falta el campo '{name}'")
    return payload[name]


def simulate_payload(payload: object) -> dict:
    """Traduce el JSON del formulario a una simulación y a su respuesta."""
    if not isinstance(payload, dict):
        raise ValueError("se esperaba un objeto JSON")
    config = SimulationConfig(
        n=_required(payload, "n"),
        beta=_required(payload, "beta"),
        sigma=_required(payload, "sigma"),
        gamma=_required(payload, "gamma"),
        days=payload.get("days", 30),
        seed=payload.get("seed", 0),
        e0=payload.get("e0", 0),
        i0=payload.get("i0", 0),
        r0=payload.get("r0", 0),
    )
    if config.n > MAX_N:
        raise ValueError(f"n no puede superar {MAX_N}")
    if config.days > MAX_DAYS:
        raise ValueError(f"days no puede superar {MAX_DAYS}")
    degree = payload.get("degree", 6)
    if not isinstance(degree, (int, float)) or not isfinite(degree) or degree < 0:
        raise ValueError("degree debe ser un número mayor o igual que 0")
    graph = generate_graph(config.n, degree, random.Random(config.seed))
    return simulate(graph, config).to_payload()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        entry = STATIC.get(path)
        if entry is None:
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "ruta no encontrada"})
            return
        name, content_type = entry
        try:
            body = (WEB_DIR / name).read_bytes()
        except OSError:
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "archivo web no disponible"})
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if self.path.split("?", 1)[0] != "/api/simulate":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "ruta no encontrada"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                raise ValueError("cuerpo ausente o demasiado grande")
            payload = json.loads(self.rfile.read(length))
            result = simulate_payload(payload)
        except (ValueError, TypeError) as error:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return
        except Exception as error:  # fallo inesperado: se informa sin traza al cliente
            print(f"error inesperado: {error}", file=sys.stderr)
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "fallo interno"})
            return
        self._send_json(HTTPStatus.OK, result)

    def _send_json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:
        pass  # demo local: sin ruido en la terminal


def run(host: str = "127.0.0.1", port: int = 8000) -> None:
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"http://{host}:{server.server_port}", file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Servidor web local para la simulación SEIR")
    parser.add_argument("--port", type=int, default=8000, help="puerto local (predeterminado: 8000)")
    args = parser.parse_args(argv)
    try:
        run(port=args.port)
    except OSError as error:
        print(f"error: no se pudo abrir el puerto {args.port}: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
