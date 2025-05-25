import importlib.util
import json
import os
import sys

from setta.project_state.base_ui_types import BASE_UI_TYPES_LIST



def convert_base_ui_types_to_js(output_file_path):
    # Access the variables we want to convert
    base_ui_types_list = BASE_UI_TYPES_LIST

    # Convert the Pydantic models to dictionaries and then to JavaScript
    js_objects = []
    for ui_type in base_ui_types_list:
        js_objects.append(ui_type.model_dump())

    # Create JavaScript code
    js_code = """// Auto-generated JavaScript from Python Pydantic models
// UI Types List
export const BASE_UI_TYPES_LIST = ${JSON.stringify(js_objects, null, 2)};

// UI Types by ID
export const BASE_UI_TYPES = {};
BASE_UI_TYPES_LIST.forEach(uiType => {
  BASE_UI_TYPES[uiType.id] = uiType;
});

// UI Type IDs by Type
export const BASE_UI_TYPE_IDS = {};
BASE_UI_TYPES_LIST.forEach(uiType => {
  BASE_UI_TYPE_IDS[uiType.type] = uiType.id;
});
""".replace("${JSON.stringify(js_objects, null, 2)}", json.dumps(js_objects, indent=2))

    # Write the JavaScript code to the output file
    with open(output_file_path, "w") as f:
        f.write(js_code)

    print(f"Successfully converted Pydantic models to JavaScript in {output_file_path}")


if __name__ == "__main__":
    convert_base_ui_types_to_js(
        "../src/utils/baseUITypes.js",
    )
