import inspect
from pathlib import Path
from typing import List, Type

from pydantic import BaseModel
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .generate_backend_union_types import find_sub_classes

# Fields to exclude from user defaults
EXCLUSIONS = {"id", "name", "type"}


def extract_class_source(source_lines: List[str], class_name: str) -> List[str]:
    """Extract source lines for a specific class."""
    class_lines = []
    in_class = False
    indent_level = None

    for line in source_lines:
        if line.strip().startswith(f"class {class_name}"):
            in_class = True
            indent_level = len(line) - len(line.lstrip())
            class_lines.append(line)
        elif in_class:
            if line.strip() == "":
                class_lines.append(line)
            elif len(line) - len(line.lstrip()) > indent_level:  # type: ignore
                class_lines.append(line)
            else:
                # End of class
                break

    return class_lines


def transform_class_to_user_default(
    class_lines: List[str], class_name: str, parent_mapping: dict, base_class_name: str
) -> List[str]:
    """Transform class source to UserDefault version."""
    new_lines = []

    # Transform the class definition line
    i = 0
    while i < len(class_lines):
        line = class_lines[i]

        if line.strip().startswith(f"class {class_name}"):
            # Determine parent
            parent = parent_mapping.get(class_name, base_class_name)
            if parent != base_class_name and parent in parent_mapping:
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
                if field_name not in EXCLUSIONS:
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
    source_file: Path, module, base_class: Type[BaseModel], discriminator: str
) -> tuple[List[str], List[str]]:
    """Process classes from a module and return transformed classes and instances."""
    # Get all target classes
    base_classes = find_sub_classes(module, base_class, discriminator, True, False)
    concrete_classes = find_sub_classes(module, base_class, discriminator, False, False)
    all_classes = [base_class] + base_classes + concrete_classes

    # Build parent mapping
    parent_mapping = {}
    for cls in all_classes:
        if hasattr(cls, "__base__") and cls.__base__.__name__ != "BaseModel":  # type: ignore
            parent_mapping[cls.__name__] = cls.__base__.__name__  # type: ignore

    # Read source file
    source_lines = source_file.read_text().splitlines(keepends=True)

    # Generate UserDefault classes
    class_definitions = []
    for cls in all_classes:
        class_lines = extract_class_source(source_lines, cls.__name__)
        if class_lines:
            transformed = transform_class_to_user_default(
                class_lines, cls.__name__, parent_mapping, base_class.__name__
            )
            class_definitions.extend(transformed)
            class_definitions.append("\n")

    # Generate instances
    instance_definitions = []

    # Create instances for concrete classes
    for cls in concrete_classes:
        instance_name = f"user_default_{cls.__name__.replace('SectionImpl', '').replace('CodeObjImpl', '').lower()}"
        instance_name = instance_name.replace("__", "_").strip("_")
        class_name = f"UserDefault{cls.__name__}"
        instance_definitions.append(f"{instance_name} = {class_name}()\n")

    # Create instances for base classes
    for cls in [base_class] + base_classes:
        if cls.__name__.startswith("Base"):
            instance_name = f"user_default_base_{cls.__name__.replace('Base', '').replace('SectionImpl', '').replace('CodeObjImpl', '').lower()}"
        else:
            instance_name = f"user_default_{cls.__name__.replace('SectionImpl', '').replace('CodeObjImpl', '').lower()}"
        instance_name = instance_name.replace("__", "_").strip("_")
        class_name = f"UserDefault{cls.__name__}"
        instance_definitions.append(f"{instance_name} = {class_name}()\n")

    return class_definitions, instance_definitions


def main(output_folder: Path):
    """Generate all UserDefault classes."""
    import setta.types.code_objs
    import setta.types.sections

    # Get source file paths
    sections_file = Path(inspect.getfile(setta.types.sections))
    code_objs_file = Path(inspect.getfile(setta.types.code_objs))

    # Process both modules
    sections_classes, sections_instances = process_module_classes(
        sections_file,
        setta.types.sections,
        setta.types.sections.BaseSectionImpl,
        "type",
    )

    code_objs_classes, code_objs_instances = process_module_classes(
        code_objs_file,
        setta.types.code_objs,
        setta.types.code_objs.BaseCodeObjImpl,
        "type",
    )

    # Build the complete file
    output = []

    # Header
    output.extend(
        [
            "# Auto-generated UserDefault classes - DO NOT EDIT MANUALLY\n",
            "# Generated from section and code obj implementations\n",
            "\n",
            "from typing import Any, Dict, List, Literal, Optional, Union\n",
            "from pydantic import BaseModel, Field\n",
            "\n",
            "# Section type imports\n",
            "from setta.types.sections import (\n",
            "    ChartSettings,\n",
            "    CodeLanguage,\n",
            "    ConfigLanguage,\n",
            "    DrawAreaCanvasSettings,\n",
            "    SectionSize,\n",
            "    SectionSizeMode,\n",
            "    SectionType,\n",
            "    TextBlockDisplayMode,\n",
            "    TextBlockFormat,\n",
            "    Visibility,\n",
            ")\n",
            "\n",
            "# Code object type imports\n",
            "from setta.types.code_objs import (\n",
            "    CodeObjType,\n",
            "    ColorPickerChoice,\n",
            "    ParameterPassingStyle,\n",
            "    ParamNameType,\n",
            ")\n",
            "\n\n",
            "# ============== Section UserDefault Classes ==============\n\n",
        ]
    )

    # Add section classes
    output.extend(sections_classes)

    # Add code obj classes
    output.extend(
        ["\n\n# ============== Code Object UserDefault Classes ==============\n\n"]
    )
    output.extend(code_objs_classes)

    # Add instances
    output.extend(
        [
            "\n\n# ============== Global Instances ==============\n\n",
            "# Section instances\n",
        ]
    )
    output.extend(sections_instances)

    output.extend(["\n# Code object instances\n"])
    output.extend(code_objs_instances)

    # Join and format
    combined = "".join(output)
    formatted = ruff_format(combined)

    # Write output
    output_file = output_folder / "user_defaults.py"
    output_file.write_text(formatted)
    print(f"Generated UserDefault classes in {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
