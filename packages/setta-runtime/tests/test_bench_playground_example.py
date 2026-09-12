from __future__ import annotations

import json
import os
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts import run_bench_playground, run_local_setta


class BenchPlaygroundExampleTests(unittest.TestCase):
    def test_candidates_produce_distinct_bounded_512_pixel_pngs(self) -> None:
        go = run_local_setta._pinned_go()
        fixture = run_bench_playground.FIXTURE_ROOT
        cases = [
            json.loads(line)
            for line in (fixture / "cases.jsonl")
            .read_text(encoding="utf-8")
            .splitlines()
            if line
        ]
        self.assertEqual(len(cases), 10)
        self.assertEqual(
            {path.name for path in (fixture / "inputs").glob("*.png")},
            {f"product-{index:02d}.png" for index in range(1, 11)},
        )
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            executable = root / (
                "thumbnail-candidate.exe" if os.name == "nt" else "thumbnail-candidate"
            )
            environment = os.environ.copy()
            environment["GO111MODULE"] = "off"
            subprocess.run(
                [
                    str(go),
                    "build",
                    "-trimpath",
                    "-buildvcs=false",
                    "-o",
                    str(executable),
                    str(run_bench_playground.CANDIDATE_SOURCE),
                ],
                cwd=run_bench_playground.ROOT,
                env=environment,
                check=True,
            )
            digests: list[bytes] = []
            for mode in ("contain", "cover"):
                output = root / mode
                output.mkdir()
                request = {
                    "protocolVersion": "bench-candidate/v1",
                    "runId": "fixture-run",
                    "case": cases[0],
                    "outputDirectory": str(output),
                }
                completed = subprocess.run(
                    [str(executable), "run", "--mode", mode],
                    cwd=fixture,
                    input=json.dumps(request) + "\n",
                    capture_output=True,
                    text=True,
                    check=True,
                )
                result = json.loads(completed.stdout)
                self.assertEqual(result["type"], "result")
                self.assertEqual(result["artifacts"][0]["mediaType"], "image/png")
                artifact_path = output / result["artifacts"][0]["path"]
                payload = artifact_path.read_bytes()
                self.assertLess(len(payload), 160_000)
                self.assertEqual(payload[:8], b"\x89PNG\r\n\x1a\n")
                self.assertEqual(struct.unpack(">II", payload[16:24]), (512, 512))
                digests.append(payload)
        self.assertNotEqual(digests[0], digests[1])


if __name__ == "__main__":
    unittest.main()
