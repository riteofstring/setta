import json

from .models import (
    UI,
    Folder,
    Module,
    ModuleCollection,
    ModuleToModuleCollection,
    Object,
    Package,
    Parameter,
    ParameterCollection,
    ParameterValue,
    ParameterValueCollection,
    Section,
    SectionPositions,
    SectionToModuleCollection,
    SectionToParameterCollection,
    SectionToUI,
    UIToFolder,
    UIToModuleCollection,
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


def generic_bulk_create(table, batch):
    return table.objects.bulk_create(batch, ignore_conflicts=True)


def generic_bulk_create_and_return(table, batch, properties):
    objs = generic_bulk_create(table, batch)
    obj_properties = zip(*[[getattr(obj, p) for p in properties] for obj in objs])
    obj_properties = list(obj_properties)
    kwargs = {f"{p}__in": obj_properties[i] for i, p in enumerate(properties)}
    return table.objects.filter(**kwargs)


def save_collection_rel(entity, list_of_collections, collection_type):
    if isinstance(entity, UI):
        rel_table = (
            UIToModuleCollection
            if collection_type == "modules"
            else UIToParameterCollection
        )
    elif isinstance(entity, Section):
        rel_table = (
            SectionToModuleCollection
            if collection_type == "modules"
            else SectionToParameterCollection
        )
    existing_rels = rel_table.objects.filter(entity=entity)
    for er in existing_rels:
        if er.parent not in list_of_collections:
            er.delete()
    for c in list_of_collections:
        generic_create(rel_table, {"entity": entity, "parent": c})


def save_module_collection(entity, available_modules):
    owner = entity.owner
    all_collections = []
    for module_collection_name, module_collection_info in available_modules.items():
        module_collection, _ = generic_create(
            ModuleCollection, {"name": module_collection_name, "owner": owner}
        )
        all_collections.append(module_collection)
        for module_name, module_info in module_collection_info["ModuleInfo"].items():
            package, _ = generic_create(
                Package, {"name": get_package_name(module_name), "owner": owner}
            )
            module, _ = generic_create(Module, {"name": module_name, "parent": package})
            module_to_module_collection = generic_create(
                ModuleToModuleCollection,
                {"entity": module, "parent": module_collection},
            )
            for object_name, object_info in module_info.items():
                obj, _ = generic_create(Object, {"name": object_name, "parent": module})
                for param_name, param_info in object_info.items():
                    generic_create(
                        Parameter, {"name": param_name, "parent_object": obj}
                    )
    save_collection_rel(entity, all_collections, "modules")


def save_parameter_collection(entity, available_parameters):
    owner = entity.owner
    all_collections = []
    for param_collection_name, param_collection_info in available_parameters.items():
        param_collection, _ = generic_create(
            ParameterCollection, {"name": param_collection_name, "owner": owner}
        )
        all_collections.append(param_collection)
        for param_name, param_info in param_collection_info["ParameterInfo"].items():
            generic_create(
                Parameter, {"name": param_name, "parent_collection": param_collection}
            )
    save_collection_rel(entity, all_collections, "parameters")


def save_section_selected_object(owner, section, section_info):
    selected_object = section_info.get("selected", {})
    if selected_object:
        module_name = selected_object["module"]
        package = Package.objects.get(owner=owner, name=get_package_name(module_name))
        module = Module.objects.get(name=module_name, parent=package)
        obj_name = selected_object["obj"]
        obj = Object.objects.get(name=obj_name, parent=module)
        section.selected_object = obj
    else:
        section.selected_object = None
    section.save()


def save_section_collection_rels(owner, section, section_info):
    for collection_type in ["modules", "parameters"]:
        available = section_info.get(collection_type, [])
        all_collections = []
        query_table = (
            ModuleCollection if collection_type == "modules" else ParameterCollection
        )
        for collection_name in available:
            all_collections.append(
                query_table.objects.get(name=collection_name, owner=owner)
            )
        save_collection_rel(section, all_collections, collection_type)


def get_object_from_str(section, x):
    x = parse_selection_history_string(x)
    section_to_module_collections = SectionToModuleCollection.objects.filter(
        entity=section
    )
    for stmc in section_to_module_collections:
        module_to_module_collection = try_get(
            ModuleToModuleCollection,
            {"entity__name": x["module"], "parent": stmc.parent},
        )
        if module_to_module_collection is not None:
            return Object.objects.get(
                name=x["obj"], parent=module_to_module_collection.entity
            )


def get_param_from_str(section, x):
    section_to_param_collections = SectionToParameterCollection.objects.filter(
        entity=section
    )
    for stpc in section_to_param_collections:
        param = try_get(Parameter, {"name": x, "parent_collection": stpc.parent})
        if param is not None:
            return param


def save_section_entered_values(
    name, owner, section, entered_values, param_ui_type_names, selection_history_str
):
    param_val_collection = section.entered_values
    if not param_val_collection:
        param_val_collection, _ = generic_create(
            ParameterValueCollection, {"name": name, "owner": owner}
        )
        section.entered_values = param_val_collection
        section.save()
    for module_obj_str, obj_value_dict in entered_values.items():
        if module_obj_str != "null":
            selected_object = get_object_from_str(section, module_obj_str)
        else:
            selected_object = None
        for name, param_dict in obj_value_dict.items():
            if len(param_dict) == 0:
                continue
            if selected_object:
                param = Parameter.objects.get(name=name, parent_object=selected_object)
            else:
                param = get_param_from_str(section, name)
            for ui_type_name, value in param_dict.items():
                ui_type, _ = generic_create(UIType, {"value": ui_type_name})

                ParameterValue.objects.filter(
                    parent=param, collection=param_val_collection
                ).update(is_current=False)

                param_val, _ = generic_create(
                    ParameterValue,
                    {
                        "parent": param,
                        "collection": param_val_collection,
                        "ui_type": ui_type,
                    },
                )
                param_val.is_current = (module_obj_str == selection_history_str) and (
                    ui_type_name == param_ui_type_names[name]
                )
                param_val.value = value
                param_val.save()


def save_section_all_entered_values(owner, section, section_info):
    entered_values = section_info["enteredValues"]
    name = section_info["name"]
    selection_history_str = make_selection_history_string(section_info["selected"])
    param_ui_type_names = section_info["paramUITypeNames"]
    save_section_entered_values(
        name, owner, section, entered_values, param_ui_type_names, selection_history_str
    )


def save_section(owner, section_info):
    section, _ = generic_create(Section, {"name": section_info["name"], "owner": owner})
    save_section_selected_object(owner, section, section_info)
    save_section_collection_rels(owner, section, section_info)
    save_section_all_entered_values(owner, section, section_info)
    return section


def get_children(sections, section_info):
    return {str(i): sections[str(i)] for i in section_info["childrenIds"]}


def save_sections(owner, sections, depth=0):
    all_root_sections = []
    for idx, section_info in sections.items():
        idx = int(idx)
        if section_info["depth"] == depth:
            section = save_section(owner, section_info)
            all_root_sections.append((idx, section))
            children = get_children(sections, section_info)
            save_sections(owner, children, depth + 1)
    return all_root_sections


def save_sections_to_ui_rel(ui, list_of_sections):
    for section in list_of_sections:
        generic_create(SectionToUI, {"entity": section, "parent": ui})


def save_section_positions(ui, list_of_sections):
    for idx, section in list_of_sections:
        sp = try_get(SectionPositions, {"ui": ui, "section": section})
        if sp is None:
            sp = SectionPositions.objects.create(ui=ui, section=section, position=idx)
        else:
            sp.position = idx
            sp.save()


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

    save_module_collection(ui, ui_info["availableModules"])
    save_parameter_collection(ui, ui_info["availableParameters"])

    list_of_root_sections = save_sections(owner, ui_info["sections"])
    save_sections_to_ui_rel(ui, [s for _, s in list_of_root_sections])
    save_section_positions(ui, list_of_root_sections)
    print("successs")
