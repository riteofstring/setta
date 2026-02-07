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

    js_code_2 = """
import { RouteEnum } from "utils/generatedTypes"
import { BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY } from "utils/backendOriginOverride"
import { C } from "utils/c"
    
export class C_ADDRESSES {
  static DEV_MODE = import.meta.env?.DEV;

  static get DEV_BACKEND_ORIGIN_SESSION_OVERRIDE() {
    if (typeof sessionStorage === "undefined") {
      return undefined;
    }
    try {
      const rawOverride = sessionStorage.getItem(
        BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
      );
      if (!rawOverride) {
        return undefined;
      }
      return this.normalizeOrigin(rawOverride);
    } catch (error) {
      console.warn(
        "Failed to read backend origin override from sessionStorage",
        error,
      );
      return undefined;
    }
  }

  static get DEV_BACKEND_ORIGIN_OVERRIDE() {
    const override = import.meta.env?.VITE_BACKEND_ORIGIN as
      | string
      | undefined;
    if (!override) {
      return undefined;
    }
    return this.normalizeOrigin(override);
  }

  static normalizeOrigin(origin: string) {
    let normalizedOrigin = origin.trim();
    if (!normalizedOrigin) {
      return undefined;
    }
    const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\//.test(
      normalizedOrigin,
    );
    if (!hasProtocol) {
      normalizedOrigin = `http://${normalizedOrigin}`;
    }
    try {
      return new URL(normalizedOrigin).origin;
    } catch (error) {
      console.error(
        `Invalid VITE_BACKEND_ORIGIN value "${origin}". Falling back to default origin.`,
        error,
      );
      return undefined;
    }
  }

  // Computed properties that mirror the Python class
  static get BACKEND_ORIGIN() {
    if (this.DEV_MODE) {
      const sessionOverride = this.DEV_BACKEND_ORIGIN_SESSION_OVERRIDE;
      if (sessionOverride) {
        return sessionOverride;
      }
      const override = this.DEV_BACKEND_ORIGIN_OVERRIDE;
      if (override) {
        return override;
      }
      return `http://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}`;
    }
    return location.origin;
  }

  static get BACKEND() {
    return `${this.BACKEND_ORIGIN}${RouteEnum.PREFIX}`;
  }

  static get WEBSOCKET() {
    const originUrl = new URL(this.BACKEND_ORIGIN);
    const protocol =
      originUrl.protocol === "https:" || originUrl.protocol === "wss:"
        ? "wss:"
        : "ws:";
    return `${protocol}//${originUrl.host}${RouteEnum.PREFIX}`;
  }
}
"""
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
