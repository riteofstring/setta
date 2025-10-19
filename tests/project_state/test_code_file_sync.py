from __future__ import annotations

import asyncio
import unittest
from pathlib import Path
from tempfile import NamedTemporaryFile
from unittest.mock import AsyncMock, patch

from setta.project_state.project_manager_types import (
    CreateTopLevelSectionRequest,
    SetCodeFileBindingRequest,
    SetCodeRequest,
)
from setta.types.generated.impl_args_as_typed_dicts import CodeSectionImplArgs
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeSectionImpl,
    SectionType,
)
from setta.types.simplified_states import Position

from tests.utils.manager_fixture import real_settings_manager


class CodeFileSyncIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._manager_cm = real_settings_manager()
        self.fixture = await self._manager_cm.__aenter__()
        self.addAsyncCleanup(self._manager_cm.__aexit__, None, None, None)

        self.manager = self.fixture.manager
        self._settings_patch = patch.object(
            self.manager.settings_file,
            "load_and_broadcast_settings",
            AsyncMock(return_value=None),
        )
        self._settings_patch.start()
        self.addAsyncCleanup(self._settings_patch.stop)

        observer = self.fixture.code_file_sync._specific_file_watcher.observer
        original_schedule = observer.schedule
        self._schedule_requests: list[tuple[str, bool]] = []
        self._scheduled_paths: list[tuple[str, bool]] = []
        self._override_watch_parent_path: Path | None = None
        self._override_watch_target_path: Path | None = None

        def schedule_with_record(handler, path, recursive=False):
            requested_path = Path(path).resolve()
            effective_path = requested_path
            if (
                self._override_watch_parent_path is not None
                and requested_path == self._override_watch_parent_path
                and self._override_watch_target_path is not None
            ):
                effective_path = self._override_watch_target_path

            request_entry = (str(requested_path), recursive)
            effective_entry = (str(effective_path), recursive)
            self._schedule_requests.append(request_entry)
            self._scheduled_paths.append(effective_entry)

            try:
                return original_schedule.__func__(
                    observer,
                    handler,
                    str(effective_path),
                    recursive=recursive,
                )
            except Exception as exc:
                raise RuntimeError(
                    f"observer.schedule failed for path={effective_path!r} recursive={recursive}"
                ) from exc

        self._schedule_patch = patch.object(
            observer, "schedule", side_effect=schedule_with_record
        )
        self._schedule_patch.start()
        self.addCleanup(self._schedule_patch.stop)

        self.project_config_id = (
            self.manager.project_state_backend.defaultProjectConfigId
        )
        await self.manager.load_project_config(self.project_config_id)
        self.manager.completed_op_ids_since_last_broadcast.clear()

    async def test_external_edit_updates_section_code(self):
        section_id = await self.manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=self.project_config_id,
                implType=SectionType.Code,
                implOverrides=CodeSectionImplArgs(type=SectionType.Code),
                position=Position(),
            )
        )
        self.manager.completed_op_ids_since_last_broadcast.clear()

        binding_path = self.fixture.code_folder / "sections" / "sync_target.py"
        binding_path.parent.mkdir(parents=True, exist_ok=True)
        self._override_watch_parent_path = binding_path.parent.resolve()
        self._override_watch_target_path = binding_path.parent.parent.resolve()

        await self.manager.set_code_file_binding(
            SetCodeFileBindingRequest(
                projectConfigId=self.project_config_id,
                sectionId=section_id,
                canonicalPath=binding_path,
                accessMode=CodeFileAccessMode.read_write,
            )
        )

        section_impl = self._get_section_impl(section_id)
        self.assertIsNotNone(section_impl.codeFileBinding)
        self.assertEqual(
            Path(section_impl.codeFileBinding.canonical_path).resolve(),
            binding_path.resolve(),
        )
        self.assertEqual(section_impl.code, "")

        await self._wait_for_binding_registration(binding_path)

        binding_parent = str(binding_path.parent.resolve())
        self.assertTrue(
            any(path == binding_parent for path, _ in self._schedule_requests),
            f"Expected observer.schedule to watch {binding_parent}, "
            f"got {[path for path, _ in self._schedule_requests]}",
        )
        self.assertIsNotNone(self._override_watch_target_path)

        first_disk_update = "print('synced from disk 1')\n"
        self._atomic_replace(binding_path, first_disk_update)

        await self._wait_for_section_code(section_id, first_disk_update)

        second_disk_update = "print('synced from disk 2')\n"
        self._atomic_replace(binding_path, second_disk_update)

        await self._wait_for_section_code(section_id, second_disk_update)

        section_edit = "print('updated from section edit')\n"
        await self.manager.set_code(
            SetCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=section_id,
                code=section_edit,
            )
        )
        await self._wait_for_file_content(binding_path, section_edit)

        final_impl = self._get_section_impl(section_id)
        self.assertEqual(
            final_impl.codeFileBinding.access_mode, CodeFileAccessMode.read_write
        )
        self.assertEqual(final_impl.code, section_edit)

    async def _wait_for_section_code(
        self, section_id: str, expected_code: str, timeout: float = 5.0
    ) -> None:
        deadline = asyncio.get_event_loop().time() + timeout
        while True:
            section_impl = self._get_section_impl(section_id)
            if section_impl.code == expected_code:
                return
            if asyncio.get_event_loop().time() >= deadline:
                self.fail(
                    f"Timed out waiting for section {section_id} code to equal "
                    f"{expected_code!r}; last value was {section_impl.code!r}"
                )
            await asyncio.sleep(0.05)

    def _get_section_impl(self, section_id: str) -> CodeSectionImpl:
        project_state = self.manager.get_single_config_state(self.project_config_id)
        return get_curr_effective_section_impl_with_type_guard(
            project_state, section_id, CodeSectionImpl
        )

    async def _wait_for_binding_registration(
        self, canonical_path: Path, timeout: float = 5.0
    ) -> None:
        deadline = asyncio.get_event_loop().time() + timeout
        target = canonical_path.resolve()
        while True:
            registered_paths = {
                Path(path).resolve()
                for path in self.fixture.code_file_sync._registry.keys()
            }
            if target in registered_paths:
                return
            if asyncio.get_event_loop().time() >= deadline:
                self.fail(
                    f"Timed out waiting for code file sync to register {target}; "
                    f"registered paths were {registered_paths}"
                )
            await asyncio.sleep(0.05)

    def _atomic_replace(self, path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, delete=False
        ) as tmp:
            tmp.write(content)
            tmp_path = Path(tmp.name)
        tmp_path.replace(path)

    async def _wait_for_file_content(
        self, path: Path, expected_content: str, timeout: float = 5.0
    ) -> None:
        deadline = asyncio.get_event_loop().time() + timeout
        while True:
            current = path.read_text(encoding="utf-8")
            if current == expected_content:
                return
            if asyncio.get_event_loop().time() >= deadline:
                self.fail(
                    f"Timed out waiting for {path} to equal "
                    f"{expected_content!r}; last value was {current!r}"
                )
            await asyncio.sleep(0.05)
