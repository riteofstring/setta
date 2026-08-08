import re
from dataclasses import dataclass
from typing import Any


@dataclass
class CodeMirrorCompletion:
    label: str
    type: str


def process_completion_response(response: Any) -> list[CodeMirrorCompletion]:
    if isinstance(response, list):
        return process_completion(response)
    if not isinstance(response, dict):
        return []
    result = response.get("result")
    if isinstance(result, list):
        return process_completion(result)
    if not result or not result.get("items"):
        return []
    return process_completion(result["items"])


def process_completion(items: list[dict[str, Any]]) -> list[CodeMirrorCompletion]:
    content: list[CodeMirrorCompletion] = []
    for x in items:
        label = x["label"]
        if _is_temp_snapshot_label(label):
            continue
        c = CodeMirrorCompletion(label=label, type=type_mapping[x["kind"]])
        content.append(c)

    return content


type_mapping = {
    1: "File",
    2: "Module",
    3: "Namespace",
    4: "Package",
    5: "Class",
    6: "Method",
    7: "Property",
    8: "Field",
    9: "Constructor",
    10: "Enum",
    11: "Interface",
    12: "Function",
    13: "Variable",
    14: "Constant",
    15: "String",
    16: "Number",
    17: "Boolean",
    18: "Array",
    19: "Object",
    20: "Key",
    21: "Null",
    22: "EnumMember",
    23: "Struct",
    24: "Event",
    25: "Operator",
    26: "TypeParameter",
}

# Hide temp completion snapshot modules (e.g., setta_gen__<uuid>).
_TEMP_SNAPSHOT_LABEL = re.compile(r"__[0-9a-f]{32}$")


def _is_temp_snapshot_label(label: str) -> bool:
    return bool(_TEMP_SNAPSHOT_LABEL.search(label))
