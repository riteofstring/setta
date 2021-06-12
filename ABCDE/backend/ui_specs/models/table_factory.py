from .base_models import get_base_model, get_base_relationship_model
from .labels import get_base_folder_model, get_base_tag_model


def table_factory(base_name, base_parent=None, additional_rel=None):
    output = {}
    output[base_name] = get_base_model(
        base_name, f"{base_name}_unique", parent_table=base_parent
    )
    base_obj = output[base_name]

    rel_name = f"{base_name}Fork"
    output[rel_name] = get_base_relationship_model(
        rel_name,
        base_obj,
        f"{rel_name}_unique",
        single_parent=True,
    )

    to_folder_name = f"{base_name}Folder"
    output[to_folder_name] = get_base_folder_model(
        to_folder_name, base_obj, f"{to_folder_name}_unique"
    )

    to_tag_name = f"{base_name}Tag"
    output[to_tag_name] = get_base_tag_model(
        to_tag_name, base_obj, f"{to_tag_name}_unique"
    )

    if additional_rel is not None:
        rel_name = f"{base_name}{additional_rel.__name__}"
        output[rel_name] = get_base_relationship_model(
            rel_name,
            base_obj,
            f"{rel_name}_unique",
            single_parent=False,
            parent_table=additional_rel,
        )

    return output
