import asyncio
from pathlib import Path
from pprint import pprint
import shutil
import time

from setta.database.db.jsonSource.load import load_json_sources_into_data_structures
from setta.database.db.jsonSource.save import save_json_source_data
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import LSPReaders, LSPServers, LSPWriters, start_lsps
from setta.project_state.artifacts import Artifacts
from setta.project_state.jsonSource import JSONSource
from setta.project_state.project_manager import ProjectManager
from setta.project_state.project_manager_types import (
    CreateTopLevelSectionRequest,
    SetSectionVariantNameRequest,
)
from setta.project_state.settings_project import create_settings_project_state
from setta.project_state.settings_project_manager import SettingsProjectManager
from setta.types.generated.impl_args_as_typed_dicts import DictSectionImplArgs
from setta.types.helpers_lvl1 import get_curr_section_variant
from setta.types.helpers_lvl2 import create_top_level_section, set_section_variant_name
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.types.simplified_states import Position
from setta.utils.constants import SETTA_FILES_FOLDER
from setta.websockets.msg_handlers.cli_sender import WMHCLISender
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.script_metadata import ScriptMetadata
from setta.websockets.websocket_manager import WebsocketManager


async def main():
    shutil.rmtree("setta_files")
    websocket_manager = WebsocketManager()
    wmh_frontend_sender = WMHFrontendSender(websocket_manager)
    dbe = DBE(SETTA_FILES_FOLDER)
    settings_file = SettingsFile(dbe, wmh_frontend_sender)
    lsps = LSPServers(settings_file.settings.languageServer)
    lsp_writers = LSPWriters(lsps)
    lsp_readers = LSPReaders(lsps, wmh_frontend_sender)
    await start_lsps(lsps, lsp_readers, lsp_writers)
    script_metadata = ScriptMetadata()
    wmh_cli_sender = WMHCLISender(websocket_manager)
    specific_file_watcher = SpecificFileWatcher()
    specific_file_watcher.start()
    artifacts = Artifacts(wmh_frontend_sender, specific_file_watcher, dbe)
    json_source = JSONSource(
        wmh_frontend_sender,
        settings_file,
        specific_file_watcher,
        dbe,
    )
    project_manager = ProjectManager(
        lsp_writers,
        wmh_frontend_sender,
        settings_file,
        specific_file_watcher,
        dbe,
        artifacts,
        json_source,
    )
    settings_project_manager = SettingsProjectManager(
        lsp_writers,
        wmh_frontend_sender,
        settings_file,
        specific_file_watcher,
        dbe,
        artifacts,
        json_source,
    )

    await project_manager.create_project_config("")
    projectConfigId = list(project_manager.project_state_backend.projectConfigs.keys())[
        0
    ]
    sectionId = await project_manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=projectConfigId,
            implType=SectionType.Dict,
            implOverrides=DictSectionImplArgs(type=SectionType.Dict, isJsonSource=True),
            position=Position(),
        )
    )
    projectStateSingleConfig = convert_backend_to_single_config(
        project_manager.project_state_backend, projectConfigId
    )
    variant = get_curr_section_variant(projectStateSingleConfig, sectionId)
    await project_manager.set_section_variant_name(
        SetSectionVariantNameRequest(
            projectConfigId=projectConfigId,
            variantId=variant.id,
            name="setta_files/setta-settings.json",
        )
    )

    project_manager.save()
    print("saved!!")
    # Keep the program running
    try:
        await asyncio.Event().wait()  # This will wait forever
    except KeyboardInterrupt:
        print("Shutting down...")


asyncio.run(main())


# class DummyWMH:
#     async def broadcast_notification(self, n):
#         pass


# wmh = DummyWMH()
# dbe = DBE(Path("setta_files").resolve())
# pm = ProjectManager()

# json_file_name = Path("setta_files/setta-settings.json")
# json_file_name.unlink()
# # json_file_name = Path("test.json")

