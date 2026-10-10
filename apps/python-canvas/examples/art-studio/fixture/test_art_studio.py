import base64
import io
import json
import unittest
import xml.etree.ElementTree as ET
from contextlib import redirect_stdout

from art_studio import FlowInk, OrbitRings, StarField, artwork, render_gallery, show


class ArtStudioTests(unittest.TestCase):
    def test_seeds_layers_and_colors_change_reproducible_vector_art(self) -> None:
        layers = [FlowInk(), OrbitRings(), StarField()]
        original, counts = artwork(layers, 9, "#0a1424", 3)
        self.assertEqual(original, artwork(layers, 9, "#0a1424", 3)[0])
        self.assertNotEqual(original, artwork(layers, 10, "#0a1424", 3)[0])
        quiet, quiet_counts = artwork(
            [FlowInk(color="#ff0000"), StarField(enabled=False)], 9, "#0a1424", 3
        )
        self.assertIn('stroke="#ff0000"', quiet)
        self.assertEqual(quiet_counts[1], 0)
        self.assertLess(sum(quiet_counts), sum(counts))
        ET.fromstring(quiet)

    def test_dense_gallery_is_valid_downloadable_svg_within_run_output_limit(
        self,
    ) -> None:
        output = io.StringIO()
        with redirect_stdout(output):
            show(
                render_gallery(
                    [FlowInk(strands=100), OrbitRings(count=28), StarField(count=300)],
                    symmetry=8,
                )
            )
        payload = json.loads(output.getvalue().removeprefix("SETTA_DISPLAY "))
        images = [p for p in payload["panels"] if p["kind"] == "image"]
        self.assertEqual(len(images), 2)
        for panel in images:
            svg = ET.fromstring(base64.b64decode(panel["image"].split(",")[1]))
            ids = [node.attrib["id"] for node in svg.iter() if "id" in node.attrib]
            self.assertEqual(len(ids), len(set(ids)))
            self.assertTrue(ids)
        self.assertLess(len(output.getvalue().encode()), 1_000_000)
        with self.assertRaisesRegex(ValueError, "hex color"):
            render_gallery([FlowInk(color='red" onload="alert(1)')])


if __name__ == "__main__":
    unittest.main()
