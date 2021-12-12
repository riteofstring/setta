from . import models
from .models import (
    UI,
    Folder,
    Module,
    Object,
    ObjectCollection,
    ObjectToObjectCollection,
    Package,
    Parameter,
    ParameterCollection,
    ParameterUIType,
    ParameterUITypeCollection,
    ParameterValue,
    ParameterValueCollection,
    Section,
    SectionPosition,
    SectionType,
    SectionTypeConfig,
    SectionTypeConfigToObjectCollection,
    SectionTypeConfigToParameterCollection,
    UIToFolder,
    UIToObjectCollection,
    UIToParameterCollection,
    UIType,
)


def get_package_name(full_module_name):
    return full_module_name.split(".")[0]


def parse_selection_history_string(x):
    x_split = x.split("~")
    return {"module": x_split[0], "obj": x_split[1]}


def make_selection_history_string(x):
    try:
        return f'{x["module"]}~{x["obj"]}'
    except:
        return "null"


def try_get(table, kwargs):
    try:
        return table.objects.get(**kwargs)
    except table.DoesNotExist:
        return None


def generic_create(table, kwargs):
    new, was_created = table.objects.get_or_create(**kwargs)
    return new, was_created


def try_get_then_create(table, get_kwargs, create_kwargs, update_kwargs):
    x = try_get(table, get_kwargs)
    if x is None:
        x = table.objects.create(**create_kwargs)
    elif len(update_kwargs) > 0:
        for k, v in update_kwargs.items():
            setattr(x, k, v)
        x.save()


def generic_bulk_create(table, batch):
    return table.objects.bulk_create(batch, ignore_conflicts=True)


def generic_bulk_create_and_return(table, batch, properties):
    objs = generic_bulk_create(table, batch)
    obj_properties = zip(*[[getattr(obj, p) for p in properties] for obj in objs])
    obj_properties = list(obj_properties)
    kwargs = {f"{p}__in": obj_properties[i] for i, p in enumerate(properties)}
    return table.objects.filter(**kwargs)


def delete_old_sections(table, ui, ui_key, section_key, list_of_sections):
    ids = [section for _, section in list_of_sections]
    table.objects.filter(**{ui_key: ui}).exclude(**{f"{section_key}__in": ids}).delete()


def get_collection_table(collection_type, from_table_name=None):
    if from_table_name is None:
        return ObjectCollection if collection_type == "objects" else ParameterCollection
    else:
        return getattr(
            models,
            f"{from_table_name}ToObjectCollection"
            if collection_type == "objects"
            else f"{from_table_name}ToParameterCollection",
        )


def save_collection_rel(entity, list_of_collections, collection_type):
    rel_table = get_collection_table(collection_type, entity.__class__.__name__)
    existing_rels = rel_table.objects.filter(entity=entity)
    for er in existing_rels:
        if er.parent not in list_of_collections:
            er.delete()
    for c in list_of_collections:
        generic_create(rel_table, {"entity": entity, "parent": c})


def save_parameter(owner, param_id, param_info, parent, parent_is_obj):
    parent_col = "parent_object" if parent_is_obj else "parent_collection"
    kwargs = {
        "name": param_info["name"],
        "uuid": param_id,
        "default_val": param_info["defaultVal"],
        "type": param_info["type"],
        parent_col: parent,
    }
    param, _ = generic_create(Parameter, kwargs)
    if "specs" in param_info:
        save_entity_collection_rels(owner, param, param_info["specs"])


def save_all_module_info(entity, all_module_info):
    owner = entity.owner
    data = all_module_info["children"]
    for module_id, module_info in data.items():
        module_name = module_info["name"]
        version = module_info["version"]
        package, _ = generic_create(
            Package,
            {"name": get_package_name(module_name), "owner": owner, "version": version},
        )
        module, _ = generic_create(
            Module, {"name": module_name, "uuid": module_id, "parent": package}
        )
        for object_id, object_info in module_info["children"].items():
            object_name = object_info["name"]
            obj, _ = generic_create(
                Object, {"name": object_name, "uuid": object_id, "parent": module}
            )
            for param_id, param_info in object_info["children"].items():
                save_parameter(owner, param_id, param_info, obj, True)


