#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path


BRANCH_PATTERN = re.compile(r"\b(?:if|elif|for|while|until|case|select)\b")
FUNCTION_PATTERN = re.compile(
    r"^\s*(?:function\s+)?(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*(?:\(\s*\))?\s*\{"
)
HEREDOC_PATTERN = re.compile(r"<<(?P<strip>-?)(?P<quote>['\"]?)(?P<name>[A-Za-z_][A-Za-z0-9_]*)\2")
OPEN_BRACE_PATTERN = re.compile(r"(?<!\S)\{(?=$|\s|;)")
CLOSE_BRACE_PATTERN = re.compile(r"(?<!\S)\}(?=$|\s|;)")


@dataclass
class HereDoc:
    delimiter: str
    strip_tabs: bool


@dataclass
class FunctionComplexity:
    path: Path
    function_name: str
    line_number: int
    complexity: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Measure cyclomatic complexity for shell functions.",
    )
    parser.add_argument("--max", dest="maximum", type=int, help="Maximum allowed function complexity.")
    parser.add_argument("--report", action="store_true", help="Print a sorted hotspot report instead of enforcing a maximum.")
    parser.add_argument("--top", type=int, default=20, help="Maximum report rows to print (report mode only).")
    parser.add_argument("--min", dest="minimum", type=int, default=1, help="Minimum complexity to include (report mode only).")
    parser.add_argument("paths", nargs="+", help="Shell script paths to analyze.")
    args = parser.parse_args()
    if args.report:
        if args.top < 1 or args.minimum < 1:
            parser.error("--top and --min must be positive integers")
    elif args.maximum is None or args.maximum < 0:
        parser.error("--max must be a non-negative integer when --report is not used")
    return args


def comment_starts(result: list[str]) -> bool:
    if not result:
        return True
    return result[-1].isspace() or result[-1] in ";("


def sanitize_single_quoted_segment(line: str, index: int, result: list[str]) -> int:
    result.append(" ")
    index += 1
    while index < len(line):
        result.append(" ")
        if line[index] == "'":
            return index + 1
        index += 1
    return index


def sanitize_double_quoted_segment(line: str, index: int, result: list[str]) -> int:
    result.append(" ")
    index += 1
    while index < len(line):
        result.append(" ")
        if line[index] == "\\" and index + 1 < len(line):
            result.append(" ")
            index += 2
            continue
        if line[index] == '"':
            return index + 1
        index += 1
    return index


def sanitize_line(line: str) -> str:
    result: list[str] = []
    index = 0
    while index < len(line):
        char = line[index]
        if char == "'":
            index = sanitize_single_quoted_segment(line, index, result)
            continue
        if char == '"':
            index = sanitize_double_quoted_segment(line, index, result)
            continue
        if char == "#" and comment_starts(result):
            break
        result.append(char)
        index += 1
    return "".join(result)


def here_doc_starts(raw_line: str, sanitized_line: str) -> list[HereDoc]:
    starts: list[HereDoc] = []
    for match in HEREDOC_PATTERN.finditer(raw_line):
        if sanitized_line[match.start():match.start() + 2] != "<<":
            continue
        starts.append(
            HereDoc(
                delimiter=match.group("name"),
                strip_tabs=match.group("strip") == "-",
            )
        )
    return starts


def here_doc_content_line(line: str, pending: list[HereDoc]) -> bool:
    if not pending:
        return False
    current = pending[0]
    candidate = line.lstrip("\t") if current.strip_tabs else line
    if candidate.strip() == current.delimiter:
        pending.pop(0)
    return True


def function_start(line: str) -> tuple[str, int] | None:
    match = FUNCTION_PATTERN.match(line)
    if not match:
        return None
    return match.group("name"), 1


def branch_count(line: str) -> int:
    return len(BRANCH_PATTERN.findall(line))


def brace_delta(line: str) -> int:
    return len(OPEN_BRACE_PATTERN.findall(line)) - len(CLOSE_BRACE_PATTERN.findall(line))


def iter_function_complexities(path: Path) -> list[FunctionComplexity]:
    findings: list[FunctionComplexity] = []
    pending_heredocs: list[HereDoc] = []
    active_function: FunctionComplexity | None = None
    brace_depth = 0
    with path.open("r", encoding="utf-8") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.rstrip("\n")
            if here_doc_content_line(line, pending_heredocs):
                continue
            sanitized = sanitize_line(line)
            pending_heredocs.extend(here_doc_starts(line, sanitized))
            if active_function is None:
                start = function_start(sanitized)
                if start is None:
                    continue
                active_function = FunctionComplexity(path, start[0], line_number, 1)
                brace_depth = brace_delta(sanitized)
                if brace_depth <= 0:
                    findings.append(active_function)
                    active_function = None
                continue
            active_function.complexity += branch_count(sanitized)
            brace_depth += brace_delta(sanitized)
            if brace_depth <= 0:
                findings.append(active_function)
                active_function = None
    return findings


def collect_findings(paths: list[str]) -> list[FunctionComplexity]:
    findings: list[FunctionComplexity] = []
    for raw_path in paths:
        path = Path(raw_path)
        findings.extend(iter_function_complexities(path))
    return findings


def check_mode(findings: list[FunctionComplexity], maximum: int) -> int:
    violations = [finding for finding in findings if finding.complexity > maximum]
    for finding in violations:
        print(
            f"{finding.path}:{finding.line_number} {finding.function_name} has a complexity of {finding.complexity}.",
            file=sys.stderr,
        )
    return 1 if violations else 0


def report_mode(findings: list[FunctionComplexity], top: int, minimum: int) -> int:
    filtered = [finding for finding in findings if finding.complexity >= minimum]
    filtered.sort(
        key=lambda finding: (
            -finding.complexity,
            str(finding.path),
            finding.line_number,
            finding.function_name,
        )
    )
    if not filtered:
        print(f"No shell hotspots found with complexity >= {minimum}.")
        return 0
    for finding in filtered[:top]:
        print(
            f"{finding.complexity:>4}  {finding.path}:{finding.line_number}  {finding.function_name}"
        )
    return 0


def main() -> int:
    args = parse_args()
    findings = collect_findings(args.paths)
    if args.report:
        return report_mode(findings, args.top, args.minimum)
    return check_mode(findings, args.maximum)


if __name__ == "__main__":
    raise SystemExit(main())
