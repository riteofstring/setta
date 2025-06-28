import inspect
from pathlib import Path
from typing import Dict, List, Set, Tuple, Type

from pydantic import BaseModel
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .generate_backend_union_types import find_sub_classes

DEFAULT_EXCLUSIONS = {"id", "name", "type"}

# Class-specific exclusions (can override defaults)
SECTION_EXCLUSIONS: Dict[str, Set[str]] = {
    # Base classes
    "BaseSectionImpl": DEFAULT_EXCLUSIONS.union(
        {
            "parentId",
            "isInOtherProjectConfigs",
            "isPreset",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
        }
    ),
    "BaseSectionWithParamsImpl": DEFAULT_EXCLUSIONS.union(
        {"codeObjImplLayeringMap", "pinnedParams", "selectedParams", "ignoreTypeErrors"}
    ),
    "BaseArtifactSectionImpl": DEFAULT_EXCLUSIONS.union({"artifactGroupIds"}),
    "BaseCanvasSectionImpl": DEFAULT_EXCLUSIONS.union({"renderedValue"}),
    "BaseCodeSectionImpl": DEFAULT_EXCLUSIONS,
    "BaseParentSectionImpl": DEFAULT_EXCLUSIONS.union({"children"}),
    "BaseDictSectionImpl": DEFAULT_EXCLUSIONS.union(
        {"topLevelParamIds", "jsonSourceMissing"}
    ),
    # Concrete classes
    "CallableSectionImpl": DEFAULT_EXCLUSIONS.union({"callable"}),
    "DictSectionImpl": DEFAULT_EXCLUSIONS,
    "ListRootSectionImpl": DEFAULT_EXCLUSIONS,
    "DictRootSectionImpl": DEFAULT_EXCLUSIONS,
    "GroupSectionImpl": DEFAULT_EXCLUSIONS,
    "ImageSectionImpl": DEFAULT_EXCLUSIONS,
    "ChartSectionImpl": DEFAULT_EXCLUSIONS,
    "DrawSectionImpl": DEFAULT_EXCLUSIONS,
    "TextBlockSectionImpl": DEFAULT_EXCLUSIONS,
    "SocialSectionImpl": DEFAULT_EXCLUSIONS,
    "GlobalVariablesSectionImpl": DEFAULT_EXCLUSIONS,  # Keep name for GlobalVariables
    "CodeSectionImpl": DEFAULT_EXCLUSIONS,
    "GenPythonCodeSectionImpl": DEFAULT_EXCLUSIONS,  # Keep name for GenPythonCode
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
    "SliderParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "SwitchParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "ColorPickerParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "DropdownParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "PasswordParamCodeObjImpl": DEFAULT_EXCLUSIONS,
    "NestedParamCodeObjImpl": DEFAULT_EXCLUSIONS,
}


def extract_class_info(
    source_lines: List[str], class_name: str
) -> Tuple[List[str], str]:
    """Extract source lines for a specific class and its parent class name."""
    class_lines = []
    parent_class = None
    in_class = False
    indent_level = None

    for line in source_lines:
        if line.strip().startswith(f"class {class_name}"):
            in_class = True
            indent_level = len(line) - len(line.lstrip())
            class_lines.append(line)

            # Extract parent class from the line
            # e.g., "class TextBlockSectionImpl(BaseSectionImpl):"
            if "(" in line and ")" in line:
                parent_part = line.split("(")[1].split(")")[0]
                # Handle multiple inheritance - take the first parent
                parent_class = parent_part.split(",")[0].strip()

        elif in_class:
            if line.strip() == "":
                class_lines.append(line)
            elif len(line) - len(line.lstrip()) > indent_level:
                class_lines.append(line)
            else:
                # End of class
                break

    return class_lines, parent_class


