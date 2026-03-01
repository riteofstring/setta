import pytest

from setta.project_state import base_project_manager
from setta.project_state.project_manager_types import RedoRequest, UndoRequest
from setta.types.code_obj_impls import CodeCallableCodeObjImpl
from setta.types.generated.effective_impls import get_effective_impl
from setta.types.id import ID
from setta.types.section_impls import CallableSectionImpl
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


def _get_backend_callable_impl_for_section(
    *,
    project_config_id: ID,
    section_id: ID,
    manager,
) -> CodeCallableCodeObjImpl:
    backend = manager.project_state_backend
    project_config = backend.projectConfigs[project_config_id]
    section_variant_id = project_config.sectionVariantMap[section_id]
    section_variant = backend.sectionVariants[section_variant_id]
    section_impl_id = section_variant.impl
    section_impl = get_effective_impl(
        backend.sectionImpls[section_impl_id],
        backend.sections[section_id],
        section_variant,
    )
    if not isinstance(section_impl, CallableSectionImpl):
        raise TypeError(
            f"Expected callable section impl, got {type(section_impl).__name__}"
        )
    callable_id = section_impl.callable
    if callable_id is None:
        raise KeyError(f"Section {section_id} has no callable root.")
    callable_variant_id = section_impl.codeObjVariantMap[callable_id]
    callable_variant = backend.codeObjVariants[callable_variant_id]
    callable_impl = backend.codeObjImpls[callable_variant.impl]
    if not isinstance(callable_impl, CodeCallableCodeObjImpl):
        raise TypeError(
            f"Expected callable code obj impl, got {type(callable_impl).__name__}"
        )
    return callable_impl


@pytest.mark.asyncio
async def test_undo_redo_normalizes_inconsistent_callable_children_from_history() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)

        project_config_id = project_state.projectConfig.id
        section_id = next(iter(project_state.sections.keys()))

        # Create a separate history entry, then intentionally inject an invalid
        # callable child reference that does not exist in global codeObjs.
        manager.add_new_history_entry(
            trigger_autosave=False,
            project_config_id=project_config_id,
            undo_redo_full_patch_fallback=True,
        )
        stale_child_id = ID("stale-child-for-history-normalization")
        callable_impl = _get_backend_callable_impl_for_section(
            project_config_id=project_config_id,
            section_id=section_id,
            manager=manager,
        )
        callable_impl.children = [*callable_impl.children, stale_child_id]
        manager.project_state_backend = manager.project_state_backend

        # Redo should restore the inconsistent entry and normalize it before any
        # traversal/broadcast work runs.
        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=10.0)

        callable_impl_after = _get_backend_callable_impl_for_section(
            project_config_id=project_config_id,
            section_id=section_id,
            manager=manager,
        )
        assert stale_child_id not in callable_impl_after.children

        # Continue toggling undo/redo to ensure the normalization is persistent
        # across repeated history navigation.
        for _ in range(6):
            await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
            await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=10.0)
        callable_impl_after_repeated_navigation = _get_backend_callable_impl_for_section(
            project_config_id=project_config_id,
            section_id=section_id,
            manager=manager,
        )
        assert stale_child_id not in callable_impl_after_repeated_navigation.children

        # Accessing single-config state after redo should stay stable.
        single_config_state = manager.get_single_config_state(project_config_id)
        assert section_id in single_config_state.sections


@pytest.mark.asyncio
async def test_undo_redo_skips_re_normalization_for_already_normalized_entries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)

        project_config_id = project_state.projectConfig.id
        section_id = next(iter(project_state.sections.keys()))

        manager.add_new_history_entry(
            trigger_autosave=False,
            project_config_id=project_config_id,
            undo_redo_full_patch_fallback=True,
        )
        stale_child_id = ID("stale-child-for-normalization-cache")
        callable_impl = _get_backend_callable_impl_for_section(
            project_config_id=project_config_id,
            section_id=section_id,
            manager=manager,
        )
        callable_impl.children = [*callable_impl.children, stale_child_id]
        manager.project_state_backend = manager.project_state_backend

        # First undo/redo pass must normalize both entries and clear stale refs.
        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=10.0)
        callable_impl_after = _get_backend_callable_impl_for_section(
            project_config_id=project_config_id,
            section_id=section_id,
            manager=manager,
        )
        assert stale_child_id not in callable_impl_after.children

        prepare_calls = 0
        original_prepare = base_project_manager.prepare_sections_for_copy

        def counting_prepare_sections_for_copy(*args, **kwargs):
            nonlocal prepare_calls
            prepare_calls += 1
            return original_prepare(*args, **kwargs)

        monkeypatch.setattr(
            base_project_manager,
            "prepare_sections_for_copy",
            counting_prepare_sections_for_copy,
        )

        # Repeated toggles across the same normalized entries should no longer
        # invoke full normalization scans.
        for _ in range(8):
            await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
            await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=10.0)

        assert prepare_calls == 0
