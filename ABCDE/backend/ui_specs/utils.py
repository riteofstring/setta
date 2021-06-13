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
    Section,
    SectionToModuleCollection,
    SectionToParameterCollection,
    SectionToUI,
    UIToFolder,
    UIToModuleCollection,
    UIToParameterCollection,
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


def save_section_selected_object(section, selected_object):
    owner = section.owner
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


def save_section_collection_rels(section, section_info):
    owner = section.owner
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


def save_section(owner, section_info):
    section, _ = generic_create(Section, {"name": section_info["name"], "owner": owner})
    selected_object = section_info.get("selected", {})
    save_section_selected_object(section, selected_object)
    save_section_collection_rels(section, section_info)
    return section


def save_sections(owner, sections):
    all_sections = []
    for idx, section_info in sections.items():
        section = save_section(owner, section_info)
        all_sections.append(section)
    return all_sections


def save_sections_to_ui_rel(ui, list_of_sections):
    for section in list_of_sections:
        generic_create(SectionToUI, {"entity": section, "parent": ui})


def save_section_collection(
    folder,
    ui,
    sections,
    module_collections,
    parameter_collections,
    section_collection_name=None,
):
    name = section_collection_name if section_collection_name is not None else ui.name
    section_collection, _ = generic_create(
        SectionCollection, {"folder": folder, "originUI": ui, "name": name}
    )
    created_sections = [
        Section(originCollection=section_collection, name=se["name"])
        for se in sections.values()
    ]
    created_sections = generic_bulk_create_and_return(
        Section, created_sections, ["originCollection", "name"]
    )

    section_x_collections = {}

    for table, foreign_table, key, dict_key in [
        (SectionModuleCollection, module_collections, "availableModules", "modules"),
        (
            SectionParameterCollection,
            parameter_collections,
            "availableParameters",
            "parameters",
        ),
    ]:
        x = [
            table(
                **{
                    "originSection": created_sections.get(name=se["name"]),
                    key: foreign_table.get(name=collection_name),
                }
            )
            for se in sections.values()
            if se.get(dict_key, None)
            for collection_name in se[dict_key]
        ]

        section_x_collections[dict_key] = generic_bulk_create_and_return(
            table, x, ["originSection", key]
        )

    return section_collection, created_sections, section_x_collections


def save_ui_contents(
    ui, section_collections, module_collections, parameter_collections
):
    for table, collection, key in [
        (UISectionCollection, section_collections, "sections"),
        (UIModuleCollection, module_collections, "availableModules"),
        (UIParameterCollection, parameter_collections, "availableParameters"),
    ]:
        to_be_created = [table(**{"originUI": ui, key: c}) for c in collection]
        generic_bulk_create(table, to_be_created)


def save_selections(
    sections,
    created_sections,
    section_x_collections,
    module_collections,
    modules,
    module_objects,
):
    selected_objects = {}
    for se in sections.values():
        selected = se["selected"]
        selected_module = selected.get("module", None)
        if not selected_module:
            continue
        originSection = created_sections.get(name=se["name"])
        mc = module_collections.filter(
            id__in=section_x_collections["modules"]
            .filter(originSection=originSection)
            .values_list("availableModules", flat=True)
        )
        selected_module = modules.get(name=selected["module"], originCollection__in=mc)
        selected_object = module_objects.get(
            name=selected["obj"], belongsTo=selected_module
        )
        x_kwargs = {
            "name": se["name"],
            "originSection": originSection,
        }
        x = try_get(ModuleObjectSelection, x_kwargs)
        if x:
            x.selectedModule = selected_module
            x.selectedObject = selected_object
            x.save()
        else:
            x_kwargs["selectedModule"] = selected_module
            x_kwargs["selectedObject"] = selected_object
            generic_create(ModuleObjectSelection, x_kwargs)
        selected_objects[se["name"]] = selected_object
    return selected_objects


def save_entered_values(
    ui,
    folder,
    sections,
    created_sections,
    selected_objects,
    object_parameters,
    section_x_collections,
    parameter_collections,
    parameters,
):
    entered_value_collection, _ = generic_create(
        EnteredValueCollection, {"name": ui.name, "folder": folder, "originUI": ui}
    )
    for se in sections.values():
        entered_values = se["enteredValues"]
        if not entered_values:
            continue
        selected_object = selected_objects.get(se["name"], None)
        if not selected_object:
            originSection = created_sections.get(name=se["name"])
            pc = parameter_collections.filter(
                id__in=section_x_collections["parameters"]
                .filter(originSection=originSection)
                .values_list("availableParameters", flat=True)
            )
            to_be_created = [
                ParameterCollectionParameterEnteredValue(
                    originCollection=entered_value_collection,
                    parameter=parameters.get(name=param_name, belongsTo__in=pc),
                    value=param_value,
                )
                for param_name, param_value in entered_values.items()
            ]
            generic_bulk_create(ParameterCollectionParameterEnteredValue, to_be_created)

        else:
            to_be_created = [
                ObjectParameterEnteredValue(
                    originCollection=entered_value_collection,
                    parameter=object_parameters.get(
                        name=param_name, belongsTo=selected_object
                    ),
                    value=param_value,
                )
                for param_name, param_value in entered_values.items()
            ]
            generic_bulk_create(ObjectParameterEnteredValue, to_be_created)


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

    list_of_sections = save_sections(owner, ui_info["sections"])
    save_sections_to_ui_rel(ui, list_of_sections)

    # (
    #     section_collection,
    #     created_sections,
    #     section_x_collections,
    # ) = save_section_collection(
    #     folder, ui, ui_info["sections"], module_collections, parameter_collections
    # )

    # save_ui_contents(
    #     ui, [section_collection], module_collections, parameter_collections
    # )

    # selected_objects = save_selections(
    #     ui_info["sections"],
    #     created_sections,
    #     section_x_collections,
    #     module_collections,
    #     modules,
    #     module_objects,
    # )

    # save_entered_values(
    #     ui,
    #     folder,
    #     ui_info["sections"],
    #     created_sections,
    #     selected_objects,
    #     object_parameters,
    #     section_x_collections,
    #     parameter_collections,
    #     parameters,
    # )

    print("successs")
