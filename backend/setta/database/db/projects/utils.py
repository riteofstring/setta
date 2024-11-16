import json
from collections import defaultdict

from setta.utils.constants import BASE_UI_TYPE_IDS, C, is_from_json_source
from setta.utils.utils import try_json


def remove_json_source_data(p):
    for variant in p["sectionVariants"].values():
        variant["values"] = {
            k: v for k, v in variant["values"].items() if not is_from_json_source(k)
        }

    jsonCodeInfoWithUIType = set()
    for uiTypeCol in p["uiTypeCols"].values():
        for paramInfoId, uiTypeInfo in uiTypeCol.items():
            # we want to know which json source params have an associated uiTypeId
            # only if it's not the base TEXT type, since that's the default
            if (
                is_from_json_source(paramInfoId)
                and uiTypeInfo["uiTypeId"] != BASE_UI_TYPE_IDS[C.TEXT]
            ):
                jsonCodeInfoWithUIType.add(paramInfoId)

    p["codeInfo"] = {
        k: v
        for k, v in p["codeInfo"].items()
        if k in jsonCodeInfoWithUIType or not is_from_json_source(k)
    }

    p["codeInfoCols"] = {
        k: v
        for k, v in p["codeInfoCols"].items()
        if k in jsonCodeInfoWithUIType or not is_from_json_source(k)
    }

    for codeInfoCol in p["codeInfoCols"].values():
        for id, children in codeInfoCol["children"].items():
            codeInfoCol["children"][id] = [
                c
                for c in children
                if c in jsonCodeInfoWithUIType or not is_from_json_source(c)
            ]


def save_json_source_data(p):
    to_be_saved = defaultdict(dict)

    for variant in p["sectionVariants"].values():
        codeInfoCol = p["codeInfoCols"][variant["codeInfoColId"]]
        for k, children in codeInfoCol["children"].items():
            if is_from_json_source(k):
                metadata = json.loads(k.removeprefix(C.JSON_SOURCE_PREFIX))
                filename = metadata["filename"]
                key_path = metadata["key"]
                value = (
                    try_json(variant["values"][k]["value"])
                    if len(children) == 0
                    else {}
                )

                # Navigate to the correct nested position
                current_dict = to_be_saved[filename]
                for path_part in key_path[:-1]:
                    # Create nested dictionaries if they don't exist
                    if path_part not in current_dict:
                        current_dict[path_part] = {}
                    current_dict = current_dict[path_part]

                # Set the value at the final position
                if key_path:  # Only set if we have a path
                    current_dict[key_path[-1]] = value

    # Save each file
    for filename, data in to_be_saved.items():
        with open(filename, "w") as f:
            json.dump(data, f, indent=2)
