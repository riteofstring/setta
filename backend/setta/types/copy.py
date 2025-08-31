from setta.database.utils import create_new_id, rename_keys
from setta.types.generated.impl_args_as_typed_dicts import ProjectConfigArgs
from setta.types.project_config import ProjectConfig


def copy_project_config(
    project_config: ProjectConfig,
    new_config_name=None,
    do_create_new_id=False,
    section_id_map=None,
):
    new_values: ProjectConfigArgs = {}
    if new_config_name:
        new_values["name"] = new_config_name
    if do_create_new_id:
        new_values["id"] = create_new_id()
    if section_id_map:
        new_values["topLevelSections"] = rename_keys(
            project_config.topLevelSections, section_id_map
        )
    return project_config.model_copy(update=new_values, deep=True)
