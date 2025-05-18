import importlib.util
import json
import os
import sys


def convert_pydantic_to_js(input_file_path, output_file_path):
    """
    Read a Python file with Pydantic models and convert them to JavaScript.
    """
    # Get the absolute path of the input file
    input_file_abs_path = os.path.abspath(input_file_path)

    # Get the directory and filename
    input_dir = os.path.dirname(input_file_abs_path)
    module_name = os.path.splitext(os.path.basename(input_file_abs_path))[0]

    # Add the input directory to the Python path if it's not already there
    if input_dir not in sys.path:
        sys.path.insert(0, input_dir)

    # Import the module dynamically
    spec = importlib.util.spec_from_file_location(module_name, input_file_abs_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    # Access the variables we want to convert
    base_ui_types_list = module.BASE_UI_TYPES_LIST

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
    convert_pydantic_to_js(
        "../../backend/setta/project_state/base_ui_types.py",
        "../src/utils/baseUITypes.js",
    )
