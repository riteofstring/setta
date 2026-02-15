from setta.database.db_objs import DBE
from setta.types.core import Core, Variant
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateBackend
from setta.types.section_impls import GroupSectionImpl, SectionType


def test_read_project_required_migrates_removed_clock_calendar_sections(
    tmp_path,
) -> None:
    dbe = DBE(tmp_path)

    project_config = ProjectConfig(id="project-1", name="migration-project")
    section_id = "group-section"
    variant_id = "group-variant"
    impl_id = "group-impl"
    group_impl = GroupSectionImpl(id=impl_id, type=SectionType.Group)
    section_core = Core(
        id=section_id,
        name="Group",
        variants=[variant_id],
        defaultVariant=variant_id,
    )
    section_variant = Variant(
        id=variant_id,
        name="Group Variant",
        impl=impl_id,
        nonPresetImpls=[impl_id],
    )
    project_config.sectionVariantMap = {section_id: variant_id}
    project_config.topLevelSections = {section_id: TopLevelSectionLayout()}
    project_config.activeIds = [section_id]

    backend = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
        sections={section_id: section_core},
        sectionVariants={variant_id: section_variant},
        sectionImpls={impl_id: group_impl},
    )
    payload = backend.model_dump(mode="json")

    legacy_clock_impl_id = "legacy-clock-impl"
    legacy_clock_variant_id = "legacy-clock-variant"
    legacy_clock_section_id = "legacy-clock-section"
    legacy_calendar_impl_id = "legacy-calendar-impl"
    legacy_calendar_variant_id = "legacy-calendar-variant"
    legacy_calendar_section_id = "legacy-calendar-section"

    payload["sectionImpls"][legacy_clock_impl_id] = {"type": "Clock"}
    payload["sectionImpls"][legacy_calendar_impl_id] = {"type": "Calendar"}
    payload["sectionVariants"][legacy_clock_variant_id] = {
        "id": legacy_clock_variant_id,
        "name": "Clock Variant",
        "impl": legacy_clock_impl_id,
        "nonPresetImpls": [legacy_clock_impl_id],
    }
    payload["sectionVariants"][legacy_calendar_variant_id] = {
        "id": legacy_calendar_variant_id,
        "name": "Calendar Variant",
        "impl": legacy_calendar_impl_id,
        "nonPresetImpls": [legacy_calendar_impl_id],
    }
    payload["sections"][legacy_clock_section_id] = {
        "id": legacy_clock_section_id,
        "name": "Clock",
        "variants": [legacy_clock_variant_id],
        "defaultVariant": legacy_clock_variant_id,
    }
    payload["sections"][legacy_calendar_section_id] = {
        "id": legacy_calendar_section_id,
        "name": "Calendar",
        "variants": [legacy_calendar_variant_id],
        "defaultVariant": legacy_calendar_variant_id,
    }
    payload["sectionImpls"][impl_id]["defaultChildSectionType"] = "Clock"
    payload["sectionImpls"][impl_id]["children"] = [
        legacy_clock_section_id,
        legacy_calendar_section_id,
    ]

    project_payload = payload["projectConfigs"]["project-1"]
    project_payload["sectionVariantMap"][legacy_clock_section_id] = (
        legacy_clock_variant_id
    )
    project_payload["sectionVariantMap"][legacy_calendar_section_id] = (
        legacy_calendar_variant_id
    )
    project_payload["topLevelSections"][legacy_clock_section_id] = {
        "x": 0,
        "y": 0,
        "zIndex": 0,
        "w": None,
        "h": None,
    }
    project_payload["topLevelSections"][legacy_calendar_section_id] = {
        "x": 0,
        "y": 0,
        "zIndex": 0,
        "w": None,
        "h": None,
    }
    project_payload["activeIds"].extend(
        [legacy_clock_section_id, legacy_calendar_section_id]
    )
    project_payload["edges"] = [
        {
            "id": "legacy-edge",
            "sourceSectionId": legacy_clock_section_id,
            "sourceVariantId": legacy_clock_variant_id,
            "sourcePortId": "source-port",
            "targetSectionId": section_id,
            "targetVariantId": variant_id,
            "targetPortId": "target-port",
            "type": "default",
            "animated": False,
            "hidden": False,
            "zIndex": 0,
            "selected": False,
        }
    ]
    project_payload["agenticEdges"] = [
        {
            "id": "legacy-agentic-edge",
            "sourceSectionId": legacy_calendar_section_id,
            "targetSectionId": section_id,
            "kind": "section_chat",
            "contextMode": "reference_only",
            "hidden": False,
            "zIndex": 0,
            "selected": False,
        }
    ]
    codegen_target = project_payload["codegenTargets"][0]
    section_policy = codegen_target["sectionPolicy"]
    section_policy["allowlist"] = [*section_policy["allowlist"], "Clock", "Calendar"]
    section_policy["typePolicies"]["Clock"] = {
        "mode": "inherit",
        "representation": "expression",
    }
    section_policy["typePolicies"]["Calendar"] = {
        "mode": "inherit",
        "representation": "expression",
    }

    dbe.write_json(dbe.project, payload)
    migrated = dbe.read_project_required()

    assert all(
        impl.type.value not in {"Clock", "Calendar"}
        for impl in migrated.sectionImpls.values()
    )
    assert legacy_clock_section_id not in migrated.sections
    assert legacy_calendar_section_id not in migrated.sections
    assert legacy_clock_variant_id not in migrated.sectionVariants
    assert legacy_calendar_variant_id not in migrated.sectionVariants
    assert legacy_clock_impl_id not in migrated.sectionImpls
    assert legacy_calendar_impl_id not in migrated.sectionImpls

    migrated_project = migrated.projectConfigs["project-1"]
    assert legacy_clock_section_id not in migrated_project.sectionVariantMap
    assert legacy_calendar_section_id not in migrated_project.sectionVariantMap
    assert legacy_clock_section_id not in migrated_project.topLevelSections
    assert legacy_calendar_section_id not in migrated_project.topLevelSections
    assert legacy_clock_section_id not in migrated_project.activeIds
    assert legacy_calendar_section_id not in migrated_project.activeIds
    assert not migrated_project.edges
    assert not migrated_project.agenticEdges

    python_target = migrated_project.codegenTargets[0]
    assert all(
        section_type.value not in {"Clock", "Calendar"}
        for section_type in python_target.sectionPolicy.typePolicies.keys()
    )
    allowlist = python_target.sectionPolicy.allowlist
    if allowlist is not None:
        assert all(
            section_type.value not in {"Clock", "Calendar"}
            for section_type in allowlist
        )

    migrated_group_impl = migrated.sectionImpls[impl_id]
    assert isinstance(migrated_group_impl, GroupSectionImpl)
    assert migrated_group_impl.defaultChildSectionType == SectionType.Callable
    assert migrated_group_impl.children == []