def save_collections(entity, collections, col_type):
    owner = entity.owner
    col_table = get_collection_table(col_type)
    data = collections["children"]
    all_collections = []
    for col_id, col_info in data.items():
        col_name = col_info["name"]
        col, _ = generic_create(
            col_table, {"name": col_name, "uuid": col_id, "owner": owner}
        )
        all_collections.append(col)
        for uuid, item_info in col_info["children"].items():
            if col_type == "objects":
                obj = Object.objects.get(uuid=uuid)
                object_to_object_collection = generic_create(
                    ObjectToObjectCollection,
                    {"entity": obj, "parent": col},
                )
            elif col_type == "parameters":
                save_parameter(owner, uuid, item_info, col, False)
            else:
                raise ValueError

    save_collection_rel(entity, all_collections, col_type)


def save_section_selected_object(owner, section, section_info):
    selected_object = section_info["selectedItem"]
    if selected_object:
        obj = Object.objects.get(uuid=selected_object)
        section.selected_object = obj
    else:
        section.selected_object = None
    section.save()


def save_entity_collection_rels(owner, entity, available_dict):
    for collection_type in ["objects", "parameters"]:
        available = available_dict.get(collection_type, [])
        all_collections = []
        query_table = get_collection_table(collection_type)
        for collection_name in available:
            retrieved, _ = generic_create(
                query_table, {"name": collection_name, "owner": owner}
            )
            all_collections.append(retrieved)
        save_collection_rel(entity, all_collections, collection_type)


def get_object_from_str(section, x):
    if x == "null":
        return None
    x = parse_selection_history_string(x)
    section_to_object_collections = SectionToObjectCollection.objects.filter(
        entity=section
    )
    for stmc in section_to_object_collections:
        object_to_object_collection = try_get(
            ObjectToObjectCollection,
            {"entity__name": x["obj"], "parent": stmc.parent},
        )
        if object_to_object_collection is not None:
            return object_to_object_collection.entity


def get_param_from_selected_object(section, x, selected_object):
    if selected_object:
        return Parameter.objects.get(name=x, parent_object=selected_object)
    section_to_param_collections = SectionToParameterCollection.objects.filter(
        entity=section
    )
    for stpc in section_to_param_collections:
        param = try_get(Parameter, {"name": x, "parent_collection": stpc.parent})
        if param is not None:
            return param


def add_collection_to_section(owner, section, attr_name, table_name):
    col = getattr(section, attr_name)
    if not col:
        col, _ = generic_create(table_name, {"name": section.name, "owner": owner})
        setattr(section, attr_name, col)
        section.save()
    return col


def save_section_entered_values(owner, section, entered_values):
    param_val_collection = add_collection_to_section(
        owner, section, "entered_values", ParameterValueCollection
    )
    for module_obj_str, obj_value_dict in entered_values.items():
        selected_object = get_object_from_str(section, module_obj_str)
        for name, param_dict in obj_value_dict.items():
            if len(param_dict) == 0:
                continue
            param = get_param_from_selected_object(section, name, selected_object)
            for ui_type_name, value in param_dict.items():
                ui_type, _ = generic_create(UIType, {"name": ui_type_name})

                param_val, _ = generic_create(
                    ParameterValue,
                    {
                        "parent": param,
                        "collection": param_val_collection,
                        "ui_type": ui_type,
                    },
                )
                param_val.value = value
                param_val.save()


def save_section_ui_types(owner, section, param_ui_type_names):
    param_ui_type_collection = add_collection_to_section(
        owner, section, "ui_types", ParameterUITypeCollection
    )
    for module_obj_str, obj_value_dict in param_ui_type_names.items():
        selected_object = get_object_from_str(section, module_obj_str)
        for param_name, ui_type_name in obj_value_dict.items():
            param = get_param_from_selected_object(section, param_name, selected_object)
            ui_type, _ = generic_create(UIType, {"name": ui_type_name})

            try_get_then_create(
                ParameterUIType,
                {"parent": param, "collection": param_ui_type_collection},
                {
                    "parent": param,
                    "collection": param_ui_type_collection,
                    "ui_type": ui_type,
                },
                {"ui_type": ui_type},
            )


def save_section_all_entered_values(owner, section, section_info):
    entered_values = section_info["enteredValues"]
    param_ui_type_names = section_info["paramUITypeNames"]
    save_section_entered_values(owner, section, entered_values)
    save_section_ui_types(owner, section, param_ui_type_names)


