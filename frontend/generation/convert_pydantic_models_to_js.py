from enum import StrEnum
from typing import Type
from pydantic import BaseModel
from setta.project_state.base_ui_types import UIType
from setta.project_state.project_state import Section, SectionSize


def pydantic_to_js_factory(model_class: BaseModel) -> str:
    """
    Convert a Pydantic model class to a JavaScript factory function.
    
    Args:
        model_class: A Pydantic model class
        
    Returns:
        str: JavaScript code for a factory function
    """
    function_name = model_class.__name__
    
    # Start building the function
    js_code = []
    js_code.append(f"function {function_name}(x = {{}}) {{")
    js_code.append("  return {")
    
    # Process each field
    for field_name, field in model_class.model_fields.items():
        if field.is_required():
            js_code.append(f"    {field_name}: x.{field_name},")
        else:
            default_js = get_js_default(field)
            js_code.append(f"    {field_name}: {field_name} in x ? x.{field_name} : {default_js},")
    
    # Close function
    js_code.append("  };")
    js_code.append("}")
    
    return "\n".join(js_code)

def get_js_default(field):
    if not field.default and not field.default_factory:
        print(field.is_required())
    """Get JavaScript default value for a Pydantic field."""
    # Handle collection types
    if "List" in str(field.annotation) or "list" in str(field.annotation).lower():
        return "[]"
    if "Dict" in str(field.annotation) or "dict" in str(field.annotation).lower():
        return "{}"
    
    # Handle default factory
    if field.default_factory is not None:
        if hasattr(field.default_factory, "__name__"):
            # print(field.default_factory.__name__)
            if "list" in field.default_factory.__name__.lower():
                return "[]"
            elif "dict" in field.default_factory.__name__.lower():
                return "{}"
        
        # Try to call the factory
        try:
            value = field.default_factory()
            return py_to_js(value)
        except:
            return "null"
    
    # Handle direct default value
    if field.default is not None and field.default is not ...:
        return py_to_js(field.default)
    
    # Fallback - infer from type
    type_str = str(field.annotation).lower()
    if "str" in type_str:
        return '""'
    elif "int" in type_str or "float" in type_str:
        return "0"
    elif "bool" in type_str:
        return "false"
    else:
        return "null"

def py_to_js(value):
    """Convert Python value to JavaScript representation."""
    if value is None:
        return "null"
    elif isinstance(value, bool):
        return str(value).lower()
    elif isinstance(value, (int, float)):
        return str(value)
    elif isinstance(value, str):
        return f'"{value}"'
    elif isinstance(value, list):
        return "[]"
    elif isinstance(value, dict):
        return "{}"
    elif hasattr(value, "value"):  # For Enum values
        return py_to_js(value.value)
    else:
        return "null"
    

from pprint import pprint

pprint(Section.model_json_schema())

# print(pydantic_to_js_factory(Section))