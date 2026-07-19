#!/usr/bin/env python3

import json
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path

from evaluate_openwakeword_offline import EvaluationInputError, evaluate_manifest


class OpenWakeWordOfflineEvaluatorTests(unittest.TestCase):
    def test_reports_false_rejects_false_accepts_and_wake_timing(self) -> None:
        with tempfile.TemporaryDirectory(prefix="setta-wake-eval-") as raw_root:
            root = Path(raw_root)
            manifest_path = write_manifest(
                root,
                (
                    positive_fixture(
                        "accepted",
                        root,
                        scores=((0, 0.05), (320, 0.30), (480, 0.72)),
                    ),
                    positive_fixture(
                        "missed",
                        root,
                        scores=((0, 0.03), (320, 0.24), (640, 0.40)),
                    ),
                    negative_fixture(
                        "office",
                        root,
                        scores=((0, 0.02), (200, 0.68), (800, 0.20)),
                    ),
                ),
            )

            report = evaluate_manifest(manifest_path, 0.60)

        self.assertEqual(report.summary.fixture_count, 3)
        self.assertEqual(report.summary.positive_count, 2)
        self.assertEqual(report.summary.negative_count, 1)
        self.assertEqual(report.summary.positive_false_rejects, 1)
        self.assertEqual(report.summary.negative_false_accepts, 1)
        self.assertAlmostEqual(report.summary.positive_false_reject_rate, 0.5)
        self.assertAlmostEqual(
            report.summary.negative_false_accept_rate_per_hour,
            3_600.0,
        )
        self.assertAlmostEqual(
            report.summary.average_accepted_wake_latency_ms,
            160.0,
        )
        self.assertEqual(
            [result.result for result in report.fixtures],
            ["accepted_wake", "missed_wake", "false_accept"],
        )

    def test_cli_emits_json_report(self) -> None:
        with tempfile.TemporaryDirectory(prefix="setta-wake-eval-cli-") as raw_root:
            root = Path(raw_root)
            manifest_path = write_manifest(
                root,
                (
                    positive_fixture(
                        "accepted",
                        root,
                        scores=((0, 0.10), (450, 0.80)),
                    ),
                    negative_fixture(
                        "conversation",
                        root,
                        scores=((0, 0.05), (900, 0.20)),
                    ),
                ),
            )

            completed = subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).with_name("evaluate_openwakeword_offline.py")),
                    "--manifest",
                    str(manifest_path),
                    "--threshold",
                    "0.6",
                    "--output",
                    "json",
                ],
                check=True,
                capture_output=True,
                text=True,
            )

        payload = json.loads(completed.stdout)
        self.assertEqual(payload["threshold"], 0.6)
        self.assertEqual(payload["summary"]["positiveFalseRejects"], 0)
        self.assertEqual(payload["summary"]["negativeFalseAccepts"], 0)
        self.assertEqual(payload["fixtures"][0]["result"], "accepted_wake")

    def test_rejects_wav_outside_engine_input_format(self) -> None:
        with tempfile.TemporaryDirectory(prefix="setta-wake-eval-format-") as raw_root:
            root = Path(raw_root)
            manifest_path = write_manifest(
                root,
                (
                    positive_fixture(
                        "wrong_rate",
                        root,
                        sample_rate_hz=8_000,
                        scores=((0, 0.05), (480, 0.72)),
                    ),
                ),
            )

            with self.assertRaisesRegex(EvaluationInputError, "16000 Hz"):
                evaluate_manifest(manifest_path, 0.60)

    def test_rejects_score_trace_after_wav_duration(self) -> None:
        with tempfile.TemporaryDirectory(prefix="setta-wake-eval-duration-") as raw_root:
            root = Path(raw_root)
            manifest_path = write_manifest(
                root,
                (
                    negative_fixture(
                        "too_long",
                        root,
                        duration_ms=1_000,
                        scores=((0, 0.01), (1_200, 0.20)),
                    ),
                ),
            )

            with self.assertRaisesRegex(EvaluationInputError, "exceeds"):
                evaluate_manifest(manifest_path, 0.60)


def positive_fixture(
    fixture_id: str,
    root: Path,
    *,
    duration_ms: int = 1_000,
    sample_rate_hz: int = 16_000,
    scores: tuple[tuple[int, float], ...],
) -> dict[str, object]:
    paths = write_fixture_files(
        fixture_id,
        root,
        duration_ms=duration_ms,
        sample_rate_hz=sample_rate_hz,
        scores=scores,
    )
    return {
        "id": fixture_id,
        "label": "positive",
        "scores": paths["scores"],
        "wakeEndMs": 700,
        "wakeStartMs": 320,
        "wav": paths["wav"],
    }


def negative_fixture(
    fixture_id: str,
    root: Path,
    *,
    duration_ms: int = 1_000,
    sample_rate_hz: int = 16_000,
    scores: tuple[tuple[int, float], ...],
) -> dict[str, object]:
    paths = write_fixture_files(
        fixture_id,
        root,
        duration_ms=duration_ms,
        sample_rate_hz=sample_rate_hz,
        scores=scores,
    )
    return {
        "id": fixture_id,
        "label": "negative",
        "scores": paths["scores"],
        "wav": paths["wav"],
    }


def write_manifest(
    root: Path,
    fixtures: tuple[dict[str, object], ...],
) -> Path:
    manifest_path = root / "manifest.json"
    manifest_path.write_text(
        json.dumps({"fixtures": list(fixtures)}, indent=2),
        encoding="utf-8",
    )
    return manifest_path


def write_fixture_files(
    fixture_id: str,
    root: Path,
    *,
    duration_ms: int,
    sample_rate_hz: int,
    scores: tuple[tuple[int, float], ...],
) -> dict[str, str]:
    wav_path = root / "audio" / f"{fixture_id}.wav"
    scores_path = root / "scores" / f"{fixture_id}.jsonl"
    write_pcm16_mono_wav(
        wav_path,
        duration_ms=duration_ms,
        sample_rate_hz=sample_rate_hz,
    )
    write_scores(scores_path, scores)
    return {
        "scores": str(scores_path.relative_to(root)),
        "wav": str(wav_path.relative_to(root)),
    }


def write_pcm16_mono_wav(path: Path, *, duration_ms: int, sample_rate_hz: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame_count = int(sample_rate_hz * duration_ms / 1_000)
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate_hz)
        wav_file.writeframes(b"\0\0" * frame_count)


def write_scores(path: Path, scores: tuple[tuple[int, float], ...]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [
        json.dumps({"score": score, "timeMs": time_ms}, sort_keys=True)
        for time_ms, score in scores
    ]
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
