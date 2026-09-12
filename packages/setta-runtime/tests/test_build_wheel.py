from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import _build_setta_wheel as build_setta_wheel
from scripts._stage_setta_wheel import StageAppInputs
from setta.runtime import RuntimeTarget


class WheelBuildContractTests(unittest.TestCase):
    def test_frontend_builds_shared_workspace_before_sorted_apps(self) -> None:
        with (
            mock.patch.object(
                build_setta_wheel.shutil, "which", return_value="/tools/pnpm"
            ),
            mock.patch.object(build_setta_wheel, "_run") as run,
        ):
            build_setta_wheel._run_frontend_build(None, {})
        self.assertEqual(
            run.call_args_list,
            [
                mock.call(
                    ["/tools/pnpm", "--filter", "@setta/workspace", "run", "build"],
                    build_setta_wheel.ROOT,
                ),
                mock.call(
                    ["/tools/pnpm", "--filter", "@setta/bench", "run", "build"],
                    build_setta_wheel.ROOT,
                ),
                mock.call(
                    ["/tools/pnpm", "--filter", "@setta/python-canvas", "run", "build"],
                    build_setta_wheel.ROOT,
                ),
                mock.call(
                    ["/tools/pnpm", "--filter", "@setta/realtime", "run", "build"],
                    build_setta_wheel.ROOT,
                ),
            ],
        )

    def test_frontend_build_uses_explicit_go_for_nested_contract_generation(
        self,
    ) -> None:
        explicit_go = Path("/locked/go/bin/go")
        with (
            mock.patch.object(
                build_setta_wheel.shutil, "which", return_value="/tools/pnpm"
            ),
            mock.patch.object(build_setta_wheel, "_run") as run,
        ):
            build_setta_wheel._run_frontend_build(None, {}, explicit_go)
        for call in run.call_args_list:
            environment = call.kwargs["environment"]
            self.assertEqual(
                environment["PATH"].split(build_setta_wheel.os.pathsep)[0],
                str(explicit_go.parent),
            )

    def test_wheel_build_uses_locked_backend_without_build_isolation(self) -> None:
        with (
            tempfile.TemporaryDirectory() as temporary_directory,
            mock.patch.object(
                build_setta_wheel.shutil, "which", return_value="/tools/uv"
            ),
            mock.patch.object(
                build_setta_wheel.subprocess,
                "run",
                return_value=subprocess.CompletedProcess(
                    ["uv", "--version"], 0, "uv 0.8.19 (locked)\n", ""
                ),
            ),
            mock.patch.object(build_setta_wheel, "_run") as run,
        ):
            wheel_directory = Path(temporary_directory) / "wheels"
            build_setta_wheel._run_uv_build(wheel_directory, "macosx_13_0_arm64")
        self.assertEqual(
            run.call_args_list,
            [
                mock.call(
                    [
                        "/tools/uv",
                        "build",
                        "--wheel",
                        "--no-build-isolation",
                        "--config-setting",
                        "setta-platform-tag=macosx_13_0_arm64",
                        "--out-dir",
                        str(wheel_directory),
                    ],
                    build_setta_wheel.ROOT,
                )
            ],
        )

    def test_macos_native_build_forces_the_claimed_deployment_target(self) -> None:
        with (
            mock.patch.object(
                build_setta_wheel.shutil, "which", return_value="/tools/go"
            ),
            mock.patch.object(build_setta_wheel, "_run") as run,
        ):
            build_setta_wheel._run_native_build(
                build_setta_wheel._APPS[0],
                Path("/tmp/python-canvas"),
                None,
                RuntimeTarget(os="darwin", arch="arm64"),
            )
        environment = run.call_args.kwargs["environment"]
        self.assertIn("-mod=readonly", run.call_args.args[0])
        self.assertEqual(environment["MACOSX_DEPLOYMENT_TARGET"], "13.0")
        self.assertIn("-mmacosx-version-min=13.0", environment["CGO_CFLAGS"])
        self.assertIn("-mmacosx-version-min=13.0", environment["CGO_LDFLAGS"])

    def test_linux_builder_rejects_missing_and_generic_platform_tags_before_building(
        self,
    ) -> None:
        target = RuntimeTarget(os="linux", arch="amd64")
        with mock.patch.object(
            build_setta_wheel, "current_target", return_value=target
        ):
            for platform_tag in (None, "linux_x86_64"):
                namespace = build_setta_wheel.argparse.Namespace(
                    target=None, wheel_platform_tag=platform_tag
                )
                with self.assertRaises(build_setta_wheel.BuildError):
                    build_setta_wheel.build(namespace)

    def test_windows_arm64_builder_rejects_before_frontend_or_native_build(
        self,
    ) -> None:
        target = RuntimeTarget(os="windows", arch="arm64")
        namespace = build_setta_wheel.argparse.Namespace(
            target=None, wheel_platform_tag=None
        )
        with (
            mock.patch.object(build_setta_wheel, "current_target", return_value=target),
            self.assertRaisesRegex(
                build_setta_wheel.BuildError,
                "unsupported Setta release target: windows-arm64",
            ),
        ):
            build_setta_wheel.build(namespace)

    def test_default_stage_is_replaced_only_after_owned_stage_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            default_stage = Path(temporary_directory) / "stage"
            (default_stage / "setta" / "_runtime").mkdir(parents=True)
            namespace = build_setta_wheel.argparse.Namespace(
                stage_dir=None, stage_only=True
            )
            target = RuntimeTarget(os="darwin", arch="arm64")
            with (
                mock.patch.object(
                    build_setta_wheel, "_DEFAULT_STAGE_DIR", default_stage
                ),
                mock.patch.object(
                    build_setta_wheel, "PackagedRuntime"
                ) as packaged_runtime,
                mock.patch.object(build_setta_wheel, "stage") as stage,
            ):
                result = build_setta_wheel._stage_and_maybe_wheel(
                    (
                        StageAppInputs(
                            "fixture-app", Path("native-server"), Path("web")
                        ),
                    ),
                    namespace,
                    target,
                    "macosx_13_0_arm64",
                )
                packaged_runtime.return_value.manifest.assert_called_once_with()
                self.assertEqual(result, default_stage)
                self.assertFalse(default_stage.exists())
                self.assertEqual(stage.call_args.kwargs, {})
                self.assertEqual(stage.call_args.args[0].output, default_stage)

    def test_path_overrides_require_unique_registered_app_ids(self) -> None:
        self.assertEqual(
            build_setta_wheel._path_overrides(
                ["realtime=/tmp/realtime"], "--native-server"
            ),
            {"realtime": Path("/tmp/realtime")},
        )
        for values in (["unknown=/tmp/server"], ["realtime=/a", "realtime=/b"]):
            with (
                self.subTest(values=values),
                self.assertRaises(build_setta_wheel.BuildError),
            ):
                build_setta_wheel._path_overrides(values, "--native-server")

    def test_build_stages_every_registered_app_from_explicit_inputs(self) -> None:
        target = RuntimeTarget(os="darwin", arch="arm64")
        namespace = build_setta_wheel.argparse.Namespace(
            target=None,
            wheel_platform_tag="macosx_13_0_arm64",
            native_server=[
                "bench=/native/bench",
                "realtime=/native/realtime",
                "python-canvas=/native/canvas",
            ],
            web_root=[
                "bench=/web/bench",
                "realtime=/web/realtime",
                "python-canvas=/web/canvas",
            ],
            skip_frontend_build=True,
            stage_only=True,
            stage_dir=Path("/stage"),
        )
        with (
            mock.patch.object(build_setta_wheel, "current_target", return_value=target),
            mock.patch.object(
                build_setta_wheel,
                "_stage_and_maybe_wheel",
                return_value=Path("/stage"),
            ) as stage,
        ):
            self.assertEqual(build_setta_wheel.build(namespace), Path("/stage"))
        apps = stage.call_args.args[0]
        self.assertEqual(
            apps,
            (
                StageAppInputs("bench", Path("/native/bench"), Path("/web/bench")),
                StageAppInputs(
                    "python-canvas", Path("/native/canvas"), Path("/web/canvas")
                ),
                StageAppInputs(
                    "realtime", Path("/native/realtime"), Path("/web/realtime")
                ),
            ),
        )

    def test_custom_stage_directory_is_never_cleared_by_the_orchestrator(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            custom_stage = Path(temporary_directory) / "stage"
            custom_stage.mkdir()
            namespace = build_setta_wheel.argparse.Namespace(stage_dir=custom_stage)
            target = RuntimeTarget(os="darwin", arch="arm64")
            with mock.patch.object(
                build_setta_wheel, "_DEFAULT_STAGE_DIR", custom_stage
            ):
                self.assertEqual(
                    build_setta_wheel._stage_directory_for(namespace, target),
                    custom_stage,
                )
                self.assertTrue(custom_stage.exists())
