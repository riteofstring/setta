from . import models
from .models import (
    UI,
    EnteredValue,
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
    UITypeConfig,
)


def get_package_name(full_module_name):
    return full_module_name.split(".")[0]


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


def save_all_module_info(owner, all_module_info):
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


def save_collections(owner, collections, col_type):
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

    # save_collection_rel(owner, all_collections, col_type)


def update_section(section, attr, rel_table, uuid_of_rel):
    rel = None
    if uuid_of_rel:
        rel = rel_table.objects.get(uuid=uuid_of_rel)
    setattr(section, attr, rel)
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
    print(section_info)
    uuid = section_info["id"]
    name = section_info["name"]
    section, _ = generic_create(Section, {"uuid": uuid, "name": name, "owner": owner})
    col, _ = generic_create(
        ParameterValueCollection,
        {"uuid": section_info["paramCollectionId"], "owner": owner},
    )
    section.parameter_value_collection = col
    section.save()
    update_section(section, "selected_object", Object, section_info["selectedItem"])
    update_section(
        section,
        "section_type_config",
        SectionTypeConfig,
        section_info["sectionTypeId"],
    )


def save_children_info(owner, children_info):
    for ui_id, children_ids in children_info.items():
        ui, _ = generic_create(UI, {"uuid": ui_id, "owner": owner})
        for i, child_id in enumerate(children_ids):
            section = Section.objects.get(uuid=child_id)
            generic_create(
                SectionPosition, {"section": section, "ui": ui, "position": i}
            )


def save_section_children(idsOverview):
    for section_id, children_info_id in idsOverview.items():
        section = Section.objects.get(uuid=section_id)
        update_section(section, "children", UI, children_info_id)


def save_sections(owner, sections):
    for section_info in sections:
        save_section(owner, section_info)


def save_entered_values(owner, entered_values):
    for uuid, value in entered_values.items():
        ev, _ = generic_create(EnteredValue, {"uuid": uuid, "owner": owner})
        ev.value = value
        ev.save()


def save_ui_type_config(owner, config):
    ui_type, _ = generic_create(UIType, {"name": config["name"]})
    ui_type_config, _ = generic_create(
        UITypeConfig, {"uuid": config["id"], "owner": owner}
    )
    ui_type_config.ui_type = ui_type
    ui_type_config.config = config["config"]
    ui_type_config.save()


def save_ui_type_configs(owner, configs):
    for config in configs:
        save_ui_type_config(owner, config)


def save_param_value_collections(owner, param_infos):
    for uuid, x in param_infos.items():
        col, _ = generic_create(
            ParameterValueCollection, {"uuid": uuid, "owner": owner}
        )
        for param_id, info in x.items():
            ev = EnteredValue.objects.get(uuid=info["enteredValueId"])
            param = Parameter.objects.get(uuid=info["id"])
            generic_create(
                ParameterValue,
                {"collection": col, "entered_value": ev, "parent": param},
            )


def save_ui(request):
    owner = request.user
    data = request.data

    ui_info = data["ui"]
    folder_info = data["folder"]
    folder_name = folder_info["name"]

    folder, _ = generic_create(Folder, {"name": folder_name, "owner": owner})

    # record "immutable" info
    save_all_module_info(owner, ui_info["allModuleInfo"])
    save_collections(owner, ui_info["allObjCollections"], "objects")
    save_collections(owner, ui_info["allParamCollections"], "parameters")

    save_section_type_configs(owner, ui_info["sectionTypes"])
    save_entered_values(owner, ui_info["enteredValues"])
    save_ui_type_configs(owner, ui_info["uiTypes"])
    save_param_value_collections(owner, ui_info["paramInfos"])

    save_sections(owner, ui_info["sectionInfos"])
    save_children_info(owner, ui_info["childrenInfo"])
    save_section_children(ui_info["idsOverview"])

    print(ui_info["paramInfos"])

    print("success")
