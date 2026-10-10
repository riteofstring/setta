import base64
import io
import json
import unittest
import xml.etree.ElementTree as ET
from contextlib import redirect_stdout

from rover_mission import Rover, drive, make_world, run_mission, show


class RoverMissionTests(unittest.TestCase):
    def test_weather_changes_outcome_and_vehicle_changes_can_recover(self) -> None:
        world = make_world()
        rover = Rover("Pathfinder", 240, 65, 1.8, 3, 20)
        calm = drive(world, rover, 0.2, 1)
        storm = drive(world, rover, 0.6, 1)
        recovered = drive(world, Rover("Survivor", 500, 0, 3, 5, 5), 0.6, 1)
        self.assertTrue(calm["returned"])
        self.assertFalse(storm["returned"])
        self.assertEqual(storm["samples"], 0)
        self.assertTrue(recovered["returned"])
        self.assertGreater(recovered["samples"], 0)
        self.assertEqual(calm, drive(make_world(), rover, 0.2, 1))
        self.assertNotEqual(world.heights, make_world(seed=8).heights)

    def test_visual_results_contain_actual_routes_scores_and_telemetry(self) -> None:
        output = io.StringIO()
        with redirect_stdout(output):
            show(run_mission(make_world(), [Rover("<Scout & friends>")]))
        payload = json.loads(output.getvalue().removeprefix("SETTA_DISPLAY "))
        panels = {p["id"]: p for p in payload["panels"]}
        svg = ET.fromstring(base64.b64decode(panels["terrain"]["image"].split(",")[1]))
        self.assertIn("<Scout & friends>", "".join(svg.itertext()))
        self.assertEqual(panels["energy"]["series"][0]["points"][0], [0, 100])
        self.assertEqual(panels["scoreboard"]["rows"][0][0], "<Scout & friends>")
        self.assertLess(len(output.getvalue().encode()), 1_000_000)
        with self.assertRaisesRegex(ValueError, "Add at least one rover"):
            run_mission(make_world(), [])


if __name__ == "__main__":
    unittest.main()
