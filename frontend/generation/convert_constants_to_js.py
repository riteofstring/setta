import inspect
import json
from pathlib import Path
from typing import Any, Dict

from setta.utils.constants import C, classproperty


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


def generate_javascript_constants(constants: Dict[str, Any]) -> str:
    """Generate JavaScript code for the constants."""

    js_code = """// Auto-generated constants file
// Generated from Python Constants class - DO NOT EDIT MANUALLY
// Run the meta-script to regenerate this file

export class C {
"""

    # Generate static properties for all constants
    for name, value in constants.items():
        js_code += f"  static {name} = {json.dumps(value)};\n"

    js_code += """
  static DEV_MODE = import.meta.env?.DEV;

  // Computed properties that mirror the Python class
  static get BACKEND() {
    if (this.DEV_MODE) {
      return `http://${this.DEFAULT_HOST}:${this.DEFAULT_PORT}${this.ROUTE_PREFIX}`;
    } else {
      return `http://${location.host}${this.ROUTE_PREFIX}`;
    }
  }

  static get WEBSOCKET() {
    if (this.DEV_MODE) {
      return `ws://${this.DEFAULT_HOST}:${this.DEFAULT_PORT}${this.ROUTE_PREFIX}`;
    } else {
      return `ws://${location.host}${this.ROUTE_PREFIX}`;
    }
  }
}
"""

    return js_code


def main(output_file_path):
    constants = extract_constants(C)
    js_code = generate_javascript_constants(constants)
    with open(output_file_path, "w") as f:
        f.write(js_code)
    print(f"Successfully converted Pydantic models to JavaScript in {output_file_path}")


if __name__ == "__main__":
    main(Path("../src/utils/c.ts"))
