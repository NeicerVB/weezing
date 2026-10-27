import json
import random
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer

from seir import SimulationConfig, generate_graph, simulate
from seir.web import Handler

PAYLOAD = {
    "n": 12, "days": 3, "beta": 0.4, "sigma": 0.2, "gamma": 0.1,
    "seed": 42, "degree": 6, "e0": 1, "i0": 2, "r0": 0,
}


class WebTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.port = cls.server.server_port
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, path, body=None):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=10)
        self.addCleanup(connection.close)
        if body is not None and not isinstance(body, bytes):
            body = json.dumps(body).encode()
        headers = {"Content-Type": "application/json"} if body is not None else {}
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        return response.status, response.getheader("Content-Type"), response.read()

    def test_valid_request_matches_engine(self):
        status, content_type, body = self.request("POST", "/api/simulate", PAYLOAD)
        self.assertEqual(status, 200)
        self.assertEqual(content_type, "application/json; charset=utf-8")
        received = json.loads(body)
        config = SimulationConfig(
            n=12, beta=0.4, sigma=0.2, gamma=0.1, days=3, seed=42, e0=1, i0=2,
        )
        graph = generate_graph(12, 6, random.Random(42))
        self.assertEqual(received["days"], simulate(graph, config).to_rows())
        self.assertEqual(received["meta"]["n"], 12)

    def test_response_is_reproducible(self):
        first = self.request("POST", "/api/simulate", PAYLOAD)[2]
        second = self.request("POST", "/api/simulate", PAYLOAD)[2]
        self.assertEqual(first, second)

    def test_invalid_payloads_return_400(self):
        cases = {
            "suma inicial": (PAYLOAD | {"e0": 12}, "superar"),
            "beta": (PAYLOAD | {"beta": 1.5}, "beta"),
            "días negativos": (PAYLOAD | {"days": -1}, "days"),
            "población excesiva": (PAYLOAD | {"n": 2001}, "2000"),
            "días excesivos": (PAYLOAD | {"days": 366}, "365"),
            "campo faltante": ({key: value for key, value in PAYLOAD.items() if key != "gamma"}, "gamma"),
            "grado negativo": (PAYLOAD | {"degree": -1}, "degree"),
        }
        for name, (payload, message) in cases.items():
            with self.subTest(name):
                status, _, body = self.request("POST", "/api/simulate", payload)
                self.assertEqual(status, 400)
                self.assertIn(message, json.loads(body)["error"])
                self.assertNotIn("Traceback", body.decode())

    def test_malformed_body_returns_400(self):
        status, _, body = self.request("POST", "/api/simulate", b"{no es json")
        self.assertEqual(status, 400)
        self.assertIn("error", json.loads(body))

    def test_unknown_routes(self):
        self.assertEqual(self.request("GET", "/nada")[0], 404)
        self.assertEqual(self.request("POST", "/api/otra", PAYLOAD)[0], 404)

    def test_static_files(self):
        for path, content_type, marker in (
            ("/", "text/html; charset=utf-8", b"<form"),
            ("/app.js", "text/javascript; charset=utf-8", b"addEventListener"),
            ("/style.css", "text/css; charset=utf-8", b"--accent"),
        ):
            with self.subTest(path):
                status, received_type, body = self.request("GET", path)
                self.assertEqual(status, 200)
                self.assertEqual(received_type, content_type)
                self.assertIn(marker, body)


if __name__ == "__main__":
    unittest.main()
