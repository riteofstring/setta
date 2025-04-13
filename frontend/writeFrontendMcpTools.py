import json
import os
import re
from typing import Any, Dict, List

from setta.utils.format_code import ruff_format


def jsdoc_type_to_python_type(type_str: str, typedefs: Dict[str, Any] = None) -> str:
    """Convert JSDoc type to Python type annotation."""
    if typedefs is None:
        typedefs = {}

    # Clean up the type string
    type_str = type_str.strip()

    # Check if this is a reference to a typedef
    if type_str in typedefs:
        return type_str  # Return the name as-is, it will be defined as a class

    # Handle object literals with specific properties like {x: number, y: number}
    if type_str.startswith("{") and type_str.endswith("}"):
        # Extract property definitions
        props_str = type_str[1:-1].strip()
        if props_str:
            # Parse properties and their types
            props = []
            current_prop = ""
            brace_count = 0

            # Split by commas, but respect nested braces
            for char in props_str + ",":  # Add trailing comma for processing last prop
                if char == "{":
                    brace_count += 1
                    current_prop += char
                elif char == "}":
                    brace_count -= 1
                    current_prop += char
                elif char == "," and brace_count == 0:
                    props.append(current_prop.strip())
                    current_prop = ""
                else:
                    current_prop += char

            # Process each property
            prop_types = []
            for prop in props:
                if ":" in prop:
                    prop_name, prop_type = prop.split(":", 1)
                    prop_type = prop_type.strip()
                    python_type = jsdoc_type_to_python_type(prop_type, typedefs)
                    prop_types.append(python_type)

            if prop_types:
                # If all property types are the same
                if all(t == prop_types[0] for t in prop_types):
                    return f"Dict[str, {prop_types[0]}]"
                else:
                    return f"Dict[str, Union[{', '.join(set(prop_types))}]]"

        # Default for empty object literal or parsing failure
        return "Dict[str, Any]"

    # Handle union types with string literals (common in enum-like types)
    if "|" in type_str and "'" in type_str:
        # Extract all string literals
        literals = re.findall(r"'([^']*)'", type_str)
        if literals:
            # If we have string literals, create a single Literal with all values
            return f"Literal[{', '.join(repr(lit) for lit in literals)}]"

    # Handle other union types
    elif "|" in type_str:
        types = type_str.split("|")
        python_types = [jsdoc_type_to_python_type(t.strip(), typedefs) for t in types]
        return f"Union[{', '.join(python_types)}]"

    # Handle arrays with specific types
    if type_str.startswith("Array<") and type_str.endswith(">"):
        inner_type = type_str[6:-1]
        return f"List[{jsdoc_type_to_python_type(inner_type, typedefs)}]"

    if type_str.startswith("Array.<") and type_str.endswith(">"):
        inner_type = type_str[7:-1]
        return f"List[{jsdoc_type_to_python_type(inner_type, typedefs)}]"

    # Helper function to handle Object types with key-value generics
    def handle_object_generic(inner_type_str: str) -> str:
        inner_types = inner_type_str.split(",", 1)
        if len(inner_types) == 2:
            key_type = inner_types[0].strip()
            value_type = inner_types[1].strip()
            python_key_type = jsdoc_type_to_python_type(key_type, typedefs)
            python_value_type = jsdoc_type_to_python_type(value_type, typedefs)
            return f"Dict[{python_key_type}, {python_value_type}]"
        return "Dict[str, Any]"  # Default if format is incorrect

    # Handle Object with key and value types: Object<keyType, valueType>
    if type_str.startswith("Object<") and type_str.endswith(">"):
        return handle_object_generic(type_str[7:-1])

    # Handle Object with key and value types: Object.<keyType, valueType>
    if type_str.startswith("Object.<") and type_str.endswith(">"):
        return handle_object_generic(type_str[8:-1])

    # Handle single string literal
    if type_str.startswith("'") and type_str.endswith("'"):
        return f"Literal[{type_str}]"

    # Handle common types
    type_map = {
        "string": "str",
        "number": "float",
        "integer": "int",
        "boolean": "bool",
        "array": "List[Any]",
        "object": "Dict[str, Any]",
        "Object": "Dict[str, Any]",
        "function": "Callable",
        "undefined": "None",
        "null": "None",
        "any": "Any",
    }

    return type_map.get(type_str, type_str)


