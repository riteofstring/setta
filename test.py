import ast
import yaml

def is_python_literal(s):
    """Check if a string represents a valid Python literal."""
    try:
        ast.literal_eval(s)
        return True
    except (ValueError, SyntaxError):
        return False

def dict_to_yaml(python_dict):
    """
    Convert a dictionary with Python code strings to YAML-friendly format.
    Only converts basic Python literals (numbers, strings, booleans),
    leaving other expressions as strings.
    
    Example:
    Input: {
        'x': '5',
        'y': "'hello'",
        'z': 'math.sqrt(16)',
        'b': 'True'
    }
    Output YAML:
        x: 5
        y: hello
        z: math.sqrt(16)
        b: true
    """
    converted_dict = {}
    for key, value in python_dict.items():
        if is_python_literal(value):
            # Convert only if it's a basic Python literal
            converted_dict[key] = ast.literal_eval(value)
        else:
            # Keep as string if it's not a basic literal
            converted_dict[key] = value
            
    return yaml.dump(converted_dict)

def yaml_to_dict(yaml_str):
    """
    Convert YAML back to a dictionary with Python code strings.
    
    Example:
    Input: 
        x: 5
        y: hello
        z: math.sqrt(16)
        b: true
    Output: {
        'x': '5',
        'y': "'hello'",
        'z': 'math.sqrt(16)',
        'b': 'True'
    }
    """
    yaml_dict = yaml.safe_load(yaml_str)
    converted_dict = {}
    
    for key, value in yaml_dict.items():
        if isinstance(value, (int, float)):
            converted_dict[key] = str(value)
        elif isinstance(value, str):
            # Check if the string is a Python expression (contains non-literal characters)
            if any(c in value for c in '().[]{}+-*/%'):
                converted_dict[key] = value
            else:
                converted_dict[key] = f"'{value}'"
        elif isinstance(value, bool):
            converted_dict[key] = str(value)
        else:
            converted_dict[key] = str(value)
            
    return converted_dict

# Example usage
if __name__ == "__main__":
    # Original dictionary with Python code strings
    original_dict = {
        'number': '5',
        'string': "'hello'",
        'expression': 'math.sqrt(16)',
        'boolean': 'True',
        'operation': '3 + 4',
        "dog": None,
        "cat": "[1,2,3]"
    }
    
    # Convert to YAML
    yaml_str = dict_to_yaml(original_dict)
    print("YAML output:")
    print(yaml_str)
    
    # Convert back to dictionary
    reconstructed_dict = yaml_to_dict(yaml_str)
    print("\nReconstructed dictionary:")
    print(reconstructed_dict)