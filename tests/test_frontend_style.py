"""Contraste real de la paleta y comportamiento básico de la hoja temática."""

import re
import unittest
from pathlib import Path


STYLES = Path(__file__).resolve().parents[1] / "src/seir/static/style.css"


def luminance(color):
    channels = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4
              for value in channels]
    return sum(a * b for a, b in zip((0.2126, 0.7152, 0.0722), linear))


class FrontendStyleTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(STYLES.is_file(), "Falta la hoja de estilos territorial")
        self.css = STYLES.read_text(encoding="utf-8")
        self.colors = dict(re.findall(r"(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b", self.css))

    def test_projector_palette_keeps_text_and_states_readable(self):
        background = luminance(self.colors["--bg-card"])
        for variable in ("--text-primary", "--color-s", "--color-e", "--color-i", "--color-r", "--color-vol", "--accent-spooky"):
            with self.subTest(color=variable):
                foreground = luminance(self.colors[variable])
                contrast = (max(background, foreground) + 0.05) / (min(background, foreground) + 0.05)
                self.assertGreaterEqual(contrast, 4.5)

    def test_layout_stacks_and_controls_remain_visible_on_narrow_screens(self):
        self.assertRegex(self.css, r"\.layout\s*\{[^}]*display:\s*grid")
        self.assertRegex(self.css, r"@media\s*\(max-width:\s*\d+px\)")
        self.assertRegex(self.css, r":focus-visible\s*\{")
        self.assertRegex(self.css, r"prefers-reduced-motion")

    def test_each_svg_state_has_its_own_visible_style(self):
        for state in ("s", "e", "i", "r", "vol"):
            with self.subTest(state=state):
                self.assertRegex(self.css, rf"\.node-{state}\b")
        self.assertIn("stroke-width", self.css)

    def test_map_and_floating_playback_controls_have_reserved_space(self):
        self.assertRegex(self.css, r"\.layout\[data-controls-open=\"false\"\]")
        self.assertRegex(self.css, r"\.territory-shape\s*\{")
        self.assertRegex(self.css, r"\.field-help:hover::after")
        self.assertRegex(self.css, r"\.field-help:focus-visible::after")
        self.assertRegex(self.css, r"\.day-balance[^}]*min-height")

    def test_map_cards_share_state_colors_and_stack_before_toolbar_collision(self):
        self.assertRegex(self.css, r"\.map-surface\s+\.day-balance\s+\.node-i\s*\{[^}]*background:\s*var\(--color-i\)")
        self.assertRegex(self.css, r"@media\s*\(max-width:\s*1000px\)[^{]*\{[\s\S]*?\.map-surface\s+\.day-balance\s*\{[^}]*top:\s*56px")


if __name__ == "__main__":
    unittest.main()
