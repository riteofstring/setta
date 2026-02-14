import inspect
from pathlib import Path
from typing import Dict, List, Set

from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import ImplClassInfoForGeneration, get_impl_classes

DEFAULT_EXCLUSIONS = {"id", "name", "type"}

# Class-specific exclusions (can override defaults)
SECTION_EXCLUSIONS: Dict[str, Set[str]] = {
    # Base classes
    "BaseSectionImpl": DEFAULT_EXCLUSIONS.union(
        {
            "isInOtherProjectConfigs",
            "isPreset",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
        }
    ),
    "BaseSectionWithParamsImpl": DEFAULT_EXCLUSIONS.union(
        {"codeObjVariantMap", "pinnedParams", "selectedParams", "ignoreTypeErrors"}
    ),
    "BaseArtifactSectionImpl": DEFAULT_EXCLUSIONS.union({"artifactGroupIds"}),
    "BaseCanvasSectionImpl": DEFAULT_EXCLUSIONS,
    "BaseCodeSectionImpl": DEFAULT_EXCLUSIONS,
    "BaseParentSectionImpl": DEFAULT_EXCLUSIONS.union({"children"}),
    "BaseDictSectionImpl": DEFAULT_EXCLUSIONS.union(
        {"topLevelParamId", "jsonSourceMissing"}
    ),
    # Concrete classes
    "CallableSectionImpl": DEFAULT_EXCLUSIONS.union({"callable"}),
    "DictSectionImpl": DEFAULT_EXCLUSIONS,
    "ListRootSectionImpl": DEFAULT_EXCLUSIONS,
    "GroupSectionImpl": DEFAULT_EXCLUSIONS,
    "ImageSectionImpl": DEFAULT_EXCLUSIONS,
    "ChartSectionImpl": DEFAULT_EXCLUSIONS.union({"chartSettings"}),
    "DrawSectionImpl": DEFAULT_EXCLUSIONS,
    "TextBlockSectionImpl": DEFAULT_EXCLUSIONS,
    "PromptSectionImpl": DEFAULT_EXCLUSIONS,
    "MetaControlSectionImpl": DEFAULT_EXCLUSIONS.union(
        {"metaControlParamId", "codeObjVariantMap"}
    ),
    "SocialSectionImpl": DEFAULT_EXCLUSIONS,
    "GlobalVariablesSectionImpl": DEFAULT_EXCLUSIONS,
    "CodeSectionImpl": DEFAULT_EXCLUSIONS,
    "GenPythonCodeSectionImpl": DEFAULT_EXCLUSIONS,
    "GenPythonMetadataSectionImpl": DEFAULT_EXCLUSIONS,
    "TerminalSectionImpl": DEFAULT_EXCLUSIONS,
    "IFrameSectionImpl": DEFAULT_EXCLUSIONS,
    "ChatSectionImpl": DEFAULT_EXCLUSIONS,
    "BrowserSectionImpl": DEFAULT_EXCLUSIONS,
}

CODE_OBJ_EXCLUSIONS: Dict[str, Set[str]] = {
    # Base classes
    "BaseCodeObjImpl": DEFAULT_EXCLUSIONS.union({"description", "isPreset"}),
    "BaseParamCodeObjImpl": DEFAULT_EXCLUSIONS.union({"passingStyle"}),
    "BaseChildlessCodeObjImpl": DEFAULT_EXCLUSIONS,
    "BaseParentCodeObjImpl": DEFAULT_EXCLUSIONS.union({"children"}),
    # Concrete classes
    "CodeCallableCodeObjImpl": DEFAULT_EXCLUSIONS,
    "CodeParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "TextParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "ButtonParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "SliderParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "RotaryParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "SwitchParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "ColorPickerParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "DropdownParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "PasswordParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "TextAreaParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "DropzoneParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "NestedParamCodeObjImpl": DEFAULT_EXCLUSIONS,
}


