"""Contrato visible de la interfaz territorial, sin dependencias del navegador."""

import unittest
from html.parser import HTMLParser
from pathlib import Path


PAGE = Path(__file__).resolve().parents[1] / "src/seir/static/index.html"
DISCLAIMER = (
    "Simulación computacional ficticia con fines académicos para el Spookython Hackathon. "
    "No constituye una predicción epidemiológica ni una recomendación sanitaria real."
)
SECTORS = (
    "tarqui", "eloy_alfaro", "los_esteros", "manta_centro", "murcielago",
    "barbasquillo", "san_mateo",
)


class Markup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.elements = []
        self.text = []

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))

    def handle_data(self, data):
        self.text.append(data)


class FrontendLayoutTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(PAGE.is_file(), "Falta la interfaz territorial")
        self.page = Markup()
        self.page.feed(PAGE.read_text(encoding="utf-8"))
        self.by_id = {attrs["id"]: (tag, attrs) for tag, attrs in self.page.elements if "id" in attrs}

    def test_disclaimer_and_semantic_regions(self):
        content = " ".join(" ".join(self.page.text).split())
        self.assertIn(DISCLAIMER, content)
        self.assertTrue({"header", "main", "form", "fieldset"}.issubset(
            {tag for tag, _ in self.page.elements}
        ))
        self.assertEqual(self.by_id["report"][0], "details")
        self.assertIn("COE Cantonal", content)

    def test_all_direct_controls_have_labels_and_numeric_limits(self):
        labels = {attrs["for"] for tag, attrs in self.page.elements if tag == "label" and "for" in attrs}
        fields = (
            "n", "days", "seed", "beta", "sigma", "gamma", "degree", "quota",
            "k_max", "efficacy", "mode", "include_frames",
            *(f"initial-{sector}" for sector in SECTORS),
        )
        for field in fields:
            with self.subTest(field=field):
                self.assertIn(field, self.by_id)
                self.assertIn(field, labels)
        for field in ("n", "days", "beta", "sigma", "gamma", "quota", "k_max", "efficacy"):
            with self.subTest(limits=field):
                self.assertIn("min", self.by_id[field][1])
                self.assertIn("max", self.by_id[field][1])

    def test_visualizations_and_live_results_are_named(self):
        for visual in ("map", "curve"):
            with self.subTest(visual=visual):
                tag, attrs = self.by_id[visual]
                self.assertEqual(tag, "svg")
                self.assertEqual(attrs.get("role"), "img")
                self.assertIn("aria-label", attrs)
        for result in ("r0", "avoided", "doses", "peak", "volunteers", "error", "report-body", "map-status"):
            with self.subTest(result=result):
                self.assertIn("aria-live", self.by_id[result][1])
        for control in ("play", "pause", "timeline"):
            self.assertIn(control, self.by_id)
        content = " ".join(self.page.text)
        for symbol in ("Círculo", "Cuadrado", "Triángulo", "Cruz", "Estrella"):
            self.assertIn(symbol, content)


if __name__ == "__main__":
    unittest.main()
