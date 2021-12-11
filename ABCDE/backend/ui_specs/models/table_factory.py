from .base_models import get_base_model, get_base_relationship_model
from .labels import get_base_folder_model, get_base_tag_model


def table_factory(
    base_name,
    base_constraint_fields,
    base_parent=None,
    base_has_uuid=False,
    base_has_name=False,
    base_has_owner=False,
    base_has_value=False,
    base_additional_tables=None,
    base_additional_constraints=None,
    additional_rel=None,
    forkable=False,
    saveable=False,
    taggable=False,
):
    output = {}
    output[base_name] = get_base_model(
        base_name,
        base_constraint_fields,
        parent_table=base_parent,
        has_uuid=base_has_uuid,
        has_name=base_has_name,
        has_owner=base_has_owner,
        has_value=base_has_value,
        additional_tables=base_additional_tables,
        additional_constraints=base_additional_constraints,
    )
    base_obj = output[base_name]

    if forkable:
        rel_name = f"{base_name}Fork"
        output[rel_name] = get_base_relationship_model(
            rel_name,
            base_obj,
            single_parent=True,
        )

    if saveable:
        to_folder_name = f"{base_name}ToFolder"
        output[to_folder_name] = get_base_folder_model(
            to_folder_name,
            base_obj,
        )

    if taggable:
        to_tag_name = f"{base_name}ToTag"
        output[to_tag_name] = get_base_tag_model(
            to_tag_name,
            base_obj,
        )

    if additional_rel is not None:
        for ar in additional_rel:
            if isinstance(ar, tuple):
                parent_table, child_table = ar
            else:
                parent_table, child_table = ar, None
            rel_name = f"{base_name}To{parent_table.__name__}"
            output[rel_name] = get_base_relationship_model(
                rel_name,
                base_obj,
                single_parent=False,
                parent_table=parent_table,
                child_table=child_table,
            )

    return output
