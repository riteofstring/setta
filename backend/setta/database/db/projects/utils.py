import json
from collections import defaultdict
from json import JSONDecodeError
from pprint import pprint

from setta.utils.constants import is_from_json_source


def remove_json_source_data(p):
    for variant in p["sectionVariants"].values():
        variant["values"] = {
            k: v for k, v in variant["values"].items() if not is_from_json_source(k)
        }

    p["codeInfo"] = {
        k: v for k, v in p["codeInfo"].items() if not is_from_json_source(k)
    }
    for codeInfo in p["codeInfo"].values():
        codeInfo["children"] = [
            c for c in codeInfo["children"] if not is_from_json_source(c)
        ]


def save_json_source_data(p):
    to_be_saved = defaultdict(dict)
    for variant in p["sectionVariants"].values():
        for k, v in variant["values"].items():
            if is_from_json_source(k):
                metadata = json.loads(k.removeprefix("JSON-"))
                to_be_saved[metadata["filename"]][metadata["key"]] = try_json(
                    v["value"]
                )

    pprint(to_be_saved)
    for filename, data in to_be_saved.items():
        with open(filename, "w") as f:
            json.dump(data, f, indent=2)


def try_json(x):
    try:
        return json.loads(x)
    except JSONDecodeError:
        return x
