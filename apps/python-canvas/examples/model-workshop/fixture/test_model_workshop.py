from __future__ import annotations

import io
import re
import unittest
from contextlib import redirect_stdout

import numpy as np
from sklearn.datasets import make_moons
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.svm import SVC

from model_workshop import decision_map, evaluate, show


class ModelWorkshopTests(unittest.TestCase):
    def test_composing_curved_features_improves_unseen_predictions(self) -> None:
        data = make_moons(n_samples=400, noise=0.2, random_state=7)
        linear = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))
        curved = make_pipeline(
            StandardScaler(),
            PolynomialFeatures(degree=3, include_bias=False),
            LogisticRegression(max_iter=1000),
        )
        baseline = evaluate(linear, data)
        improved = evaluate(curved, data)
        self.assertGreater(improved.test_accuracy, 0.9)
        self.assertGreater(improved.test_accuracy, baseline.test_accuracy + 0.08)
        self.assertEqual(len(improved.labels), 120)
        np.testing.assert_array_equal(baseline.points, improved.points)
        self.assertFalse(hasattr(linear[-1], "classes_"))
        self.assertFalse(hasattr(curved[-1], "classes_"))

    def test_a_different_classifier_uses_the_same_recipe_and_renderer(self) -> None:
        data = make_moons(n_samples=400, noise=0.2, random_state=7)
        model = make_pipeline(StandardScaler(), SVC(C=1.0, max_iter=1000))
        output = io.StringIO()
        with redirect_stdout(output):
            result = show(model, data)
        self.assertGreater(result.test_accuracy, 0.9)
        self.assertIn("StandardScaler → SVC", output.getvalue())
        self.assertIn("Unseen:", output.getvalue())
        self.assertIn("mistakes", output.getvalue())
        self.assertNotIn("\033", output.getvalue())
        colored = decision_map(result, 48, 12, True)
        plain = re.sub(r"\x1b\[[0-9;]*m", "", colored)
        self.assertEqual(len(plain.splitlines()), 12)
        self.assertTrue(all(len(line) == 48 for line in plain.splitlines()))
        self.assertIn("A", plain)
        self.assertIn("B", plain)
        self.assertIn("\u00d7", plain)


if __name__ == "__main__":
    unittest.main()
