import json
import os
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

from setta.api.hot_reload import ListenerHotReloader
from setta.api.listener import SettaListener
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import TextBlockSectionImpl


class _StubWebsocket:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send(self, payload: str) -> None:
        self.sent.append(payload)


class SettaListenerHotReloadTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        super().setUp()
        self._mtime_offset = 1.0

    def _build_project_state(self) -> ProjectStateSingleConfig:
        section_impl = TextBlockSectionImpl(
            id="section-impl",
            name="Welcome",
            text="Hello",
        )
        section_variant = Variant(
            id="section-variant",
            name="Welcome Variant",
            impl=section_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
        )
        section_core = Core(
            id="section-welcome",
            name="Welcome",
            variants=[section_variant.id],
            defaultVariant=section_variant.id,
        )
        project_config = ProjectConfig(
            id="project-1",
            name="Demo Project",
            sectionVariantMap={section_core.id: section_variant.id},
            topLevelSections={section_core.id: TopLevelSectionLayout()},
        )
        return ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={section_core.id: section_core},
            sectionImpls={section_impl.id: section_impl},
            sectionVariants={section_variant.id: section_variant},
        )

    @staticmethod
    def _bump_mtime(module_path: Path, offset: float) -> None:
        current_stat = module_path.stat()
        new_mtime = current_stat.st_mtime + offset
        os.utime(module_path, (new_mtime, new_mtime))

    def _write_listener_module(self, module_path: Path, version: str) -> None:
        module_path.write_text(
            textwrap.dedent(
                f"""
                from setta.types.listener import ListenerFeed


                def build_callbacks(listener):
                    record = listener._test_invocations

                    @listener.listen(
                        deps=("Welcome",),
                        feed=ListenerFeed.PERSISTED,
                        run_on_refresh=True,
                    )
                    def on_change(state, ctx):
                        record.append("{version}")
                """
            )
        )
        self._bump_mtime(module_path, self._mtime_offset)
        self._mtime_offset += 1.0

    @staticmethod
    def _extract_callback_id(payload: str) -> str:
        message = json.loads(payload)
        callbacks = message["content"]["callbacks"]
        if len(callbacks) != 1:
            raise AssertionError("Unexpected callback payload shape")
        return next(iter(callbacks.keys()))

    async def test_reloader_cycles_update_callback_registration(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(project_name=project_state.projectConfig.name)
        listener._test_invocations = []  # type: ignore[attr-defined]
        websocket = _StubWebsocket()
        listener._websocket = websocket

        module_name = "hot_reload_listener_module"
        register_ids: list[str] = []

        with tempfile.TemporaryDirectory() as tmp_dir:
            module_dir = Path(tmp_dir)
            module_path = module_dir / f"{module_name}.py"
            sys.path.insert(0, tmp_dir)
            try:
                self._write_listener_module(module_path, "v1")
                reloader = ListenerHotReloader(
                    listener=listener,
                    module_name=module_name,
                    builder_name="build_callbacks",
                    paths={str(module_path)},
                )
                await reloader.reload_now(reload_module=False)

                await listener._handle_persisted_snapshot(
                    project_state,
                    is_bootstrap=True,
                )
                register_ids.append(self._extract_callback_id(websocket.sent[-1]))
                self.assertEqual(listener._test_invocations, ["v1"])

                self._write_listener_module(module_path, "v2")
                await reloader.reload_now(reload_module=True)
                register_ids.append(self._extract_callback_id(websocket.sent[-1]))
                self.assertEqual(listener._test_invocations, ["v1", "v2"])

                self._write_listener_module(module_path, "v3")
                await reloader.reload_now(reload_module=True)
                register_ids.append(self._extract_callback_id(websocket.sent[-1]))
                self.assertEqual(listener._test_invocations, ["v1", "v2", "v3"])
            finally:
                sys.modules.pop(module_name, None)
                if tmp_dir in sys.path:
                    sys.path.remove(tmp_dir)

        self.assertEqual(len(register_ids), 3)
        self.assertEqual(len(set(register_ids)), 3)
        self.assertEqual(len(listener._callbacks), 1)
        final_spec = next(iter(listener._callbacks.values()))
        self.assertEqual(final_spec.callback_id, register_ids[-1])
        self.assertIs(listener._websocket, websocket)
