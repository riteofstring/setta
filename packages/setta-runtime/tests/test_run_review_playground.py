from __future__ import annotations

import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import run_review_playground


class ReviewPlaygroundRunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.fixture = self.root / "fixture"
        self.workspace = self.root / "workspace"
        _write_fixture(self.fixture)
        self.fixture_patch = mock.patch.object(
            run_review_playground, "FIXTURE_ROOT", self.fixture
        )
        self.workspace_patch = mock.patch.object(
            run_review_playground, "WORKSPACE_ROOT", self.workspace
        )
        self.fixture_patch.start()
        self.workspace_patch.start()
        self.addCleanup(self.fixture_patch.stop)
        self.addCleanup(self.workspace_patch.stop)

    def test_prepare_workspace_builds_git_evidence_and_installs_base_revision(
        self,
    ) -> None:
        workspace = run_review_playground.prepare_workspace()
        revision = run_review_playground._git_output(
            ("rev-parse", "HEAD"), workspace / "repository"
        )
        self.assertEqual(len(revision), 40)
        for relative in run_review_playground.REVISION_REQUESTS:
            source = (workspace / relative).read_text(encoding="utf-8")
            self.assertIn(revision, source)
            self.assertNotIn(run_review_playground.ZERO_REVISION, source)
            request = json.loads(source)
            identities = []
            for evidence in request["evidence"]:
                if evidence["kind"] == "gitDiff":
                    identities.append(evidence["gitDiff"]["patchSha256"])
                elif evidence["kind"] in {"code", "text", "json"}:
                    identities.append(evidence[evidence["kind"]]["sourceSha256"])
            self.assertEqual(len(identities), 4)
            for identity in identities:
                self.assertRegex(identity, r"^[0-9a-f]{64}$")
                self.assertNotEqual(identity, run_review_playground.ZERO_SHA256)
        self.assertEqual(
            run_review_playground._git_output(
                ("show", "HEAD:event_v3.ts"), workspace / "repository"
            ),
            "base event",
        )
        self.assertEqual(
            (workspace / "repository" / "event_v3.ts").read_text(encoding="utf-8"),
            "current event\n",
        )
        self.assertFalse((workspace / "repository-base").exists())
        self.assertFalse((workspace / "repository-current").exists())

    def test_prepare_workspace_preserves_an_existing_valid_project(self) -> None:
        workspace = run_review_playground.prepare_workspace()
        evidence = workspace / "evidence" / "checkout-run.log"
        evidence.write_text("locally changed\n", encoding="utf-8")
        self.assertEqual(run_review_playground.prepare_workspace(), workspace)
        self.assertEqual(evidence.read_text(encoding="utf-8"), "locally changed\n")

    def test_seed_workspace_applies_the_fixture_once(self) -> None:
        workspace = run_review_playground.prepare_workspace()

        def apply_seed(project: Path) -> None:
            state = project / run_review_playground.SEED_STATE
            state.parent.mkdir(parents=True, exist_ok=True)
            state.write_text("{}\n", encoding="utf-8")

        with mock.patch.object(
            run_review_playground, "_apply_seed", side_effect=apply_seed
        ) as apply:
            self.assertTrue(run_review_playground.seed_workspace(workspace))
            self.assertFalse(run_review_playground.seed_workspace(workspace))
        apply.assert_called_once_with(workspace)

    def test_main_prepares_seeds_and_opens_the_working_project(self) -> None:
        calls: list[tuple[str, Path]] = []

        def seed(project: Path) -> bool:
            calls.append(("seed", project))
            return True

        def open_project(project: Path) -> int:
            calls.append(("open", project))
            return 7

        with (
            mock.patch.object(
                run_review_playground, "seed_workspace", side_effect=seed
            ),
            mock.patch.object(
                run_review_playground, "_open_workspace", side_effect=open_project
            ),
        ):
            self.assertEqual(run_review_playground.main([]), 7)
        self.assertEqual(calls, [("seed", self.workspace), ("open", self.workspace)])

    def test_main_rejects_arguments_without_touching_the_fixture(self) -> None:
        stderr = io.StringIO()
        with mock.patch.object(run_review_playground.sys, "stderr", stderr):
            self.assertEqual(run_review_playground.main(["--reset"]), 2)
        self.assertEqual(stderr.getvalue(), "Usage: run_review_playground.py\n")
        self.assertFalse(self.workspace.exists())

    def test_fixture_symlink_is_rejected(self) -> None:
        target = self.fixture / "artifacts" / "signal.svg"
        target.unlink()
        try:
            target.symlink_to(self.fixture / "artifacts" / "orbital.svg")
        except OSError as error:
            self.skipTest(f"symlinks unavailable: {error}")
        with self.assertRaises(run_review_playground.PlaygroundError):
            run_review_playground.prepare_workspace()


def _write_fixture(root: Path) -> None:
    for relative in run_review_playground.FIXTURE_FILES:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{}\n", encoding="utf-8")
    for relative in run_review_playground.REVISION_REQUESTS:
        (root / relative).write_text(
            json.dumps(
                {
                    "evidence": [
                        {
                            "kind": "gitDiff",
                            "gitDiff": {
                                "baseRevision": run_review_playground.ZERO_REVISION,
                                "contextLines": 3,
                                "hunk": {
                                    "newLines": 1,
                                    "newStart": 1,
                                    "oldLines": 1,
                                    "oldStart": 1,
                                },
                                "patchSha256": run_review_playground.ZERO_SHA256,
                                "path": "event_v3.ts",
                                "targetRevision": None,
                            },
                        },
                        {
                            "kind": "text",
                            "text": {
                                "path": "evidence/checkout-run.log",
                                "sourceSha256": run_review_playground.ZERO_SHA256,
                            },
                        },
                        {
                            "code": {
                                "language": "typescript",
                                "path": "repository/event_bus.ts",
                                "sourceSha256": run_review_playground.ZERO_SHA256,
                            },
                            "kind": "code",
                        },
                        {
                            "json": {
                                "path": "evidence/checkout-results.json",
                                "sourceSha256": run_review_playground.ZERO_SHA256,
                            },
                            "kind": "json",
                        },
                    ]
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
    (root / "repository-base" / "event_v3.ts").write_text(
        "base event\n", encoding="utf-8"
    )
    (root / "repository-base" / "retry_policy.go").write_text(
        "base retry\n", encoding="utf-8"
    )
    (root / "repository-current" / "event_v3.ts").write_text(
        "current event\n", encoding="utf-8"
    )
    (root / "repository-current" / "retry_policy.go").write_text(
        "current retry\n", encoding="utf-8"
    )


if __name__ == "__main__":
    unittest.main()
