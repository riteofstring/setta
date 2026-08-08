from dataclasses import dataclass, field

from setta.types.code_obj_impls import CodeObjType, ParameterPassingStyle
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import SingletonSections
from setta.types.section_impls import (
    CodeFileBinding,
    SectionType,
)


@dataclass
class ProjectStateSummaryParam:  # setta-convert-pydantic-to-js: skip
    """Lightweight description of a top-level section parameter."""

    paramId: ID
    name: str
    type: CodeObjType
    passingStyle: ParameterPassingStyle
    isPinned: bool = False
    isSelected: bool = False
    isHidden: bool = False
    valuePreview: str | None = None


@dataclass
class ProjectStateSummarySection:  # setta-convert-pydantic-to-js: skip
    """Minimal layout + status snapshot for a section."""

    sectionId: ID
    coreName: str
    variantId: ID
    variantName: str
    sectionType: SectionType
    parentSectionId: ID | None = None
    childSectionIds: list[ID] = field(default_factory=list)
    isFrozen: bool = False
    isMinimized: bool = False
    isSingletonMember: bool = False
    hideParams: bool = False
    hideUnpinnedParams: bool = False
    topLevelLayout: TopLevelSectionLayout | None = None
    layoutLocked: bool = False
    parameters: list[ProjectStateSummaryParam] = field(default_factory=list)
    codeFileBinding: CodeFileBinding | None = None
    imagePath: str | None = None
    chartDataPath: str | None = None
    drawLayerAssetPaths: list[str] = field(default_factory=list)


@dataclass
class ProjectStateSummary:  # setta-convert-pydantic-to-js: skip
    """High-level snapshot tailored for MCP agents."""

    projectConfig: ProjectConfig
    sections: list[ProjectStateSummarySection] = field(default_factory=list)
    singletonSections: SingletonSections = field(default_factory=SingletonSections)
    parentSectionMap: dict[ID, ID | None] = field(default_factory=dict)
    shownParamVariantIds: list[ID] = field(default_factory=list)
    requiredDecodedImages: list[str] = field(default_factory=list)
    genCodeBinding: CodeFileBinding | None = None