def generate_typedef_classes(typedefs: Dict[str, Any]) -> str:
    """Generate Python TypedDict classes from JSDoc typedefs."""
    output = ""
    processed_typedefs = set()

    # Helper function to process typedefs that might depend on other typedefs
    def process_typedef(name, typedef_doc, processed):
        if name in processed:
            return ""

        typedef_output = ""
        properties = []

        # Get properties from typedef
        if typedef_doc.get("properties"):
            for prop in typedef_doc["properties"]:
                prop_name = prop.get("name", "unknown")

                # Get type information
                type_info = prop.get("type", {})
                type_names = type_info.get("names", []) if type_info else []

                # Check if type references another typedef
                if (
                    len(type_names) == 1
                    and type_names[0] in typedefs
                    and type_names[0] not in processed
                ):
                    # Process the referenced typedef first
                    typedef_output += process_typedef(
                        type_names[0], typedefs[type_names[0]], processed
                    )

                type_str = "|".join(type_names) if type_names else "any"
                python_type = jsdoc_type_to_python_type(type_str, typedefs)

                description = prop.get("description", "").strip()
                optional = prop.get("optional", False)

                # Add optional marker if needed
                type_annotation = (
                    f"{python_type}" if not optional else f"Optional[{python_type}]"
                )

                properties.append((prop_name, type_annotation, description))

        # Create TypedDict class
        typedef_output += f"class {name}(TypedDict, total=False):\n"

        if not properties:
            typedef_output += "    pass  # Empty TypedDict\n\n"
        else:
            for prop_name, type_annotation, description in properties:
                # Add docstring comment if description is available
                if description:
                    typedef_output += f"    # {description}\n"
                typedef_output += f"    {prop_name}: {type_annotation}\n"
            typedef_output += "\n"

        processed.add(name)
        return typedef_output

    # Process all typedefs
    for name, typedef_doc in typedefs.items():
        output += process_typedef(name, typedef_doc, processed_typedefs)

    return output


