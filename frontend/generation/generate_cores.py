from pathlib import Path

from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import (
    CoreClassInfoForGeneration,
    get_core_classes,
    get_creation_fns,
)


def additional_args_types_callback(c: CoreClassInfoForGeneration):
    return f"overrides: {c.args_name} | None = None"


def additional_args_generic_type_callback():
    return "overrides: Any = None"


def implementation_callback(c: CoreClassInfoForGeneration, additiona_args):
    return f"""
                    if overrides is None:
                        overrides = {{}}
                    return {c.original_name}(**overrides)
"""


def generate_core_creation_fns(output_file: Path):
    classes = get_core_classes()
    code = output_file.read_text()
    args_imports = ",\n    ".join([cls.args_name for cls in classes.values()])
    code = f"""
from typing import overload
from setta.types.generated.core_args_as_typed_dicts import (
    {args_imports}
)

{code}
"""
    code += get_creation_fns(
        classes,
        "core",
        additional_args_types_callback=additional_args_types_callback,
        additional_args_generic_type_callback=additional_args_generic_type_callback,
        implementation_callback=implementation_callback,
    )
    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    generate_core_creation_fns(
        get_absolute_path(
            __file__,
            Path("../../backend/setta/types/generated") / "cores.py",
        ),
    )
