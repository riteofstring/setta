import inspect
import json
from pathlib import Path
from typing import Any, Dict

from setta.utils.constants import C, classproperty
from setta.utils.utils import get_absolute_path

from .utils import format_generated_code


def extract_constants(constants_class) -> Dict[str, Any]:
    constants = {}

    # Get all class attributes
    for name in dir(constants_class):
        if name.startswith("__"):
            continue
        raw_attr = inspect.getattr_static(constants_class, name)
        if isinstance(raw_attr, classproperty):
            continue
        constants[name] = getattr(constants_class, name)

    return constants


def generate_javascript_constants(constants: Dict[str, Any]) -> tuple[str, str]:
    """Generate JavaScript code for the constants."""

    js_code = """// Auto-generated constants file
// Generated from Python Constants class - DO NOT EDIT MANUALLY
// Run the meta-script to regenerate this file

export class C {
"""

    # Generate static properties for all constants
    for name, value in constants.items():
        if isinstance(value, Path):
            value = value.as_posix()
        js_code += f"  static {name} = {json.dumps(value)};\n"

    js_code += "}"

    template_path = Path(__file__).parent / "templates" / "c_addresses.ts.template"
    js_code_2 = template_path.read_text(encoding="utf-8")
    return js_code, js_code_2


def main(f1, f2):
    constants = extract_constants(C)
    js_code, js_code_2 = generate_javascript_constants(constants)
    with open(f1, "w") as f:
        f.write(js_code)
    with open(f2, "w") as f:
        f.write(js_code_2)
    format_generated_code(f1)
    format_generated_code(f2)
    print(f"Successfully converted constants to JavaScript in {f1}")
    print(f"Successfully converted constant addresses to JavaScript in {f2}")


if __name__ == "__main__":
    main(
        get_absolute_path(__file__, Path("../src/utils/c.ts")),
        get_absolute_path(__file__, Path("../src/utils/c_addresses.ts")),
    )
