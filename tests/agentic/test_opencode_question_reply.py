import json
import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path


class OpenCodeQuestionReplyTests(unittest.TestCase):
    def _run_node(self, script: str) -> list:
        node_path = shutil.which("node")
        if node_path is None:
            self.skipTest("node executable not found")
        result = subprocess.run(
            [node_path, "--input-type=module", "-e", script],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            output = result.stderr.strip() or result.stdout.strip()
            self.fail(f"node script failed: {output}")
        output = result.stdout.strip()
        if not output:
            return []
        return json.loads(output)

    def test_string_answers_builds_answer_body(self) -> None:
        module_path = (
            Path(__file__).resolve().parents[2]
            / "backend"
            / "setta"
            / "agentic"
            / "external_adapters"
            / "sidecars"
            / "opencode_question_reply.mjs"
        )
        script = textwrap.dedent(
            """
            import { buildQuestionReplyBodies } from "__MODULE_URI__";
            const bodies = buildQuestionReplyBodies("Yes", null);
            console.log(JSON.stringify(bodies));
            """
        ).replace("__MODULE_URI__", module_path.as_uri())
        bodies = self._run_node(script)
        self.assertIn({"answers": [["Yes"]]}, bodies)

    def test_array_answers_include_ordered_body(self) -> None:
        module_path = (
            Path(__file__).resolve().parents[2]
            / "backend"
            / "setta"
            / "agentic"
            / "external_adapters"
            / "sidecars"
            / "opencode_question_reply.mjs"
        )
        script = textwrap.dedent(
            """
            import { buildQuestionReplyBodies } from "__MODULE_URI__";
            const bodies = buildQuestionReplyBodies(["A", "B"], null);
            console.log(JSON.stringify(bodies));
            """
        ).replace("__MODULE_URI__", module_path.as_uri())
        bodies = self._run_node(script)
        self.assertIn({"answers": [["A"], ["B"]]}, bodies)

    def test_object_answers_respects_question_order(self) -> None:
        module_path = (
            Path(__file__).resolve().parents[2]
            / "backend"
            / "setta"
            / "agentic"
            / "external_adapters"
            / "sidecars"
            / "opencode_question_reply.mjs"
        )
        script = textwrap.dedent(
            """
            import { buildQuestionReplyBodies } from "__MODULE_URI__";
            const rawAnswers = { "Q1": "One", "Q2": "Two" };
            const bodies = buildQuestionReplyBodies(rawAnswers, ["Q2", "Q1"]);
            console.log(JSON.stringify(bodies));
            """
        ).replace("__MODULE_URI__", module_path.as_uri())
        bodies = self._run_node(script)
        self.assertIn({"answers": [["Two"], ["One"]]}, bodies)
