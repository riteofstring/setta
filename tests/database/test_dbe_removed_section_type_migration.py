import pytest
from pydantic import ValidationError

from setta.database.db_objs import DBE
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.section_impls import SectionType


def test_read_project_required_rejects_removed_clock_calendar_sections(
    tmp_path,
) -> None:
    dbe = DBE(tmp_path)
    project_config = ProjectConfig(id="project-1", name="strict-validation")
    backend = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    payload = backend.model_dump(mode="json")

    payload["sectionImpls"]["legacy-clock-impl"] = {"type": "Clock"}
    payload["sectionVariants"]["legacy-clock-variant"] = {
        "id": "legacy-clock-variant",
        "name": "Clock Variant",
        "impl": "legacy-clock-impl",
        "nonPresetImpls": ["legacy-clock-impl"],
    }
    payload["sections"]["legacy-clock-section"] = {
        "id": "legacy-clock-section",
        "name": "Clock",
        "variants": ["legacy-clock-variant"],
        "defaultVariant": "legacy-clock-variant",
    }
    payload["projectConfigs"]["project-1"]["sectionVariantMap"]["legacy-clock-section"] = (
        "legacy-clock-variant"
    )

    dbe.write_json(dbe.project, payload)
    with pytest.raises(ValidationError):
        dbe.read_project_required()


def test_read_project_required_does_not_auto_expand_allowlist_when_type_policies_missing(
    tmp_path,
) -> None:
    dbe = DBE(tmp_path)
    project_config = ProjectConfig(id="project-1", name="no-auto-expansion")
    backend = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    payload = backend.model_dump(mode="json")

    section_policy = payload["projectConfigs"]["project-1"]["codegenTargets"][0][
        "sectionPolicy"
    ]
    section_policy["allowlist"] = [SectionType.Callable.value]
    section_policy.pop("typePolicies", None)

    dbe.write_json(dbe.project, payload)
    project = dbe.read_project_required()

    allowlist = project.projectConfigs["project-1"].codegenTargets[0].sectionPolicy.allowlist
    assert allowlist is not None
    assert allowlist == [SectionType.Callable]
    assert SectionType.TaskBoard not in allowlist
    assert SectionType.Spreadsheet not in allowlist


def test_read_project_required_preserves_explicit_allowlist_exclusion_for_spreadsheet(
    tmp_path,
) -> None:
    dbe = DBE(tmp_path)
    project_config = ProjectConfig(
        id="project-1",
        name="explicit-exclusion-project",
    )
    backend = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    payload = backend.model_dump(mode="json")

    section_policy = payload["projectConfigs"]["project-1"]["codegenTargets"][0][
        "sectionPolicy"
    ]
    section_policy["allowlist"] = [
        x for x in section_policy["allowlist"] if x != SectionType.Spreadsheet.value
    ]

    dbe.write_json(dbe.project, payload)
    loaded = dbe.read_project_required()

    allowlist = loaded.projectConfigs["project-1"].codegenTargets[0].sectionPolicy.allowlist
    assert allowlist is not None
    assert SectionType.Spreadsheet not in allowlist
