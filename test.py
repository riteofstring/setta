# import asyncio
# from pathlib import Path

# from setta.database.db_objs import DBE
# from setta.database.settings_file import SettingsFile
# from setta.lsp.managers import LSPServers, LSPWriters
# from setta.project_state.project_manager import ProjectManager
# from setta.types.simplified_states import SimplifiedSectionCreation
# from setta.websockets.websocket_manager import WebsocketManager


# async def main():
#     lsp_servers = LSPServers({})
#     lsp_writers = LSPWriters(lsp_servers)
#     websocket_manager = WebsocketManager()
#     settings_file = SettingsFile()
#     dbe = DBE(Path("setta_files/setta.db"))
#     pm = ProjectManager(lsp_writers, websocket_manager, settings_file, dbe)
#     print(pm.project_state_backend.projectConfigs)
#     await pm.create_sections(
#         "2cd25ec7-18ea-455e-ad28-5ba67aef5f3b", [SimplifiedSectionCreation(name="dog")]
#     )


# asyncio.run(main())


from setta.types.settings_state import SettingsState

# sectionImpls = SectionImplTypeAdapter.validate_python({"type": SectionType.TextBlock})
# p = ProjectStateSingleConfig.model_validate(
#     {"projectConfig": {}, "sectionImpls": sectionImpls}
# )

# pprint(p.model_dump())
# pprint(sectionImpls.model_dump())


sectionImpls = {"123": {"type": "TextBlock"}}
codeObjImpls = {"456": {"type": "DropdownParam", "choices": ["dog", "cat"]}}
model_json_str = json.dumps(
    {"projectConfig": {}, "sectionImpls": sectionImpls, "codeObjImpls": codeObjImpls}
)
p = ProjectStateSingleConfig.model_validate_json(model_json_str)
pprint(p.model_dump())

# # First, let's test the TypeAdapter directly to see what's happening
# test_data = {
#     "type": SectionType.TextBlock,
#     # Add other fields if needed
# }

# try:
#     result = SectionImplTypeAdapter.validate_python(test_data)
#     print(f"Result type: {type(result).__name__}")
#     print(f"Has TextBlock fields: {'description' in result.__dict__}")
#     print(result.model_dump())
# except Exception as e:
#     print(f"Error: {e}")


SettingsState()