def transform_class_to_user_default(
    class_lines: List[str],
    class_name: str,
    parent_mapping: dict,
    exclusions: Set[str],
) -> List[str]:
    """Transform class source to UserDefault version."""
    new_lines = []

    # Transform the class definition line
    i = 0
    while i < len(class_lines):
        line = class_lines[i]

        if line.strip().startswith(f"class {class_name}"):
            # Determine parent
            parent = parent_mapping.get(class_name)
            if parent:
                new_parent = f"UserDefault{parent}"
            else:
                new_parent = "BaseModel"

            # Create new class definition
            indent = " " * (len(line) - len(line.lstrip()))
            new_class_def = f'{indent}class UserDefault{class_name}({new_parent}, extra="forbid"):\n'
            new_lines.append(new_class_def)

            # Add docstring
            new_lines.append(
                f'{indent}    """User-configurable defaults for {class_name}"""\n'
            )

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
    if len(new_lines) == 2:  # Only class def and docstring
        indent = " " * 4
        new_lines.append(f"{indent}pass\n")

    return new_lines


def process_module_classes(
    source_file: Path,
    module,
    base_class: Type[BaseModel],
    discriminator: str,
    exclusions_map: Dict[str, Set[str]],
) -> List[str]:
    """Process classes from a module and return transformed classes."""
    # Get all target classes
    base_classes = find_sub_classes(module, base_class, discriminator, True, False)
    concrete_classes = find_sub_classes(module, base_class, discriminator, False, False)
    all_classes = [base_class] + base_classes + concrete_classes

    # Create a set of all class names for quick lookup
    all_class_names = {cls.__name__ for cls in all_classes}

    # Read source file
    source_lines = source_file.read_text().splitlines(keepends=True)

    # Build parent mapping by parsing source
    parent_mapping = {}
    for cls in all_classes:
        _, parent_name = extract_class_info(source_lines, cls.__name__)
        if parent_name and parent_name in all_class_names:
            parent_mapping[cls.__name__] = parent_name

    # Generate UserDefault classes
    class_definitions = []
    for cls in all_classes:
        class_lines, _ = extract_class_info(source_lines, cls.__name__)
        if class_lines:
            # Get exclusions for this class
            exclusions = exclusions_map[cls.__name__]

            transformed = transform_class_to_user_default(
                class_lines,
                cls.__name__,
                parent_mapping,
                exclusions,
            )
            class_definitions.extend(transformed)
            class_definitions.append("\n")

    return class_definitions


def main(output_folder: Path):
    """Generate all UserDefault classes."""
    import setta.types.code_objs
    import setta.types.sections

    # Get source file paths
    sections_file = Path(inspect.getfile(setta.types.sections))
    code_objs_file = Path(inspect.getfile(setta.types.code_objs))

    # Process both modules
    sections_classes = process_module_classes(
        sections_file,
        setta.types.sections,
        setta.types.sections.BaseSectionImpl,
        "type",
        SECTION_EXCLUSIONS,
    )

    code_objs_classes = process_module_classes(
        code_objs_file,
        setta.types.code_objs,
        setta.types.code_objs.BaseCodeObjImpl,
        "type",
        CODE_OBJ_EXCLUSIONS,
    )

    # Build the complete file
    header = """# Auto-generated UserDefault classes - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field

# Section type imports
from setta.types.sections import (
    ChartSettings,
    CodeLanguage,
    ConfigLanguage,
    DrawAreaCanvasSettings,
    SectionSize,
    SectionSizeMode,
    SectionType,
    TextBlockDisplayMode,
    TextBlockFormat,
    Visibility,
)

# Code object type imports
from setta.types.code_objs import (
    CodeObjType,
    ColorPickerChoice,
    ParameterPassingStyle,
    ParamNameType,
)


# ============== Section UserDefault Classes ==============

"""

    # Join everything
    sections_str = "".join(sections_classes)
    code_objs_str = "".join(code_objs_classes)

    combined = f"""{header}{sections_str}

# ============== Code Object UserDefault Classes ==============

{code_objs_str}"""

    # Format
    formatted = ruff_format(combined)

    # Write output
    output_file = output_folder / "user_defaults.py"
    output_file.write_text(formatted)
    print(f"Generated UserDefault classes in {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
