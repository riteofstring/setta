import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.project_state.settings_project import create_settings_project_state
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.project_config import TopLevelSectionLayout
from setta.types.section_impls import DictSectionImpl, MetaControlSectionImpl
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


NONDETERMINISTIC_SETTINGS_SLICES = {
    "stateMachineEndSectionDefault",
    "stateMachineGateSectionDefault",
    "stateMachineStartSectionDefault",
}


def _create_dbe(tmp_path: Path) -> DBE:
    setta_root = tmp_path / "setta_files"
    setta_root.mkdir(parents=True, exist_ok=True)
    return DBE(setta_root)


def _create_settings_sender() -> WMHFrontendSender:
    return WMHFrontendSender(WebsocketManager())


def _add_extra_meta_control_section(settings_project) -> None:
    extra_impl = MetaControlSectionImpl()
    extra_variant = Variant(
        name="extra-meta-control",
        impl=extra_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(extra_impl),
    )
    extra_section = Core(
        name="brief_crystal",
        variants=[extra_variant.id],
        defaultVariant=extra_variant.id,
    )
    settings_project.sectionImpls[extra_impl.id] = extra_impl
    settings_project.sectionVariants[extra_variant.id] = extra_variant
    settings_project.sections[extra_section.id] = extra_section
    settings_project.projectConfig.sectionVariantMap[extra_section.id] = (
        extra_variant.id
    )
    settings_project.projectConfig.topLevelSections[extra_section.id] = (
        TopLevelSectionLayout(x=0.0, y=380.0)
    )


def test_settings_file_ignores_extra_non_dict_sections(tmp_path: Path) -> None:
    dbe = _create_dbe(tmp_path)
    settings_project = create_settings_project_state(dbe.settings)
    _add_extra_meta_control_section(settings_project)
    dbe.write_settings_project(settings_project)

    settings_file = SettingsFile(dbe, _create_settings_sender())

    actual_settings = settings_file.settings.model_dump(mode="json")
    expected_settings = SettingsState().model_dump(mode="json")
    assert set(actual_settings) == set(expected_settings)
    for settings_slice, expected_value in expected_settings.items():
        if settings_slice in NONDETERMINISTIC_SETTINGS_SLICES:
            continue
        assert actual_settings[settings_slice] == expected_value
    assert not list(dbe.path.glob("setta-settings-project.invalid-*.json"))
    loaded_project = dbe.read_settings_project()
    assert any(
        section.name == "brief_crystal"
        for section in loaded_project.sections.values()
    )


def test_settings_file_resets_malformed_settings_project(tmp_path: Path) -> None:
    dbe = _create_dbe(tmp_path)
    dbe.write_json(dbe.settings_project, {})

    settings_file = SettingsFile(dbe, _create_settings_sender())

    actual_settings = settings_file.settings.model_dump(mode="json")
    expected_settings = SettingsState().model_dump(mode="json")
    assert set(actual_settings) == set(expected_settings)
    for settings_slice, expected_value in expected_settings.items():
        if settings_slice in NONDETERMINISTIC_SETTINGS_SLICES:
            continue
        assert actual_settings[settings_slice] == expected_value
    backup_paths = sorted(dbe.path.glob("setta-settings-project.invalid-*.json"))
    assert len(backup_paths) == 1
    assert json.loads(backup_paths[0].read_text(encoding="utf-8")) == {}

    repaired_project = dbe.read_settings_project()
    assert {section.name for section in repaired_project.sections.values()} == set(
        SettingsState.model_fields.keys()
    )
    for section_id in repaired_project.sections:
        assert isinstance(
            get_curr_effective_section_impl(repaired_project, section_id),
            DictSectionImpl,
        )


def test_settings_file_read_only_mode_keeps_malformed_project_visible(
    tmp_path: Path,
) -> None:
    dbe = _create_dbe(tmp_path)
    dbe.write_json(dbe.settings_project, {})

    with pytest.raises(ValidationError):
        SettingsFile(dbe, _create_settings_sender(), allow_write=False)

    assert not list(dbe.path.glob("setta-settings-project.invalid-*.json"))
