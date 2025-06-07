import inspect
from dataclasses import dataclass

import docstring_parser
from mcp.types import AnyFunction


@dataclass
class SettaMCPTool:
    fn: AnyFunction
    description: str | None
    param_descriptions: dict[str, str]


SETTA_MCP_TOOLS: list[SettaMCPTool] = []


def setta_tool(fn):
    description, param_descriptions = extract_tool_docstrings(fn)
    SETTA_MCP_TOOLS.append(
        SettaMCPTool(
            fn=fn, description=description, param_descriptions=param_descriptions
        )
    )
    return fn


def extract_tool_docstrings(func):
    # Get the function's docstring
    docstring = inspect.getdoc(func)
    if not docstring:
        return None, {}

    # Parse the docstring using docstring_parser
    try:
        parsed = docstring_parser.parse(docstring)
    except Exception as e:
        print(f"Failed to parse docstring: {e}")
        return None, {}

    # Extract parameter descriptions
    param_docs = {}
    for param in parsed.params:
        if param.description:
            param_docs[param.arg_name] = param.description

    return parsed.description, param_docs
