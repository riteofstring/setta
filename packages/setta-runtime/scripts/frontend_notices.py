from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RUNTIME = ROOT / "packages" / "setta-runtime"
OUTPUT = RUNTIME / "licenses" / "frontend-NOTICES.txt"
SUPPLEMENTS = RUNTIME / "license-sources" / "frontend.json"
APPS = ("experiment-lens", "python-canvas", "realtime", "review")
LICENSE_NAME = re.compile(r"^(licen[cs]e|copying|notice)(?:$|[.-])", re.IGNORECASE)


def production_packages() -> dict[str, Path]:
    pnpm = shutil.which("pnpm")
    if pnpm is None:
        raise RuntimeError("pnpm is required; install the pinned contributor tools")
    command = [pnpm]
    for app in APPS:
        command.extend(("--filter", f"@setta/{app}"))
    command.extend(("list", "--prod", "--depth", "Infinity", "--json"))
    completed = subprocess.run(
        command, cwd=ROOT, check=True, capture_output=True, text=True
    )
    packages: dict[str, Path] = {}

    def visit(node: dict) -> None:
        for group in ("dependencies", "optionalDependencies"):
            for dependency in node.get(group, {}).values():
                directory = Path(dependency["path"])
                manifest = json.loads((directory / "package.json").read_text())
                name = manifest["name"]
                if not name.startswith("@setta/"):
                    packages[f"{name}@{manifest['version']}"] = directory
                visit(dependency)

    for project in json.loads(completed.stdout):
        visit(project)
    if not packages:
        raise RuntimeError(
            "no installed production dependencies; run frozen setup first"
        )
    return packages


def render_notices(packages: dict[str, Path], supplements: dict) -> str:
    sections = [
        (
            "Setta frontend third-party notices\n\n"
            "This inventory includes the installed production dependency graph of all "
            "four\napps, including optional and tree-shaken code that may not reach "
            "a browser.\nSeparate wheel dependencies retain their own distribution "
            "notices.\nRegenerate with: python "
            "packages/setta-runtime/scripts/frontend_notices.py --write\n"
        )
    ]
    for identity, directory in sorted(packages.items()):
        manifest = json.loads((directory / "package.json").read_text())
        texts = [
            f"Source: npm package {identity}/{path.name}\n\n"
            + path.read_text(encoding="utf-8").strip()
            for path in sorted(directory.iterdir())
            if path.is_file() and LICENSE_NAME.match(path.name)
        ]
        supplement = supplements.get(identity)
        if supplement is not None:
            texts.append(
                f"Source: {supplement['source']}\n\n{supplement['text'].strip()}"
            )
        if not texts:
            raise RuntimeError(f"missing license text for {identity}")
        sections.append(
            f"{'=' * 72}\n{identity}\n"
            f"Declared license: {manifest.get('license', 'see notices')}\n\n"
            + "\n\n".join(texts)
        )
    return "\n\n".join(sections) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    arguments = parser.parse_args()
    try:
        packages = production_packages()
        supplements = json.loads(SUPPLEMENTS.read_text(encoding="utf-8"))
        expected = render_notices(packages, supplements)
        if arguments.write:
            OUTPUT.write_text(expected, encoding="utf-8")
        elif not OUTPUT.is_file() or OUTPUT.read_text(encoding="utf-8") != expected:
            parser.exit(1, "Frontend notices need regeneration with --write.\n")
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Frontend notices: {error}\n")
    print(f"Frontend notices cover {len(packages)} exact dependency releases.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
