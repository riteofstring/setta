import importlib
import json
import os
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path
from typing import cast

from setta.api.hot_reload import ListenerHotReloader
from setta.api.listener import SettaListener
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import TextBlockSectionImpl
from watchfiles import Change
from websockets import ClientConnection


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
            id=ID("section-impl"),
            name="Welcome",
            text="Hello",
        )
        section_variant = Variant(
            id=ID("section-variant"),
            name="Welcome Variant",
            impl=section_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
        )
        section_core = Core(
            id=ID("section-welcome"),
            name="Welcome",
            variants=[section_variant.id],
            defaultVariant=section_variant.id,
        )
        project_config = ProjectConfig(
            id=ID("project-1"),
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
                def build_callbacks(listener):
                    record = listener._test_invocations

                    @listener.listen(
                        deps=("Welcome",),
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
        self._init_listener_invocations(listener)
        websocket = _StubWebsocket()
        listener._websocket = cast("ClientConnection", websocket)

        module_name = "hot_reload_listener_module"
        register_ids: list[str] = []

        with tempfile.TemporaryDirectory() as tmp_dir:
            module_dir = Path(tmp_dir)
            module_path = module_dir / f"{module_name}.py"
            sys.path.insert(0, tmp_dir)
            try:
                self._write_listener_module(module_path, "v1")
                module = importlib.import_module(module_name)
                reloader = ListenerHotReloader(
                    listener=listener,
                    builder=module.build_callbacks,
                )
                await reloader.reload_now(reload_module=False)

                await listener._refresh_from_snapshot(project_state)
                register_ids.append(self._extract_callback_id(websocket.sent[-1]))
                self.assertEqual(self._get_listener_invocations(listener), ["v1"])

                self._write_listener_module(module_path, "v2")
                await reloader.reload_now(reload_module=True)
                register_ids.append(self._extract_callback_id(websocket.sent[-1]))
                self.assertEqual(
                    self._get_listener_invocations(listener), ["v1", "v2"]
                )

                self._write_listener_module(module_path, "v3")
                await reloader.reload_now(reload_module=True)
                register_ids.append(self._extract_callback_id(websocket.sent[-1]))
                self.assertEqual(
                    self._get_listener_invocations(listener), ["v1", "v2", "v3"]
                )
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

    async def test_reloader_infers_watch_paths_from_builder(self) -> None:
        listener = SettaListener(project_name="Demo Project")

        module_name = "hot_reload_package_listener"

        with tempfile.TemporaryDirectory() as tmp_dir:
            module_dir = Path(tmp_dir) / module_name
            module_dir.mkdir()
            module_path = module_dir / "__init__.py"
            extra_path = module_dir / "builder_helpers.py"
            extra_path.write_text("# helper module\n")
            sys.path.insert(0, tmp_dir)
            try:
                self._write_listener_module(module_path, "pkg")
                module = importlib.import_module(module_name)
                reloader = ListenerHotReloader(
                    listener=listener,
                    builder=module.build_callbacks,
                    extra_watch_paths={str(extra_path)},
                )
                inferred_paths = {path for path in reloader._paths}
                self.assertIn(module_path.resolve(), inferred_paths)
                self.assertIn(module_dir.resolve(), inferred_paths)
                self.assertIn(extra_path.resolve(), inferred_paths)
            finally:
                sys.modules.pop(module_name, None)
                if tmp_dir in sys.path:
                    sys.path.remove(tmp_dir)

    async def test_reloader_supports_glob_paths_and_ignore_patterns(self) -> None:
        listener = SettaListener(project_name="Demo Project")
        module_name = "hot_reload_glob_listener"

        with tempfile.TemporaryDirectory() as tmp_dir:
            module_dir = Path(tmp_dir)
            module_path = module_dir / f"{module_name}.py"
            callbacks_dir = module_dir / "callbacks"
            callbacks_dir.mkdir()
            nested_dir = callbacks_dir / "nested"
            nested_dir.mkdir()
            nested_module = nested_dir / "extra.py"
            nested_module.write_text("# sample nested module\n")
            sys.path.insert(0, tmp_dir)
            try:
                self._write_listener_module(module_path, "glob")
                module = importlib.import_module(module_name)
                glob_pattern = str((callbacks_dir / "**" / "*.py"))
                reloader = ListenerHotReloader(
                    listener=listener,
                    builder=module.build_callbacks,
                    extra_watch_paths=[glob_pattern],
                )
                spec_by_root = {spec.root: spec for spec in reloader._watch_specs}
                callbacks_root = callbacks_dir.resolve()
                self.assertIn(callbacks_root, spec_by_root)
                callbacks_spec = spec_by_root[callbacks_root]
                self.assertFalse(callbacks_spec.is_file)
                self.assertIn("**/*.py", callbacks_spec.includes)

                ignored_path = callbacks_dir / "ignored.tmp"
                allowed_path = callbacks_dir / "allowed.cfg"
                ignored_path.write_text("")
                allowed_path.write_text("")

                filtered_reloader = ListenerHotReloader(
                    listener=listener,
                    builder=module.build_callbacks,
                    extra_watch_paths=[str(callbacks_dir)],
                    ignore_patterns=["*.tmp"],
                )
                self.assertFalse(
                    filtered_reloader._watch_filter(Change.modified, str(ignored_path))
                )
                self.assertTrue(
                    filtered_reloader._watch_filter(Change.modified, str(allowed_path))
                )
            finally:
                sys.modules.pop(module_name, None)
                if tmp_dir in sys.path:
                    sys.path.remove(tmp_dir)

    async def test_start_hot_reload_convenience_path(self) -> None:
        listener = SettaListener(project_name="Demo Project")

        def builder(target: SettaListener) -> None:
            _ = target  # keep signature explicit; builder not executed during test

        captured: dict[str, ListenerHotReloader] = {}

        def fake_start_with_hot_reload(reloader: ListenerHotReloader) -> None:
            captured["reloader"] = reloader

        listener.start_with_hot_reload = fake_start_with_hot_reload  # type: ignore[assignment]

        listener.start(
            hot_reload=True,
            builder=builder,
            extra_watch_paths=["callbacks/**/*.py"],
            ignore_patterns=["*.tmp"],
            trigger_refresh=False,
            settle_delay=0.25,
        )

        reloader = captured["reloader"]
        self.assertIs(reloader.listener, listener)
        self.assertIs(reloader._builder, builder)
        self.assertFalse(reloader._trigger_refresh)
        self.assertEqual(reloader._settle_delay, 0.25)
        glob_spec = next(
            spec for spec in reloader._watch_specs if "**/*.py" in spec.includes
        )
        self.assertIn("*.tmp", glob_spec.ignores)

    async def test_start_requires_hot_reload_for_builder(self) -> None:
        listener = SettaListener(project_name="Demo Project")

        def builder(target: SettaListener) -> None:
            _ = target

        with self.assertRaises(ValueError):
            listener.start(builder=builder)
    @staticmethod
    def _init_listener_invocations(listener: SettaListener) -> list[str]:
        invocations: list[str] = []
        setattr(listener, "_test_invocations", invocations)
        return invocations

    @staticmethod
    def _get_listener_invocations(listener: SettaListener) -> list[str]:
        return cast("list[str]", getattr(listener, "_test_invocations"))
