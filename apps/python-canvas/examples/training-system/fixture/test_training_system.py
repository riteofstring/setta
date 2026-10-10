import unittest

import training_system as ts
from recipe import build


class TrainingSystemTests(unittest.TestCase):
    def test_runs_share_objects_and_derive_their_own_update_budgets(self) -> None:
        runs = build()
        baseline, smoke, sgd = runs["baseline"], runs["smoke"], runs["sgd"]
        for run in runs.values():
            self.assertEqual(ts.configuration_issues(run), [])
            self.assertIs(run.model, baseline.model)
            self.assertIs(run.evaluation, baseline.evaluation)
        self.assertIs(sgd.loop.budget, baseline.loop.budget)
        self.assertIs(smoke.loop.optimizer, baseline.loop.optimizer)
        self.assertNotEqual(smoke.loop.budget.updates, baseline.loop.budget.updates)
        self.assertEqual(baseline.loop.budget.effective_batch, 512)
        self.assertEqual(baseline.loop.budget.updates, 3920)
        self.assertEqual(smoke.loop.budget.updates, 8)
        self.assertIs(
            baseline.loop.budget.loader.pipeline.steps[-1],
            baseline.evaluation[0].loader.pipeline.steps[-1],
        )

    def test_shared_defaults_flow_through_the_model_and_schedule(self) -> None:
        runs = build(width=384, batch_size=128)
        baseline = runs["baseline"]
        model = baseline.model
        self.assertEqual(
            [
                model.embedding.width,
                model.encoder.attention.width,
                model.encoder.feed_forward.width,
                model.head.width,
            ],
            [384, 384, 384, 384],
        )
        self.assertEqual(baseline.loop.budget.effective_batch, 1024)
        self.assertEqual(baseline.loop.budget.updates, 1960)
        self.assertEqual(
            sum(stage.steps for stage in baseline.loop.schedule.stages), 1960
        )
        self.assertEqual(ts.configuration_issues(baseline), [])
        self.assertIn("same model object", ts.describe(runs))

    def test_an_inconsistent_component_can_be_corrected_without_rebuilding_the_runs(
        self,
    ) -> None:
        runs = build()
        head = runs["baseline"].model.head
        head.width = 512
        self.assertIn("Model widths disagree", ts.describe(runs))
        head.width = 192
        self.assertEqual(ts.describe(runs).count("Configuration is consistent."), 3)
        runs["baseline"].evaluation[0].loader.shuffle = True
        self.assertIn("shuffle off", ts.describe(runs))


if __name__ == "__main__":
    unittest.main()
