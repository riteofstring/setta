#!/usr/bin/env python3
"""
Meta-script to convert Python Constants class to JavaScript constants file.
Run this whenever you make changes to the Constants class.
"""

import inspect
import json
from pathlib import Path
from typing import Any, Dict

from setta.utils.constants import C, classproperty


def get_constant_value(cls, name: str) -> Any:
    """Get the value of a constant, handling both simple attributes and properties."""
    try:
        value = getattr(cls, name)
        return value
    except Exception:
        return None


def should_include_attribute(name: str, value: Any, cls) -> bool:
    """Determine if an attribute should be included in the JavaScript constants."""
    # Skip private/protected attributes
    if name.startswith("_"):
        return False

    # Skip classproperty decorated attributes
    # Check if the attribute on the class itself is a classproperty instance
    try:
        # For class attributes, we need to look at the actual class dict
        for klass in inspect.getmro(cls):
            if name in klass.__dict__:
                class_attr = klass.__dict__[name]
                if isinstance(class_attr, classproperty):
                    return False
                break
    except:
        pass

    # Skip methods and functions (but include classproperties)
    if callable(value) and not hasattr(value, "__get__"):
        return False

    # Skip class methods that aren't properties
    if inspect.ismethod(value):
        return False

    return True


def serialize_value(value: Any) -> Any:
    """Convert Python values to JSON-serializable values."""
    if isinstance(value, (str, int, float, bool, type(None))):
        return value
    elif isinstance(value, (list, tuple)):
        return [serialize_value(item) for item in value]
    elif isinstance(value, dict):
        return {k: serialize_value(v) for k, v in value.items()}
    else:
        # For other types, convert to string
        return str(value)


def extract_constants(constants_class) -> Dict[str, Any]:
    """Extract all constants from the Constants class."""
    constants = {}

    # Get all class attributes
    for name in dir(constants_class):
        try:
            value = getattr(constants_class, name)
            if should_include_attribute(name, value, constants_class):
                constant_value = get_constant_value(constants_class, name)
                if constant_value is not None:
                    constants[name] = serialize_value(constant_value)
        except Exception as e:
            print(f"Warning: Could not extract {name}: {e}")

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


def write_javascript_file(js_code: str, output_path: Path):
    """Write the JavaScript code to a file."""
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(js_code)
        print(f"✅ Generated JavaScript constants at: {output_path}")
    except Exception as e:
        print(f"❌ Error writing JavaScript file: {e}")


def main():
    """Main function to run the meta-script."""

    # Extract constants from the Python class
    constants = extract_constants(C)

    # Generate JavaScript code
    js_code = generate_javascript_constants(constants)

    # Define output path - adjust as needed
    output_path = Path("../src/utils/c.js")  # Adjust path as needed

    # Write the file
    write_javascript_file(js_code, output_path)


if __name__ == "__main__":
    main()
