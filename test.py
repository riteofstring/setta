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


# from setta.database.settings_file import SettingsFile
# from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
# from setta.websockets.websocket_manager import WebsocketManager

# wm = WebsocketManager()
# wmh = WMHFrontendSender(wm)
# sf = SettingsFile(wmh)
# print(sf.settings)


# from setta.database.db.jsonSource.load import (
#     load_json_sources_into_data_structures,
# )
# from setta.project_state.settings_project import (
#     create_settings_project_state,
# )
# from setta.types.generated.settings_state import SettingsState
# from setta.utils.constants import SETTA_FILES_FOLDER

# settings = SettingsState()
# p = create_settings_project_state(SETTA_FILES_FOLDER / "setta-settings.json")
# load_json_sources_into_data_structures(settings, p)


from pprint import pprint
from setta.project_state.settings_project import create_settings_project_state
from setta.types.helpers import get_effective_section_impl, get_section_impl_layering
from setta.types.impl_helpers import set_effective_impl_value
from setta.types.section_impls import SectionSize
from setta.utils.constants import CWD


p = create_settings_project_state(CWD / "setta_files/setta-settings.json")

sectionId = list(p.sections.keys())[0]

core = p.sections[sectionId]
impl = get_effective_section_impl(p, sectionId)
layering = get_section_impl_layering(p, sectionId)

set_effective_impl_value(layering, core, p.sectionImpls, "isPreset", True)
set_effective_impl_value(
    layering, core, p.sectionImpls, "size", SectionSize(width=500, height=200)
)
set_effective_impl_value(
    layering, core, p.sectionImpls, "codeObjImplLayeringMap", {"dog": 5}
)

core = p.sections[sectionId]
impl = get_effective_section_impl(p, sectionId)
layering = get_section_impl_layering(p, sectionId)


pprint(p.sectionImpls[layering.impl].model_dump())
pprint(core.sharedModifier)
pprint(layering.modifier)
pprint(impl.model_dump())
