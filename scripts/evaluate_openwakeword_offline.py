#!/usr/bin/env python3

import argparse
import json
import sys
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True

EXPECTED_CHANNELS = 1
EXPECTED_SAMPLE_RATE_HZ = 16_000
EXPECTED_SAMPLE_WIDTH_BYTES = 2
VALID_LABELS = frozenset(("positive", "negative"))


class EvaluationInputError(ValueError):
    pass


@dataclass(frozen=True)
class ScorePoint:
    time_ms: float
    score: float


@dataclass(frozen=True)
class WavSummary:
    channels: int
    duration_ms: float
    frame_count: int
    sample_rate_hz: int
    sample_width_bytes: int


@dataclass(frozen=True)
class FixtureSpec:
    fixture_id: str
    label: str
    scores_path: Path
    wav_path: Path
    wake_end_ms: float | None
    wake_start_ms: float | None


@dataclass(frozen=True)
class FixtureResult:
    accepted: bool
    duration_ms: float
    first_crossing_ms: float | None
    fixture_id: str
    label: str
    max_score: float
    result: str
    wake_latency_ms: float | None


@dataclass(frozen=True)
class EvaluationSummary:
    accepted_positive_count: int
    average_accepted_wake_latency_ms: float | None
    fixture_count: int
    negative_count: int
    negative_duration_hours: float | None
    negative_false_accept_rate_per_hour: float | None
    negative_false_accepts: int
    positive_count: int
    positive_false_reject_rate: float | None
    positive_false_rejects: int


@dataclass(frozen=True)
class EvaluationReport:
    fixtures: tuple[FixtureResult, ...]
    summary: EvaluationSummary
    threshold: float


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate openWakeWord wake-score traces against WAV fixture labels."
        )
    )
    parser.add_argument(
        "--manifest",
        required=True,
        type=Path,
        help="JSON manifest containing WAV fixtures and JSONL wake-score traces.",
    )
    parser.add_argument(
        "--threshold",
        required=True,
        type=float,
        help="Wake score threshold in the inclusive range [0.0, 1.0].",
    )
    parser.add_argument(
        "--output",
        choices=("json", "text"),
        default="text",
        help="Report format. Defaults to text.",
    )
    return parser.parse_args(argv)


def evaluate_manifest(manifest_path: Path, threshold: float) -> EvaluationReport:
    validate_probability(threshold, "threshold")
    specs = load_manifest(manifest_path)
    results = tuple(evaluate_fixture(spec, threshold) for spec in specs)
    return EvaluationReport(
        fixtures=results,
        summary=summarize_results(results),
        threshold=threshold,
    )


def load_manifest(manifest_path: Path) -> tuple[FixtureSpec, ...]:
    manifest = read_json_object(manifest_path, "manifest")
    raw_fixtures = manifest.get("fixtures")
    if not isinstance(raw_fixtures, list) or len(raw_fixtures) == 0:
        raise EvaluationInputError(
            f"{manifest_path}: manifest fixtures must be a non-empty list"
        )

    manifest_dir = manifest_path.parent
    return tuple(
        parse_fixture_spec(manifest_path, manifest_dir, raw_fixture, index)
        for index, raw_fixture in enumerate(raw_fixtures)
    )