def test_read_project_required_adds_missing_data_authoring_allowlist_entries(
    tmp_path,
) -> None:
    dbe = DBE(tmp_path)

    project_config = ProjectConfig(id="project-1", name="legacy-codegen-project")
    backend = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    payload = backend.model_dump(mode="json")

    section_policy = payload["projectConfigs"]["project-1"]["codegenTargets"][0][
        "sectionPolicy"
    ]
    section_policy["allowlist"] = [
        x
        for x in section_policy["allowlist"]
        if x not in {SectionType.TaskBoard.value, SectionType.Spreadsheet.value}
    ]
    type_policies = section_policy["typePolicies"]
    type_policies.pop(SectionType.TaskBoard.value)
    type_policies.pop(SectionType.Spreadsheet.value)

    dbe.write_json(dbe.project, payload)
    migrated = dbe.read_project_required()

    python_target = migrated.projectConfigs["project-1"].codegenTargets[0]
    allowlist = python_target.sectionPolicy.allowlist
    assert allowlist is not None
    assert SectionType.TaskBoard in allowlist
    assert SectionType.Spreadsheet in allowlist
    assert SectionType.TaskBoard in python_target.sectionPolicy.typePolicies
    assert SectionType.Spreadsheet in python_target.sectionPolicy.typePolicies


def test_read_project_required_adds_data_authoring_entries_for_legacy_allowlist_shape(
    tmp_path,
) -> None:
    dbe = DBE(tmp_path)

    project_config = ProjectConfig(id="project-1", name="legacy-allowlist-shape")
    backend = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    payload = backend.model_dump(mode="json")

    section_policy = payload["projectConfigs"]["project-1"]["codegenTargets"][0][
        "sectionPolicy"
    ]
    section_policy["allowlist"] = [
        x
        for x in section_policy["allowlist"]
        if x not in {SectionType.TaskBoard.value, SectionType.Spreadsheet.value}
    ]

    dbe.write_json(dbe.project, payload)
    migrated = dbe.read_project_required()

    python_target = migrated.projectConfigs["project-1"].codegenTargets[0]
    allowlist = python_target.sectionPolicy.allowlist
    assert allowlist is not None
    assert SectionType.TaskBoard in allowlist
    assert SectionType.Spreadsheet in allowlist


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
    migrated = dbe.read_project_required()

    python_target = migrated.projectConfigs["project-1"].codegenTargets[0]
    allowlist = python_target.sectionPolicy.allowlist
    assert allowlist is not None
    assert SectionType.Spreadsheet not in allowlist
