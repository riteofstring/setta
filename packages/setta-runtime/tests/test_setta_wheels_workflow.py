from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github" / "workflows" / "setta-wheels.yml"


class SettaWheelsWorkflowContractTests(unittest.TestCase):
    def test_path_filters_cover_all_repository_owned_wheel_build_inputs(self) -> None:
        contents = WORKFLOW.read_text(encoding="utf-8")
        pull_request_paths = _event_path_filters(contents, "pull_request")
        push_paths = _event_path_filters(contents, "push")
        self.assertEqual(pull_request_paths, push_paths)

        for build_input in (
            "packages/workspace/src/index.ts",
            "pnpm-workspace.yaml",
            "scripts/compile-katex-styles.mjs",
            "scripts/check-package-boundary.mjs",
            "scripts/lib/process.mjs",
            "fixtures/packed-consumer/package.json",
            "fixtures/packed-consumer/package.template.json",
            "packages/local-backend/localweb/localweb.go",
            "examples/workspace-playground/package.json",
            "apps/experiment-lens/src/main.tsx",
            "apps/experiment-lens/backend/cmd/experiment-lens/main.go",
            "apps/realtime/src/main.tsx",
            "apps/realtime/backend/cmd/realtime/main.go",
            "apps/review/src/main.tsx",
            "apps/review/backend/cmd/review/main.go",
        ):
            self.assertTrue(
                _is_covered_by_any_path_filter(build_input, pull_request_paths),
                f"wheel workflow does not run when {build_input} changes",
            )

        self.assertFalse(
            _is_covered_by_any_path_filter(
                "examples/workspace-playground/src/main.tsx", pull_request_paths
            ),
            "the wheel workflow must not run for unrelated playground source",
        )

    def test_linux_native_build_is_offline_with_exact_prepared_inputs(self) -> None:
        contents = WORKFLOW.read_text(encoding="utf-8")
        linux = contents.split("\n  linux-wheel:\n", 1)[1].split(
            "\n  windows-wheel:\n", 1
        )[0]

        for required in (
            "go -C packages/local-backend mod verify",
            "go -C apps/experiment-lens/backend mod verify",
            "go -C apps/python-canvas/backend mod verify",
            "go -C apps/realtime/backend mod verify",
            "go -C apps/review/backend mod verify",
            'host_go_mod_cache="$(go env GOMODCACHE)"',
            'test -d "$host_go_mod_cache"',
            "mkdir -p build/setta-native/go-build-cache",
            "--network none",
            '--volume "$host_go_mod_cache:/setta-go-mod-cache:ro"',
            "--env GOCACHE=/workspace/build/setta-native/go-build-cache",
            "--env GOMODCACHE=/setta-go-mod-cache",
            "--env GOTOOLCHAIN=local",
            "--env GOPROXY=off",
            "--env GOSUMDB=off",
            "--env HOME=/tmp",
            "go build -mod=readonly",
        ):
            self.assertIn(required, linux)

        self.assertLess(
            linux.index("go -C apps/realtime/backend mod verify"),
            linux.index("Build all native servers in pinned manylinux 2.28"),
        )
        self.assertEqual(linux.count("--network none"), 5)

    def test_every_platform_builds_and_packages_all_registered_apps(self) -> None:
        contents = WORKFLOW.read_text(encoding="utf-8")
        jobs = {
            "macos": contents.split("\n  macos-wheel:\n", 1)[1].split(
                "\n  linux-wheel:\n", 1
            )[0],
            "linux": contents.split("\n  linux-wheel:\n", 1)[1].split(
                "\n  windows-wheel:\n", 1
            )[0],
            "windows": contents.split("\n  windows-wheel:\n", 1)[1],
        }

        for name, job in jobs.items():
            with self.subTest(job=name):
                for required in (
                    "pnpm install --frozen-lockfile --ignore-scripts",
                    "go -C packages/local-backend test ./...",
                    "go -C packages/local-backend mod verify",
                    "go -C apps/experiment-lens/backend test ./...",
                    "go -C apps/experiment-lens/backend mod verify",
                    "go -C apps/python-canvas/backend test ./...",
                    "go -C apps/python-canvas/backend mod verify",
                    "go -C apps/realtime/backend test ./...",
                    "go -C apps/realtime/backend mod verify",
                    "go -C apps/review/backend test ./...",
                    "go -C apps/review/backend mod verify",
                    "pnpm --filter @riteofstring/setta run build",
                    "pnpm --filter @setta/experiment-lens run build",
                    "pnpm --filter @setta/python-canvas run build",
                    "pnpm --filter @setta/realtime run build",
                    "pnpm --filter @setta/review run build",
                    '--native-server "experiment-lens=',
                    '--native-server "python-canvas=',
                    '--native-server "realtime=',
                    '--native-server "review=',
                    '--web-root "experiment-lens=apps/experiment-lens/dist"',
                    '--web-root "python-canvas=apps/python-canvas/dist"',
                    '--web-root "realtime=apps/realtime/dist"',
                    '--web-root "review=apps/review/dist"',
                    "--skip-frontend-build",
                    "packages/local-backend/.go-version",
                    "apps/experiment-lens/backend/.go-version",
                    "apps/realtime/backend/.go-version",
                    "apps/review/backend/.go-version",
                ):
                    self.assertIn(required, job)
                self.assertEqual(job.count('--native-server "experiment-lens='), 1)
                self.assertEqual(job.count('--native-server "python-canvas='), 1)
                self.assertEqual(job.count('--native-server "realtime='), 1)
                self.assertEqual(job.count('--native-server "review='), 1)

        for backend in ("experiment-lens", "python-canvas", "realtime", "review"):
            self.assertIn(f"go -C apps/{backend}/backend build", jobs["macos"])
            self.assertIn(f"go -C apps/{backend}/backend build", jobs["windows"])
            self.assertIn(f"--workdir /workspace/apps/{backend}/backend", jobs["linux"])
            self.assertIn(f"-o /workspace/build/setta-native/{backend}", jobs["linux"])

        self.assertNotIn("--native-server build/setta-native", contents)

    def test_linux_abi_audit_uses_the_digest_pinned_image_tool(self) -> None:
        contents = WORKFLOW.read_text(encoding="utf-8")
        linux = contents.split("\n  linux-wheel:\n", 1)[1].split(
            "\n  windows-wheel:\n", 1
        )[0]

        self.assertIn("name: Verify manylinux ABI with image-pinned auditwheel", linux)
        self.assertIn("command -v auditwheel >/dev/null", linux)
        self.assertIn("auditwheel --version", linux)
        self.assertIn('auditwheel show "/workspace/dist/${WHEEL_NAME}"', linux)
        self.assertIn(
            "python packages/setta-runtime/scripts/check_auditwheel_report.py", linux
        )
        self.assertIn("--report build/auditwheel-show.txt", linux)
        self.assertIn('--expected-architecture "${{ matrix.architecture }}"', linux)
        self.assertIn("--max-glibc-minor 28", linux)
        self.assertNotIn('python - "${{ matrix.architecture }}"', linux)
        self.assertNotIn("uv tool run --from auditwheel", linux)

    def test_macos_uses_active_hosted_runners_with_the_macos_13_abi_floor(self) -> None:
        contents = WORKFLOW.read_text(encoding="utf-8")
        macos = contents.split("\n  macos-wheel:\n", 1)[1].split(
            "\n  linux-wheel:\n", 1
        )[0]

        self.assertIn("runner: macos-15-intel", macos)
        self.assertIn("runner: macos-15", macos)
        self.assertIn("wheel_platform_tag: macosx_13_0_x86_64", macos)
        self.assertIn("wheel_platform_tag: macosx_13_0_arm64", macos)
        self.assertNotIn("runner: macos-13", macos)
        self.assertNotIn("runner: macos-14", macos)

    def test_ci_declares_the_same_five_release_platforms(self) -> None:
        contents = WORKFLOW.read_text(encoding="utf-8")
        for target_marker, platform_tag_marker in (
            ("target: darwin-amd64", "wheel_platform_tag: macosx_13_0_x86_64"),
            ("target: darwin-arm64", "wheel_platform_tag: macosx_13_0_arm64"),
            ("target: linux-amd64", "wheel_platform_tag: manylinux_2_28_x86_64"),
            ("target: linux-arm64", "wheel_platform_tag: manylinux_2_28_aarch64"),
            ("--target windows-amd64", "--wheel-platform-tag win_amd64"),
        ):
            self.assertIn(target_marker, contents)
            self.assertIn(platform_tag_marker, contents)
        self.assertNotIn("windows-arm64", contents)
        self.assertNotIn("win_arm64", contents)


def _event_path_filters(contents: str, event: str) -> tuple[str, ...]:
    if event == "pull_request":
        block = contents.split("\n  pull_request:\n", 1)[1].split("\n  push:\n", 1)[0]
    elif event == "push":
        block = contents.split("\n  push:\n", 1)[1].split("\n  workflow_dispatch:", 1)[
            0
        ]
    else:
        raise ValueError(f"unsupported workflow event: {event}")
    return tuple(re.findall(r'^      - "([^"]+)"$', block, flags=re.MULTILINE))


def _is_covered_by_any_path_filter(path: str, filters: tuple[str, ...]) -> bool:
    return any(_path_filter_matches(pattern, path) for pattern in filters)


def _path_filter_matches(pattern: str, path: str) -> bool:
    expression = re.escape(pattern)
    expression = expression.replace(r"\*\*", ".*").replace(r"\*", "[^/]*")
    return re.fullmatch(expression, path) is not None


if __name__ == "__main__":
    unittest.main()
