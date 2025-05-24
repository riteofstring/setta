from setta.database.utils import create_new_id
from setta.project_state.base_ui_types import UIType, UITypeName, UITypePresetType
from setta.project_state.project_state import (
    CodeInfoCol,
    ConfigLanguage,
    ProjectConfig,
    ProjectConfigChild,
    ProjectState,
    Section,
    SectionSize,
    SectionVariant,
)


def create_settings_project_state():
    uiTypes = [
        UIType(
            type=UITypeName.DROPDOWN,
            name="Grid Patterns",
            presetType=UITypePresetType.USER,
            config={
                "choices": [
                    {"id": '"Dots"', "name": '"Dots"'},
                    {"id": '"Lines"', "name": '"Lines"'},
                    {"id": '"Cross"', "name": '"Cross"'},
                ]
            },
        ),
        UIType(
            type=UITypeName.DROPDOWN,
            name="Selection Modes",
            presetType=UITypePresetType.USER,
            config={
                "choices": [
                    {"id": '"partial"', "name": '"partial"'},
                    {"id": '"full"', "name": '"full"'},
                ]
            },
        ),
        UIType(
            type=UITypeName.DROPDOWN,
            name="Pan-On-Scroll Modes",
            presetType=UITypePresetType.USER,
            config={
                "choices": [
                    {"id": '"free"', "name": '"free"'},
                    {"id": '"vertical"', "name": '"vertical"'},
                    {"id": '"horizontal"', "name": '"horizontal"'},
                ]
            },
        ),
    ]

    uiTypes = {v.id: v for v in uiTypes}

    section_names = ["shortcuts", "gui", "backend", "languageServer", "sections"]
    sections = {}
    variants = {}
    codeInfoCols = {}
    for k in section_names:
        section = Section(
            name=k, size=SectionSize(width=550), variantId=create_new_id()
        )
        sections[section.id] = section
        variant = SectionVariant(
            name="setta_files/setta-settings.json",
            codeInfoColId=create_new_id(),
            isJsonSource=True,
            jsonSourceKeys=[k],
            configLanguage=ConfigLanguage.JSON,
        )
        codeInfoCols[variant.codeInfoColId] = CodeInfoCol()
        variants[section.variantId] = variant

    projectConfigChildren = {
        k: ProjectConfigChild(x=idx * 600) for idx, k in enumerate(sections.keys())
    }
    projectConfig = ProjectConfig(name="settings", children=projectConfigChildren)
    projectConfigId = projectConfig.id

    return ProjectState(
        projectConfigs={projectConfigId: projectConfig},
        sections=sections,
        variants=variants,
        uiTypes=uiTypes,
    )


SETTINGS_PROJECT = create_settings_project_state()