def generate_mcp_tools(json_path: str, output_path: str) -> None:
    """Generate MCP tool proxy functions from raw jsdoc output with typedef support"""
    # Create directory if it doesn't exist
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Load raw jsdoc output (now with tools and typedefs)
    with open(json_path, "r") as f:
        data = json.load(f)

    # Extract tools and typedefs
    raw_docs = data.get("tools", [])
    typedefs = data.get("typedefs", {})

    # Generate Python code
    output = '''"""
MCP Tool Proxy Functions
Generated automatically
DO NOT EDIT THIS FILE MANUALLY
"""

from typing import Dict, List, Any, Union, Optional, Callable, Literal
from typing_extensions import TypedDict
from setta.mcp.server import mcp_server

'''

    # Generate TypedDict classes for all typedefs
    if typedefs:
        output += "# TypedDict definitions generated from JSDoc typedefs\n"
        output += generate_typedef_classes(typedefs)
        output += "\n"

    # Group tools by source file for better organization
    tools_by_file: Dict[str, List[Dict[str, Any]]] = {}
    for doc in raw_docs:
        source_file = doc.get("meta", {}).get("filename", "unknown")
        if source_file not in tools_by_file:
            tools_by_file[source_file] = []
        tools_by_file[source_file].append(doc)

    # Generate a proxy function for each tool, grouped by source file
    for source_file, docs in tools_by_file.items():
        rel_path = os.path.basename(source_file)
        output += f"\n# From {rel_path}\n"

        for doc in docs:
            # Extract parameters
            params = []
            object_params = {}  # For handling object destructuring

            for param in doc.get("params", []):
                param_name = param.get("name", "")

                # Handle object destructuring pattern (props.name)
                if "." in param_name:
                    parent, child = param_name.split(".", 1)
                    if parent not in object_params:
                        object_params[parent] = []

                    # Get type information
                    type_info = param.get("type", {})
                    type_names = type_info.get("names", []) if type_info else []

                    # Check if this param references a typedef
                    if param.get("typedefRef"):
                        python_type = param.get("typedefRef")
                    else:
                        type_str = "|".join(type_names) if type_names else "any"
                        python_type = jsdoc_type_to_python_type(type_str, typedefs)

                    # Get description
                    description = param.get("description", "").strip()
                    required = not param.get("optional", False)
                    default_value = param.get("defaultvalue")

                    object_params[parent].append(
                        {
                            "name": child,
                            "type": python_type,
                            "description": description,
                            "required": required,
                            "default": default_value,
                        }
                    )
                else:
                    # Regular parameter (not object destructuring)
                    name = (
                        param_name.replace("[", "")
                        .replace("]", "")
                        .split("=")[0]
                        .strip()
                    )

                    # Get type information, preferring typedef references
                    if param.get("typedefRef"):
                        python_type = param.get("typedefRef")
                    else:
                        type_info = param.get("type", {})
                        type_names = type_info.get("names", []) if type_info else []
                        type_str = "|".join(type_names) if type_names else "any"
                        python_type = jsdoc_type_to_python_type(type_str, typedefs)

                    # Get description
                    description = param.get("description", "").strip()
                    required = not param.get("optional", False)
                    default_value = param.get("defaultvalue")

                    params.append(
                        {
                            "name": name,
                            "type": python_type,
                            "description": description,
                            "required": required,
                            "default": default_value,
                        }
                    )

            # If we have an object param but no regular params, check if there's object destructuring in the function
            if not params and doc.get("meta", {}).get("code", {}).get("paramnames"):
                param_names = doc.get("meta", {}).get("code", {}).get("paramnames", [])
                if (
                    len(param_names) == 1
                    and param_names[0].startswith("{")
                    and param_names[0].endswith("}")
                ):
                    # Extract destructured parameter names
                    destructured_params = param_names[0][1:-1].split(",")
                    for param in destructured_params:
                        param = param.strip()
                        if "=" in param:
                            name, default = param.split("=", 1)
                            name = name.strip()
                            # Look for this param in object_params
                            for obj_param_name, obj_params in object_params.items():
                                for obj_param in obj_params:
                                    if obj_param["name"] == name:
                                        params.append(
                                            {
                                                "name": name,
                                                "type": obj_param["type"],
                                                "description": obj_param["description"],
                                                "required": False,
                                                "default": obj_param["default"]
                                                if obj_param["default"] is not None
                                                else "{}",
                                            }
                                        )
                                        break
                        else:
                            name = param.strip()
                            # Look for this param in object_params
                            for obj_param_name, obj_params in object_params.items():
                                for obj_param in obj_params:
                                    if obj_param["name"] == name:
                                        params.append(
                                            {
                                                "name": name,
                                                "type": obj_param["type"],
                                                "description": obj_param["description"],
                                                "required": obj_param["required"],
                                                "default": obj_param["default"],
                                            }
                                        )
                                        break

            # Extract return info
            return_type = "Any"
            return_description = ""
            if doc.get("returns") and len(doc["returns"]) > 0:
                return_type_names = (
                    doc["returns"][0].get("type", {}).get("names", [])
                    if doc["returns"][0].get("type")
                    else ["any"]
                )
                return_type_str = "|".join(return_type_names)
                return_type = jsdoc_type_to_python_type(return_type_str, typedefs)
                return_description = doc["returns"][0].get("description", "")

            # Extract function information
            func_name = doc.get("name", "")
            description = doc.get("description", "")

            # Function decorator
            output += "@mcp_server.tool(\n"
            output += f'    description="{description}"\n'
            output += ")\n"

            # Function signature with type annotations
            signature_params = []
            for param in params:
                if param["required"]:
                    signature_params.append(f"{param['name']}: {param['type']}")
                elif param["default"] is not None:
                    signature_params.append(
                        f"{param['name']}: {param['type']} = {param['default']}"
                    )
                else:
                    signature_params.append(
                        f"{param['name']}: Optional[{param['type']}] = None"
                    )

            output += f"async def {func_name}({', '.join(signature_params)}) -> {return_type}:\n"

            # Docstring
            output += f'    """{description}\n'

            # Include parameter descriptions in the docstring
            params_with_desc = [p for p in params if p.get("description")]
            if params_with_desc:
                output += "\n    Parameters:\n"
                for p in params_with_desc:
                    output += f"        {p['name']}: {p['description']}\n"

            # Add return description if available
            if return_description:
                output += "\n    Returns:\n"
                output += f"        {return_description}\n"

            output += '    """\n'

            # Function implementation
            if params:
                output += "    args = {}\n"
                for param in params:
                    output += f'    args["{param["name"]}"] = {param["name"]}\n'
                output += f'    return await mcp_server.setta_websocket.use_frontend_tool("{func_name}", args)\n'
            else:
                output += f'    return await mcp_server.setta_websocket.use_frontend_tool("{func_name}")\n'

            output += "\n"

    try:
        # Format code with ruff (handles both imports and code formatting)
        output = ruff_format(output)
        print("Successfully formatted code with ruff")
    except Exception as e:
        print(f"Warning: Could not format code: {e}")

    # Write to file
    with open(output_path, "w") as f:
        f.write(output)

    print(f"Successfully generated MCP tools module at {output_path}")


if __name__ == "__main__":
    generate_mcp_tools("mcp-tools.json", "../backend/setta/mcp/generated_tools.py")