# p1 = create_settings_project_state(dbe.settings)
# dbe.write_settings_project(p1)
# # p1 = merge_single_config_into_backend(ProjectStateBackend(), p1)

# p = ProjectStateSingleConfig(projectConfig=ProjectConfig())
# settings_file = SettingsFile(dbe, wmh)
# sfw = SpecificFileWatcher()
# artifacts = Artifacts(wmh, sfw, dbe)
# js = JSONSource(wmh, settings_file, sfw, dbe)
# sectionId = create_top_level_section(
#     settings_file.settings,
#     artifacts,
#     p,
#     SectionType.Dict,
#     Position(),
#     DictSectionImplArgs(isJsonSource=True),
# )
# set_section_variant_name(p, p.sections[sectionId].defaultVariant, str(json_file_name))
# p = merge_single_config_into_backend(ProjectStateBackend(), p)

# file_contents = dbe.read_json(json_file_name)
# processedJson = js.process_json_object(file_contents)
# sectionVariantsToLoad: set[tuple[str, str]] = set()
# for s in p.sections.values():
#     for v in s.variants:
#         sectionVariantsToLoad.add((s.id, v))

# load_json_sources_into_data_structures(
#     p, {json_file_name.resolve(): processedJson}, sectionVariantsToLoad
# )
# print("*********project state********")
# pprint(p.model_dump())
# convert_backend_to_single_config(p, list(p.projectConfigs.keys())[0])
# save_json_source_data(dbe, p)


# p2 = create_settings_project_state(dbe.settings)
# p2 = merge_single_config_into_backend(ProjectStateBackend(), p2)
# file_contents = dbe.read_json(json_file_name)
# processedJson = js.process_json_object(file_contents)
# sectionVariantsToLoad: set[tuple[str, str]] = set()
# for s in p2.sections.values():
#     for v in s.variants:
#         sectionVariantsToLoad.add((s.id, v))

# load_json_sources_into_data_structures(
#     p2, {json_file_name.resolve(): processedJson}, sectionVariantsToLoad
# )
# convert_backend_to_single_config(p2, list(p2.projectConfigs.keys())[0])


# # dbe.write_json(json_file_name, {"dog": {"cat": 5}})
# # file_contents = dbe.read_json(json_file_name)
# # processedJson = js.process_json_object(
# #     file_contents,
# #     set(
# #         [
# #             tuple(s.jsonSourceKeys)
# #             for s in p.sectionImpls.values()
# #             if isinstance(s, BaseDictSectionImpl)
# #         ]
# #     ),
# # )
# # load_json_sources_into_data_structures(p, {json_file_name.resolve(): processedJson})


# # dbe.write_json(json_file_name, {"dog": 5})
# # file_contents = dbe.read_json(json_file_name)
# # processedJson = js.process_json_object(
# #     file_contents,
# #     set(
# #         [
# #             tuple(s.jsonSourceKeys)
# #             for s in p.sectionImpls.values()
# #             if isinstance(s, BaseDictSectionImpl)
# #         ]
# #     ),
# # )
# # load_json_sources_into_data_structures(p, {json_file_name.resolve(): processedJson})


# # print("*********project state********")
# # pprint(p.model_dump())

# # load_json_sources_into_data_structures(p, {Path("test.json").resolve(): processedJson})
# # print("*********project state********")
# # pprint(p.model_dump())

# # sectionId = create_top_level_section(
# #     settings_file.settings,
# #     artifacts,
# #     p,
# #     SectionType.Dict,
# #     Position(),
# #     DictSectionImplArgs(isJsonSource=True),
# # )
# # set_section_variant_name(p, p.sections[sectionId].defaultVariant, "test.json")
# # file_contents = dbe.read_json(Path("test.json"))
# # processedJson = js.process_json_object(file_contents, set([()]))
# # load_json_sources_into_data_structures(p, {Path("test.json").resolve(): processedJson})

# # print("*********project state********")
# # pprint(p.model_dump())
