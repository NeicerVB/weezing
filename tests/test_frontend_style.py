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

    def test_floating_state_cards_stack_values_and_reserve_map_space(self):
        self.assertRegex(self.css, r"\.map-surface \.day-balance>span\s*\{[^}]*grid-template-columns:\s*14px minmax\(0,1fr\);[^}]*grid-template-rows:\s*auto auto")
        self.assertRegex(self.css, r"\.map-surface \.day-balance strong\s*\{[^}]*grid-column:\s*1 / -1")

    def test_map_fills_surface_behind_overlays_and_connections_can_hide(self):
        self.assertRegex(self.css, r"#map\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*width:\s*100%[^}]*height:\s*100%")
        self.assertRegex(self.css, r"#map\[data-show-connections=\"false\"\] \.edge\s*\{[^}]*display:\s*none")

    def test_sector_boundaries_use_bright_overlay_stroke(self):
        self.assertRegex(self.css, r"#map \.sector-boundary\s*\{[^}]*stroke:\s*var\(--color-vol\)[^}]*stroke-opacity:\s*\.98[^}]*pointer-events:\s*none")

    def test_map_canvas_scales_taller_than_default_panel(self):
        self.assertRegex(self.css, r"\.map-surface\s*\{[^}]*min-height:\s*max\(560px,min\(75vh,850px\)\)")

    def test_sector_legend_is_visible_and_reflows_on_small_screens(self):
        self.assertRegex(self.css, r"\.sector-legend\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(4,minmax\(0,1fr\)\)")
        self.assertRegex(self.css, r"\.sector-legend li:before\s*\{[^}]*content:\s*attr\(data-number\)")
        self.assertRegex(self.css, r"@media\s*\(max-width:\s*780px\)[^{]*\{[\s\S]*?\.sector-legend\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)")
        self.assertRegex(self.css, r"\.map-toolbar\s*\{[^}]*position:\s*absolute")
        self.assertRegex(self.css, r"\.map-surface \.day-balance\s*\{[^}]*position:\s*absolute")
        self.assertNotRegex(self.css, r"\.map-toolbar,\.map-surface \.day-balance\s*\{[^}]*display:\s*none")

    def test_large_screen_rule_does_not_shrink_map_canvas(self):
        self.assertNotRegex(self.css, r"#map\s*\{[^}]*height:\s*450px")

    def test_field_tooltips_stay_inside_the_viewport(self):
        self.assertRegex(self.css, r"\.field-help:hover::after,\.field-help:focus-visible::after\s*\{[^}]*left:\s*0[^}]*max-width:\s*min\(260px,calc\(100vw - 32px\)\)[^}]*transform:\s*none")

    def test_stock_limit_note_is_a_separate_line(self):
        self.assertRegex(self.css, r"\.controls-panel label \.field-note\s*\{[^}]*display:\s*block")

    def test_workspace_uses_full_browser_width_and_inline_parameter_hints(self):
        self.assertRegex(self.css, r"\.site-header\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none")
        self.assertRegex(self.css, r"\.intro,\.disclaimer,\.layout,\.site-footer\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none")
        self.assertRegex(self.css, r"\.controls-panel label span:not\(\.field-help\):not\(\.field-note\)\s*\{[^}]*display:\s*inline")


if __name__ == "__main__":
    unittest.main()
