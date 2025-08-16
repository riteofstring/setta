# def get_content_processor(
#     project_manager_switcher: ProjectManagerSwitcher,
#     file_watch_group_name: FileWatchGroupName,
# ) -> FileWatcherCallback:
#     match file_watch_group_name:
#         case FileWatchGroupName.jsonSource:
#             return get_content_processor_json_source(project_manager_switcher)
#         case FileWatchGroupName.apiKeys:
#             return content_processor_api_keys
#         case _:
#             assert_never(file_watch_group_name)


# async def content_processor_api_keys(
#     coreUpdate: FileWatcherCoreUpdate, file_to_read: Path
# ):
#     with open(file_to_read, "r", encoding="utf-8") as f:
#         raw_content = f.read()
#     env_vars = dotenv_values(stream=StringIO(raw_content))
#     fileContent = get_llm_api_keys_from_env_vars(env_vars)
#     return FileWatcherUpdateAPIKeys(coreUpdate=coreUpdate, fileContent=fileContent)


# def get_content_processor_json_source(project_manager_switcher: ProjectManagerSwitcher):
#     async def content_processor_json_source(
#         coreUpdate: FileWatcherCoreUpdate, file_to_read: Path
#     ):
#         await maybe_read_json_source_contents(project_manager_switcher, coreUpdate)
#         return FileWatcherUpdateJSONSource(coreUpdate=coreUpdate, fileContent=None)

#     return content_processor_json_source


from setta.utils.constants import C


def get_llm_api_keys_from_env_vars(env_vars: dict[str, str | None]):
    return {
        key: value
        for key, value in env_vars.items()
        if key in C.LLM_API_KEY_NAMES.values() and value
    }
