#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_REPORT_PATH = ROOT_DIR / "reports" / "deadcode" / "aggregate.json"


def main() -> int:
    parser = argparse.ArgumentParser(description="Filter dead-code candidates from aggregate.json.")
    parser.add_argument(
        "--report",
        default=str(DEFAULT_REPORT_PATH),
        help="Path to the aggregate dead-code report.",
    )
    parser.add_argument("--language", help="Filter by language.")
    parser.add_argument("--lane", help="Filter by lane.")
    parser.add_argument("--bucket", help="Filter by bucket.")
    parser.add_argument("--tool", help="Filter by tool.")
    parser.add_argument("--confidence", help="Filter by confidence.")
    parser.add_argument("--path-contains", help="Keep only findings whose path contains this text.")
    parser.add_argument("--symbol-contains", help="Keep only findings whose symbol contains this text.")
    parser.add_argument("--limit", type=int, default=50, help="Maximum findings to print.")
    parser.add_argument(
        "--format",
        choices=("text", "json"),
        default="text",
        help="Output format.",
    )
    args = parser.parse_args()

    report_path = Path(args.report).resolve(strict=False)
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    findings = payload.get("findings", [])
    filtered = [
        finding
        for finding in findings
        if matches_filter(finding, "language", args.language)
        and matches_filter(finding, "lane", args.lane)
        and matches_filter(finding, "bucket", args.bucket)
        and matches_filter(finding, "tool", args.tool)
        and matches_filter(finding, "confidence", args.confidence)
        and matches_contains(finding.get("path"), args.path_contains)
        and matches_contains(finding.get("symbol"), args.symbol_contains)
    ]
    limited = filtered[: max(args.limit, 0)]

    if args.format == "json":
        print(
            json.dumps(
                {
                    "report": report_path.as_posix(),
                    "matched": len(filtered),
                    "returned": len(limited),
                    "findings": limited,
                },
                indent=2,
            )
        )
        return 0

    print(f"report: {report_path.as_posix()}")
    print(f"matched: {len(filtered)} returned: {len(limited)}")
    for finding in limited:
        location = finding.get("path", "")
        line = finding.get("line")
        if line:
            location = f"{location}:{line}"
        symbol = finding.get("symbol") or "-"
        print(
            " | ".join(
                [
                    str(finding.get("language", "-")),
                    str(finding.get("lane", "-")),
                    str(finding.get("bucket", "-")),
                    str(finding.get("confidence", "-")),
                    str(finding.get("tool", "-")),
                    location,
                    symbol,
                ]
            )
        )
    return 0


def matches_filter(finding: dict[str, Any], field: str, expected: str | None) -> bool:
    if expected is None:
        return True
    return str(finding.get(field, "")).lower() == expected.lower()


def matches_contains(value: Any, needle: str | None) -> bool:
    if needle is None:
        return True
    return needle.lower() in str(value or "").lower()


if __name__ == "__main__":
    raise SystemExit(main())