def save_section_type(section_type):
    section_type, _ = generic_create(SectionType, {"name": section_type["name"]})
    return section_type


def save_section_type_config_to_collection(owner, section_type_config, stc, col_type):
    key = {"objects": "objCollectionIds", "parameters": "paramCollectionIds"}[col_type]
    col_table = get_collection_table(col_type)
    to_col_table = get_collection_table(col_type, "SectionTypeConfig")
    for x in section_type_config[key]:
        col = col_table.objects.get(uuid=x)
        generic_create(to_col_table, {"entity": stc, "parent": col})


def save_section_type_config(owner, section_type_config):
    section_type = save_section_type({"name": section_type_config["name"]})
    uuid = section_type_config["id"]
    stc, _ = generic_create(
        SectionTypeConfig, {"uuid": uuid, "owner": owner, "section_type": section_type}
    )
    save_section_type_config_to_collection(owner, section_type_config, stc, "objects")
    save_section_type_config_to_collection(
        owner, section_type_config, stc, "parameters"
    )


def save_section_type_configs(owner, section_type_configs):
    for x in section_type_configs:
        save_section_type_config(owner, x)


def save_section(owner, section_info):
    uuid = section_info["id"]
    name = section_info["name"]
    section, _ = generic_create(Section, {"uuid": uuid, "name": name, "owner": owner})
    save_section_selected_object(owner, section, section_info)
    # save_entity_collection_rels(owner, section, section_info["available"])
    # save_section_all_entered_values(owner, section, section_info)
    # return section


def get_children(sections, section_info):
    return {str(sid): sections[str(sid)] for sid in section_info["childrenIds"]}


def save_children(owner, section, sections_to_save, section_info, all_sections, depth):
    children = get_children(all_sections, section_info)
    if len(children) > 0:
        list_of_child_sections = save_sections(owner, children, all_sections, depth + 1)
        ui_name = f"{section.name}_children"
        ui, _ = generic_create(UI, {"name": ui_name, "owner": owner})
        section.children = ui
        section.save()
        save_section_to_ui_info(ui, list_of_child_sections)


def save_sections(owner, sections_to_save, all_sections, depth=0):
    all_root_sections = []
    # position = 0
    for section_info in sections_to_save:
        # if section_info["depth"] == depth:
        section = save_section(owner, section_info)
        # all_root_sections.append((position, section))
        # save_children(
        #     owner, section, sections_to_save, section_info, all_sections, depth
        # )
        # position += 1
    return all_root_sections


def save_sections_to_ui_rel(ui, list_of_sections):
    delete_old_sections(SectionToUI, ui, "parent", "entity", list_of_sections)
    for _, section in list_of_sections:
        generic_create(SectionToUI, {"entity": section, "parent": ui})


def save_section_positions(ui, list_of_sections):
    delete_old_sections(SectionPosition, ui, "ui", "section", list_of_sections)
    for position, section in list_of_sections:
        try_get_then_create(
            SectionPosition,
            {"ui": ui, "section": section},
            {"ui": ui, "section": section, "position": position},
            {"position": position},
        )


def save_section_to_ui_info(ui, list_of_sections):
    save_sections_to_ui_rel(ui, list_of_sections)
    save_section_positions(ui, list_of_sections)


def save_ui(request):
    owner = request.user
    data = request.data

    ui_info = data["ui"]
    folder_info = data["folder"]
    folder_name = folder_info["name"]

    folder, _ = generic_create(Folder, {"name": folder_name, "owner": owner})

    ui_name = ui_info["name"]
    ui, _ = generic_create(UI, {"name": ui_name, "owner": owner})
    generic_create(UIToFolder, {"entity": ui, "parent": folder})

    # record "immutable" info
    save_all_module_info(ui, ui_info["allModuleInfo"])
    save_collections(ui, ui_info["allObjCollections"], "objects")
    save_collections(ui, ui_info["allParamCollections"], "parameters")

    save_section_type_configs(owner, ui_info["sectionTypes"])
    sections = ui_info["sectionInfos"]
    list_of_root_sections = save_sections(owner, sections, sections)
    # save_section_to_ui_info(ui, list_of_root_sections)
    # print("successs")
