import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CliTests(unittest.TestCase):
    def run_cli(self, *arguments):
        return subprocess.run(
            [sys.executable, "-B", "-m", "seir.cli", "--n", "12", "--days", "3",
             "--beta", "0.4", "--sigma", "0.2", "--gamma", "0.1", "--i0", "2", *arguments],
            capture_output=True, text=True, check=False, cwd=ROOT,
        )

    def test_table(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 0)
        lines = result.stdout.splitlines()
        self.assertEqual(lines[0].split(), ["day", "S", "E", "I", "R", "new_s_to_e", "cumulative"])
        self.assertEqual(len(lines), 5)
        self.assertEqual([int(value) for value in lines[1].split()], [0, 10, 0, 2, 0, 0, 2])

    def test_json_is_reproducible(self):
        first = self.run_cli("--format", "json", "--seed", "42")
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(first.stdout, self.run_cli("--format", "json", "--seed", "42").stdout)
        data = json.loads(first.stdout)
        self.assertEqual((data["meta"]["n"], data["meta"]["seed"]), (12, 42))
        self.assertEqual(len(data["days"]), 4)
        self.assertEqual(
            set(data["days"][0]),
            {"day", "s", "e", "i", "r", "new_s_to_e", "cumulative"},
        )

    def test_edges_has_priority_over_degree(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "red.csv"
            path.write_text("a,b\n0,1\n1,0\n1,2\n2,1\n2,0\n0,2\n", encoding="utf-8")
            result = subprocess.run(
                [sys.executable, "-B", "-m", "seir.cli", "--edges", str(path), "--degree", "100",
                 "--days", "0", "--beta", "0", "--sigma", "0", "--gamma", "0",
                 "--format", "json"],
                capture_output=True, text=True, check=False, cwd=ROOT,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        meta = json.loads(result.stdout)["meta"]
        self.assertEqual(meta["n"], 3)
        self.assertEqual(meta["average_degree"], 2.0)

    def test_init_ids_infer_counts(self):
        result = self.run_cli("--init-i", "1,2", "--format", "json")
        self.assertEqual(result.returncode, 0, result.stderr)
        meta = json.loads(result.stdout)["meta"]
        self.assertEqual((meta["i0"], meta["init_i"]), (2, [1, 2]))

    def test_invalid_inputs_exit_2(self):
        cases = (("--e0", "12"), ("--beta", "nan"), ("--days", "-1"), ("--format", "csv"))
        for values in cases:
            with self.subTest(values=values):
                result = self.run_cli(*values)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, "")
                self.assertTrue(result.stderr.strip())


if __name__ == "__main__":
    unittest.main()
