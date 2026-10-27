import json
import subprocess
import sys
import unittest


class CliTests(unittest.TestCase):
    def run_cli(self, *arguments):
        return subprocess.run(
            [sys.executable, "-B", "-m", "seir.cli", "--n", "12", "--days", "3", "--beta", "0.4",
             "--sigma", "0.2", "--gamma", "0.1", "--i0", "2", *arguments],
            capture_output=True, text=True, check=False,
        )

    def test_table(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 0)
        lines = result.stdout.splitlines()
        self.assertEqual(lines[0].split(), ["day", "s", "e", "i", "r", "new_s_to_e", "cumulative"])
        self.assertEqual(len(lines), 5)
        self.assertEqual([int(value) for value in lines[1].split()], [0, 10, 0, 2, 0, 0, 2])

    def test_json_and_seed(self):
        first = self.run_cli("--format", "json", "--seed", "42")
        self.assertEqual(first.returncode, 0)
        self.assertEqual(first.stdout, self.run_cli("--format", "json", "--seed", "42").stdout)
        data = json.loads(first.stdout)
        self.assertEqual(data["meta"]["n"], 12)
        self.assertEqual(data["meta"]["seed"], 42)
        self.assertEqual(len(data["days"]), 4)
        self.assertEqual(set(data["days"][0]), {"day", "s", "e", "i", "r", "new_s_to_e", "cumulative"})

    def test_invalid_inputs(self):
        for values in (("--e0", "12"), ("--beta", "nan"), ("--days", "-1"), ("--format", "csv")):
            with self.subTest(values=values):
                result = self.run_cli(*values)
                self.assertEqual(result.returncode, 2)
                self.assertFalse(result.stdout)
                self.assertTrue(result.stderr)


if __name__ == "__main__":
    unittest.main()
