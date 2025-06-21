# # import asyncio
# # from pathlib import Path

# # from setta.database.db_objs import DBE
# # from setta.database.settings_file import SettingsFile
# # from setta.lsp.managers import LSPServers, LSPWriters
# # from setta.project_state.project_manager import ProjectManager
# # from setta.types.simplified_states import SimplifiedSectionCreation
# # from setta.websockets.websocket_manager import WebsocketManager


# # async def main():
# #     lsp_servers = LSPServers({})
# #     lsp_writers = LSPWriters(lsp_servers)
# #     websocket_manager = WebsocketManager()
# #     settings_file = SettingsFile()
# #     dbe = DBE(Path("setta_files/setta.db"))
# #     pm = ProjectManager(lsp_writers, websocket_manager, settings_file, dbe)
# #     print(pm.project_state_backend.projectConfigs)
# #     await pm.create_sections(
# #         "2cd25ec7-18ea-455e-ad28-5ba67aef5f3b", [SimplifiedSectionCreation(name="dog")]
# #     )


# # asyncio.run(main())


# from pprint import pprint

# from setta.project_state.settings_project import create_settings_project_state

# # sectionImpls = SectionImplTypeAdapter.validate_python({"type": SectionType.TextBlock})
# # p = ProjectStateSingleConfig.model_validate(
# #     {"projectConfig": {}, "sectionImpls": sectionImpls}
# # )

# # pprint(p.model_dump())
# # pprint(sectionImpls.model_dump())


# # sectionImpls = {"123": {"type": "TextBlock"}}
# # codeObjImpls = {"456": {"type": "DropdownParam", "choices": ["dog", "cat"]}}
# # model_json_str = json.dumps(
# #     {"projectConfig": {}, "sectionImpls": sectionImpls, "codeObjImpls": codeObjImpls}
# # )
# # p = ProjectStateSingleConfig.model_validate_json(model_json_str)
# # pprint(p.model_dump())

# # # First, let's test the TypeAdapter directly to see what's happening
# # test_data = {
# #     "type": SectionType.TextBlock,
# #     # Add other fields if needed
# # }

# # try:
# #     result = SectionImplTypeAdapter.validate_python(test_data)
# #     print(f"Result type: {type(result).__name__}")
# #     print(f"Has TextBlock fields: {'description' in result.__dict__}")
# #     print(result.model_dump())
# # except Exception as e:
# #     print(f"Error: {e}")


# p = create_settings_project_state("setta_files/setta-settings.json")

# pprint(p.model_dump()["sectionImplLayerings"])


import inspect
from typing import Any, List, Type

from pydantic import BaseModel
from pydantic_core import PydanticUndefined
from setta.utils.format_code import ruff_format


def find_sub_classes(
    module: Any,
    base_class: Type[BaseModel],
    discriminator: str,
    return_base_classes: bool,
) -> List[Type[BaseModel]]:
    classes = []
    for _, obj in inspect.getmembers(module, inspect.isclass):
        if issubclass(obj, base_class):
            fields = obj.model_fields
            if (
                return_base_classes
                and fields[discriminator].default is PydanticUndefined
            ):
                classes.append(obj)
            elif (
                not return_base_classes
                and fields[discriminator].default is not PydanticUndefined
            ):
                classes.append(obj)

    return classes


import setta.types.sections

discriminator = "type"
base_classes = find_sub_classes(
    setta.types.sections, setta.types.sections.BaseSectionImpl, discriminator, True
)

base_class_to_children = {}
code = """
from typing import Annotated,Union
from pydantic import Field, TypeAdapter
"""
for base_class in base_classes:
    code += f"from setta.types.sections import {base_class.__name__}\n"
    child_classes = find_sub_classes(
        setta.types.sections, base_class, discriminator, False
    )
    base_class_to_children[base_class] = child_classes
    for child_class in child_classes:
        code += f"from setta.types.sections import {child_class.__name__}\n"


for base_class, child_classes in base_class_to_children.items():
    union_name = f"{base_class.__name__}Union"
    code += f"{union_name} = Union[{', '.join(c.__name__ for c in child_classes)}]\n"
    code += f'{union_name}WithDiscriminator = Annotated[{union_name}, Field(discriminator="{discriminator}")]\n'
    code += f"{base_class.__name__}TypeAdapter = TypeAdapter({union_name}WithDiscriminator)\n"

    defaults = [
        f'"{c.model_fields[discriminator].default.value}"' for c in child_classes
    ]
    defaults = ", ".join(defaults)
    code += f"{base_class.__name__}TypeSet = set([{defaults}])\n"

code = ruff_format(code)
print(code)

# SectionImplTypeAdapter = TypeAdapter(SectionImplUnionWithDiscriminator)
# """