def read_json_object(path: Path, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise EvaluationInputError(f"{path}: unable to read {label}: {error}") from error
    except json.JSONDecodeError as error:
        raise EvaluationInputError(f"{path}: invalid {label} JSON: {error}") from error
    if not isinstance(payload, dict):
        raise EvaluationInputError(f"{path}: {label} must be a JSON object")
    return payload


def parse_fixture_spec(
    manifest_path: Path,
    manifest_dir: Path,
    raw_fixture: Any,
    index: int,
) -> FixtureSpec:
    label = f"{manifest_path}: fixtures[{index}]"
    if not isinstance(raw_fixture, dict):
        raise EvaluationInputError(f"{label} must be a JSON object")

    fixture_label = require_string(raw_fixture, "label", label)
    if fixture_label not in VALID_LABELS:
        raise EvaluationInputError(
            f"{label}.label must be one of {sorted(VALID_LABELS)}, "
            f"found {fixture_label!r}"
        )

    wake_start_ms = optional_number(raw_fixture, "wakeStartMs", label)
    wake_end_ms = optional_number(raw_fixture, "wakeEndMs", label)
    if fixture_label == "positive":
        if wake_start_ms is None or wake_end_ms is None:
            raise EvaluationInputError(
                f"{label}: positive fixtures require wakeStartMs and wakeEndMs"
            )
        if wake_start_ms > wake_end_ms:
            raise EvaluationInputError(
                f"{label}: wakeStartMs must be less than or equal to wakeEndMs"
            )
    elif wake_start_ms is not None or wake_end_ms is not None:
        raise EvaluationInputError(
            f"{label}: negative fixtures must not declare a wake window"
        )

    return FixtureSpec(
        fixture_id=require_string(raw_fixture, "id", label),
        label=fixture_label,
        scores_path=resolve_manifest_path(
            manifest_dir, require_string(raw_fixture, "scores", label)
        ),
        wav_path=resolve_manifest_path(
            manifest_dir, require_string(raw_fixture, "wav", label)
        ),
        wake_end_ms=wake_end_ms,
        wake_start_ms=wake_start_ms,
    )


def require_string(raw_fixture: dict[str, Any], field: str, label: str) -> str:
    value = raw_fixture.get(field)
    if not isinstance(value, str) or value == "":
        raise EvaluationInputError(f"{label}.{field} must be a non-empty string")
    return value


def optional_number(raw_fixture: dict[str, Any], field: str, label: str) -> float | None:
    if field not in raw_fixture:
        return None
    value = raw_fixture[field]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise EvaluationInputError(f"{label}.{field} must be a number")
    if value < 0:
        raise EvaluationInputError(f"{label}.{field} must be non-negative")
    return float(value)


def resolve_manifest_path(manifest_dir: Path, raw_path: str) -> Path:
    path = Path(raw_path)
    if path.is_absolute():
        return path
    return manifest_dir / path


def evaluate_fixture(spec: FixtureSpec, threshold: float) -> FixtureResult:
    wav_summary = read_wav_summary(spec.wav_path)
    scores = load_score_trace(spec.scores_path)
    validate_score_times(spec, wav_summary, scores)

    first_crossing = next(
        (point for point in scores if point.score >= threshold),
        None,
    )
    max_score = max(point.score for point in scores)
    first_crossing_ms = first_crossing.time_ms if first_crossing is not None else None

    if spec.label == "positive":
        return positive_result(spec, wav_summary, max_score, first_crossing_ms)
    return negative_result(spec, wav_summary, max_score, first_crossing_ms)


def read_wav_summary(path: Path) -> WavSummary:
    try:
        with wave.open(str(path), "rb") as wav_file:
            summary = WavSummary(
                channels=wav_file.getnchannels(),
                duration_ms=wav_file.getnframes() * 1_000.0 / wav_file.getframerate(),
                frame_count=wav_file.getnframes(),
                sample_rate_hz=wav_file.getframerate(),
                sample_width_bytes=wav_file.getsampwidth(),
            )
    except (OSError, wave.Error) as error:
        raise EvaluationInputError(f"{path}: unable to read WAV fixture: {error}") from error

    findings = []
    if summary.channels != EXPECTED_CHANNELS:
        findings.append(f"{summary.channels} channel(s)")
    if summary.sample_rate_hz != EXPECTED_SAMPLE_RATE_HZ:
        findings.append(f"{summary.sample_rate_hz} Hz")
    if summary.sample_width_bytes != EXPECTED_SAMPLE_WIDTH_BYTES:
        findings.append(f"{summary.sample_width_bytes} byte samples")
    if findings:
        expected = (
            f"{EXPECTED_CHANNELS} channel, {EXPECTED_SAMPLE_RATE_HZ} Hz, "
            f"{EXPECTED_SAMPLE_WIDTH_BYTES} byte PCM"
        )
        raise EvaluationInputError(
            f"{path}: expected {expected}; found {', '.join(findings)}"
        )
    if summary.frame_count <= 0:
        raise EvaluationInputError(f"{path}: WAV fixture must contain audio frames")
    return summary


def load_score_trace(path: Path) -> tuple[ScorePoint, ...]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        raise EvaluationInputError(f"{path}: unable to read score trace: {error}") from error

    scores = tuple(
        parse_score_line(path, line, line_index)
        for line_index, line in enumerate(lines, start=1)
        if line.strip()
    )
    if len(scores) == 0:
        raise EvaluationInputError(f"{path}: score trace must contain at least one row")
    validate_monotonic_score_times(path, scores)
    return scores


def parse_score_line(path: Path, line: str, line_index: int) -> ScorePoint:
    try:
        payload = json.loads(line)
    except json.JSONDecodeError as error:
        raise EvaluationInputError(
            f"{path}:{line_index}: invalid score trace JSON: {error}"
        ) from error
    if not isinstance(payload, dict):
        raise EvaluationInputError(f"{path}:{line_index}: score row must be an object")
    return ScorePoint(
        time_ms=required_probability_time(path, line_index, payload, "timeMs"),
        score=required_probability_time(path, line_index, payload, "score"),
    )


def required_probability_time(
    path: Path,
    line_index: int,
    payload: dict[str, Any],
    field: str,
) -> float:
    value = payload.get(field)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise EvaluationInputError(f"{path}:{line_index}: {field} must be a number")
    if field == "score":
        validate_probability(float(value), f"{path}:{line_index}: score")
    elif value < 0:
        raise EvaluationInputError(f"{path}:{line_index}: timeMs must be non-negative")
    return float(value)


def validate_probability(value: float, label: str) -> None:
    if value < 0.0 or value > 1.0:
        raise EvaluationInputError(f"{label} must be in the inclusive range [0.0, 1.0]")


def validate_monotonic_score_times(path: Path, scores: tuple[ScorePoint, ...]) -> None:
    previous_time = scores[0].time_ms
    for score in scores[1:]:
        if score.time_ms < previous_time:
            raise EvaluationInputError(f"{path}: score timeMs values must be monotonic")
        previous_time = score.time_ms


def validate_score_times(
    spec: FixtureSpec,
    wav_summary: WavSummary,
    scores: tuple[ScorePoint, ...],
) -> None:
    for point in scores:
        if point.time_ms > wav_summary.duration_ms:
            raise EvaluationInputError(
                f"{spec.scores_path}: score at {point.time_ms:.3f} ms exceeds "
                f"{spec.wav_path} duration {wav_summary.duration_ms:.3f} ms"
            )


def positive_result(
    spec: FixtureSpec,
    wav_summary: WavSummary,
    max_score: float,
    first_crossing_ms: float | None,
) -> FixtureResult:
    assert spec.wake_start_ms is not None
    assert spec.wake_end_ms is not None

    if first_crossing_ms is None:
        accepted = False
        result = "missed_wake"
        latency = None
    elif spec.wake_start_ms <= first_crossing_ms <= spec.wake_end_ms:
        accepted = True
        result = "accepted_wake"
        latency = first_crossing_ms - spec.wake_start_ms
    else:
        accepted = False
        result = "wake_outside_expected_window"
        latency = None

    return FixtureResult(
        accepted=accepted,
        duration_ms=wav_summary.duration_ms,
        first_crossing_ms=first_crossing_ms,
        fixture_id=spec.fixture_id,
        label=spec.label,
        max_score=max_score,
        result=result,
        wake_latency_ms=latency,
    )


def negative_result(
    spec: FixtureSpec,
    wav_summary: WavSummary,
    max_score: float,
    first_crossing_ms: float | None,
) -> FixtureResult:
    return FixtureResult(
        accepted=first_crossing_ms is None,
        duration_ms=wav_summary.duration_ms,
        first_crossing_ms=first_crossing_ms,
        fixture_id=spec.fixture_id,
        label=spec.label,
        max_score=max_score,
        result="false_accept" if first_crossing_ms is not None else "true_reject",
        wake_latency_ms=None,
    )


def summarize_results(results: tuple[FixtureResult, ...]) -> EvaluationSummary:
    positives = tuple(result for result in results if result.label == "positive")
    negatives = tuple(result for result in results if result.label == "negative")
    positive_false_rejects = sum(1 for result in positives if not result.accepted)
    negative_false_accepts = sum(
        1 for result in negatives if result.result == "false_accept"
    )
    negative_duration_hours = sum(result.duration_ms for result in negatives) / 3_600_000
    accepted_latencies = tuple(
        result.wake_latency_ms
        for result in positives
        if result.wake_latency_ms is not None
    )

    return EvaluationSummary(
        accepted_positive_count=len(accepted_latencies),
        average_accepted_wake_latency_ms=average_or_none(accepted_latencies),
        fixture_count=len(results),
        negative_count=len(negatives),
        negative_duration_hours=none_if_zero(negative_duration_hours),
        negative_false_accept_rate_per_hour=rate_or_none(
            negative_false_accepts, negative_duration_hours
        ),
        negative_false_accepts=negative_false_accepts,
        positive_count=len(positives),
        positive_false_reject_rate=rate_or_none(
            positive_false_rejects, len(positives)
        ),
        positive_false_rejects=positive_false_rejects,
    )


def average_or_none(values: tuple[float, ...]) -> float | None:
    if len(values) == 0:
        return None
    return sum(values) / len(values)


def none_if_zero(value: float) -> float | None:
    if value == 0:
        return None
    return value


def rate_or_none(numerator: float, denominator: float) -> float | None:
    if denominator == 0:
        return None
    return numerator / denominator


def report_to_json(report: EvaluationReport) -> dict[str, Any]:
    return {
        "fixtures": [fixture_result_to_json(result) for result in report.fixtures],
        "summary": summary_to_json(report.summary),
        "threshold": report.threshold,
    }


def fixture_result_to_json(result: FixtureResult) -> dict[str, Any]:
    return {
        "accepted": result.accepted,
        "durationMs": result.duration_ms,
        "firstCrossingMs": result.first_crossing_ms,
        "id": result.fixture_id,
        "label": result.label,
        "maxScore": result.max_score,
        "result": result.result,
        "wakeLatencyMs": result.wake_latency_ms,
    }


def summary_to_json(summary: EvaluationSummary) -> dict[str, Any]:
    return {
        "acceptedPositiveCount": summary.accepted_positive_count,
        "averageAcceptedWakeLatencyMs": summary.average_accepted_wake_latency_ms,
        "fixtureCount": summary.fixture_count,
        "negativeCount": summary.negative_count,
        "negativeDurationHours": summary.negative_duration_hours,
        "negativeFalseAcceptRatePerHour": summary.negative_false_accept_rate_per_hour,
        "negativeFalseAccepts": summary.negative_false_accepts,
        "positiveCount": summary.positive_count,
        "positiveFalseRejectRate": summary.positive_false_reject_rate,
        "positiveFalseRejects": summary.positive_false_rejects,
    }


def render_text_report(report: EvaluationReport) -> str:
    summary = report.summary
    lines = [
        "openWakeWord offline wake-score evaluation",
        f"threshold: {report.threshold:.3f}",
        (
            f"fixtures: {summary.fixture_count} "
            f"({summary.positive_count} positive, {summary.negative_count} negative)"
        ),
        (
            f"positive false rejects: {summary.positive_false_rejects}/"
            f"{summary.positive_count} "
            f"({format_rate(summary.positive_false_reject_rate)})"
        ),
        (
            f"negative false accepts: {summary.negative_false_accepts}/"
            f"{summary.negative_count} "
            f"({format_float(summary.negative_false_accept_rate_per_hour)} per hour)"
        ),
        (
            "average accepted wake latency: "
            f"{format_float(summary.average_accepted_wake_latency_ms)} ms"
        ),
        "",
        "fixture results:",
    ]
    lines.extend(render_fixture_line(result) for result in report.fixtures)
    return "\n".join(lines)


def render_fixture_line(result: FixtureResult) -> str:
    return (
        f"- {result.fixture_id}: {result.result}; label={result.label}; "
        f"duration={result.duration_ms:.1f} ms; maxScore={result.max_score:.3f}; "
        f"firstCrossing={format_float(result.first_crossing_ms)} ms"
    )


def format_rate(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:.2%}"


def format_float(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:.3f}"


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        report = evaluate_manifest(args.manifest, args.threshold)
    except EvaluationInputError as error:
        print(f"wake evaluator input error: {error}", file=sys.stderr)
        return 2

    if args.output == "json":
        print(json.dumps(report_to_json(report), indent=2, sort_keys=True))
    else:
        print(render_text_report(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