def transform_class_to_user_default(
    class_lines: List[str],
    cls_info: ImplClassInfoForGeneration,
    exclusions: Set[str],
) -> List[str]:
    """Transform class source to UserDefault version."""
    new_lines = []

    # Transform the class definition line
    i = 0
    while i < len(class_lines):
        line = class_lines[i]

        if line.strip().startswith(f"class {cls_info.original_name}"):
            # Create new class definition
            indent = " " * (len(line) - len(line.lstrip()))
            parents = (
                "BaseModel"
                if cls_info.parent_is_base_model
                else ", ".join(cls_info.parent_user_default_class_names)
            )
            new_class_def = f'{indent}class {cls_info.user_default_name}({parents}, extra="forbid"):\n'
            new_lines.append(new_class_def)
            i += 1

        elif i > 0:  # After the class definition
            # Check if this is a field definition
            stripped = line.strip()
            if (
                ":" in stripped
                and not stripped.startswith("#")
                and not stripped.startswith('"""')
            ):
                field_name = stripped.split(":")[0].strip()
                if field_name not in exclusions:
                    # Add this line
                    new_lines.append(line)

                    # Check if field definition continues on next lines
                    paren_count = line.count("(") - line.count(")")
                    i += 1

                    # Continue adding lines until parentheses are balanced
                    while i < len(class_lines) and paren_count > 0:
                        new_lines.append(class_lines[i])
                        paren_count += class_lines[i].count("(") - class_lines[i].count(
                            ")"
                        )
                        i += 1
                    continue
                else:
                    # Skip excluded field
                    # Check if field definition continues on next lines
                    paren_count = line.count("(") - line.count(")")
                    i += 1

                    # Skip lines until parentheses are balanced
                    while i < len(class_lines) and paren_count > 0:
                        paren_count += class_lines[i].count("(") - class_lines[i].count(
                            ")"
                        )
                        i += 1
                    continue
            elif stripped == "pass" and len(new_lines) == 2:
                # Only keep pass if no fields were added
                new_lines.append(line)
                i += 1
            else:
                i += 1
        else:
            i += 1

    # If no fields were added and no pass statement exists, add one
    if len(new_lines) == 1:  # Only class def and docstring
        indent = " " * 4
        new_lines.append(f"{indent}pass\n")

    return new_lines


def process_module_classes() -> List[str]:
    """Process classes from a module and return transformed classes."""
    classes = get_impl_classes()

    # Generate UserDefault classes
    class_definitions = []
    for cls_name, cls_info in classes.items():
        class_lines, _ = inspect.getsourcelines(cls_info.class_obj)
        if class_lines:
            exclusions_map = (
                SECTION_EXCLUSIONS if cls_info.is_for_section else CODE_OBJ_EXCLUSIONS
            )
            exclusions = exclusions_map[cls_name]
            transformed = transform_class_to_user_default(
                class_lines,
                cls_info,
                exclusions,
            )
            class_definitions.extend(transformed)
            class_definitions.append("\n")

    return class_definitions


def main(output_folder: Path):
    """Generate all UserDefault classes."""
    class_defs = process_module_classes()

    # Build the complete file
    header = """# Auto-generated UserDefault classes - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field

# Section type imports
from setta.types.artifact import DrawAreaBrushShape, DrawAreaLayer, DrawAreaMode
from setta.types.edges import EdgePort
from setta.types.id import ID
from setta.types.section_impls import (
    CodeLanguage,
    ConfigLanguage,
    CodeSectionDiagnosticsIgnoreState,
    SectionSize,
    SectionSizeMode,
    SectionType,
    TextBlockDisplayMode,
    TextBlockFormat,
    PromptFormat,
    SectionWithParamsDisplayMode,
    BrowserAreaViewMode,
    BrowserAreaItem,
    BrowserSavedSearch,
    CodeFileBinding,
    ChatSectionBranch,
)

# Code object type imports
from setta.types.code_obj_impls import (
    CodeObjType,
    ColorPickerChoice,
    ButtonActionMode,
    HttpRequestMethod,
    ParameterPassingStyle,
    ParamNameType,
    DropzoneMode,
    TextParamInputUIType,
    TimeDisplayFormat,
    DateDisplayFormat,
)

from setta.types.generated.chart_settings_unions import BaseChartSettingsUnion
from setta.types.generated.chat_messages import BaseChatMessageUnion

"""

    # Join everything
    class_defs_str = "".join(class_defs)

    combined = f"""{header}{class_defs_str}
"""

    # Format
    formatted = ruff_format(combined)

    # Write output
    output_file = output_folder / "user_defaults.py"
    output_file.write_text(formatted)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
