import base64
import io
import json
import unittest
import xml.etree.ElementTree as ET
from contextlib import redirect_stdout

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.svm import SVC

from model_arena import compare, evaluate, show


class ModelArenaTests(unittest.TestCase):
    def test_models_share_unseen_data_and_preprocessing_only_fits_training(
        self,
    ) -> None:
        models = [LogisticRegression(max_iter=1000), SVC(C=2)]
        scaler = StandardScaler()
        results, points, labels = evaluate(models, [scaler], "moons", 0.18, 100, 7)
        self.assertEqual(points.shape, (400, 2))
        self.assertEqual(labels.shape, (400,))
        self.assertFalse(hasattr(scaler, "mean_"))
        self.assertTrue(all(not hasattr(model, "classes_") for model in models))
        for result in results:
            self.assertEqual(result.model[0].n_samples_seen_, 100)
            self.assertEqual([p[0] for p in result.learning], [20, 40, 80, 100])
            np.testing.assert_array_equal(
                result.predictions, result.model.predict(points)
            )
        curved, same_points, same_labels = evaluate(
            [models[0]],
            [StandardScaler(), PolynomialFeatures(3, include_bias=False)],
            "moons",
            0.18,
            100,
            7,
        )
        np.testing.assert_array_equal(points, same_points)
        np.testing.assert_array_equal(labels, same_labels)
        self.assertGreater(curved[0].test_score, results[0].test_score + 5)
        self.assertGreater(results[1].test_score, 90)

    def test_outputs_explain_real_heldout_results_and_render_valid_maps(self) -> None:
        output = io.StringIO()
        with redirect_stdout(output):
            show(compare([SVC(C=2)], [StandardScaler()], shape="rings"))
        panels = {
            p["id"]: p
            for p in json.loads(output.getvalue().removeprefix("SETTA_DISPLAY "))[
                "panels"
            ]
        }
        svg = ET.fromstring(
            base64.b64decode(panels["boundaries"]["image"].split(",")[1])
        )
        self.assertIn("SVC", "".join(svg.itertext()))
        self.assertIn("400 separate samples", panels["report"]["text"])
        self.assertGreater(panels["leaderboard"]["rows"][0][1], 95)
        self.assertLess(len(output.getvalue().encode()), 1_000_000)
        with self.assertRaisesRegex(ValueError, "Add at least one classifier"):
            compare([], [])


if __name__ == "__main__":
    unittest.main()
