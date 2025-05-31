import enum
import importlib
import inspect
import pkgutil
from pathlib import Path

import setta.types


def get_modules_from_package(package):
    modules = []
    package_name = package.__name__

    for _, modname, ispkg in pkgutil.iter_modules(package.__path__, package_name + "."):
        if not ispkg:
            try:
                module = importlib.import_module(modname)
                modules.append(module)
            except ImportError as e:
                print(f"Could not import {modname}: {e}")

    return modules


def get_all_enums(module):
    return [
        x[1]
        for x in inspect.getmembers(
            module,
            lambda obj: inspect.isclass(obj)
            and issubclass(obj, enum.Enum)
            and obj is not enum.Enum
            and obj is not enum.StrEnum,
        )
    ]


def enum_to_ts(enum_class):
    enum_name = enum_class.__name__
    members = [f'  {member.name} = "{member.value}"' for member in enum_class]
    members_str = ",\n".join(members)
    return f"enum {enum_name} {{\n{members_str}\n}}\n\n"


def main(output_file):
    all_enums = set()
    modules = get_modules_from_package(setta.types)
    for module in modules:
        enums = get_all_enums(module)
        all_enums.update(enums)

    ts_code = ""
    for e in all_enums:
        ts_code += enum_to_ts(e)

    with open(output_file, "w") as f:
        f.write(ts_code)


if __name__ == "__main__":
    main(Path("../src/utils/generated_schemas_2.ts"))
