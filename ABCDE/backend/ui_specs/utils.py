from .models import (
    UI,
    Folder,
    Module,
    ModuleCollection,
    ModuleObjectSelection,
    Object,
    ObjectParameter,
    ParameterCollection,
    ParameterCollectionParameter,
    Section,
    SectionCollection,
    SectionModuleCollection,
    SectionParameterCollection,
    UIModuleCollection,
    UIParameterCollection,
    UISectionCollection,
)


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


def get_users_folders(user):
    return Folder.objects.filter(owner=user)


def save_module_collection(folder, ui, available_modules):
    module_collections = [
        ModuleCollection(folder=folder, originUI=ui, name=name)
        for name in available_modules.keys()
    ]
    module_collections = generic_bulk_create_and_return(
        ModuleCollection, module_collections, ["folder", "originUI", "name"]
    )

    modules = [
        Module(folder=folder, originCollection=mc, name=name)
        for mc in module_collections
        for name in available_modules[mc.name]["ModuleInfo"].keys()
    ]

    modules = generic_bulk_create_and_return(
        Module, modules, ["originCollection", "name"]
    )

    mcs_and_modules = [
        (mc, module)
        for mc in module_collections
        for module in modules.filter(originCollection=mc)
    ]

    module_objects = [
        Object(belongsTo=module, name=objectName)
        for (mc, module) in mcs_and_modules
        for objectName in available_modules[mc.name]["ModuleInfo"][module.name].keys()
    ]

    module_objects = generic_bulk_create_and_return(
        Object, module_objects, ["name", "belongsTo"]
    )

    object_parameters = [
        ObjectParameter(belongsTo=obj, name=p_name)
        for (mc, module) in mcs_and_modules
        for obj in module_objects.filter(belongsTo=module)
        for p_name in available_modules[mc.name]["ModuleInfo"][module.name][
            obj.name
        ].keys()
    ]

    object_parameters = generic_bulk_create(ObjectParameter, object_parameters)

    return module_collections, modules, module_objects


def save_parameter_collection(folder, ui, available_parameters):
    parameter_collections = [
        ParameterCollection(folder=folder, originUI=ui, name=name)
        for name in available_parameters.keys()
    ]
    parameter_collections = generic_bulk_create_and_return(
        ParameterCollection, parameter_collections, ["folder", "originUI", "name"]
    )

    parameters = [
        ParameterCollectionParameter(belongsTo=pc, name=name)
        for pc in parameter_collections
        for name in available_parameters[pc.name]["ParameterInfo"].keys()
    ]

    parameters = generic_bulk_create(ParameterCollectionParameter, parameters)

    return parameter_collections


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
        selectedModule = modules.get(name=selected["module"], originCollection__in=mc)
        selectedObject = module_objects.get(
            name=selected["obj"], belongsTo=selectedModule
        )
        x_kwargs = {
            "name": se["name"],
            "originSection": originSection,
        }
        x = try_get(ModuleObjectSelection, x_kwargs)
        if x:
            x.selectedModule = selectedModule
            x.selectedObject = selectedObject
            x.save()
        else:
            x_kwargs["selectedModule"] = selectedModule
            x_kwargs["selectedObject"] = selectedObject
            generic_create(ModuleObjectSelection, x_kwargs)


def save_ui(request):
    user = request.user
    data = request.data

    ui_info = data["ui"]
    folder_info = data["folder"]
    folder_name = folder_info["name"]

    folder, _ = generic_create(Folder, {"owner": user, "name": folder_name})

    ui_name = ui_info["name"]
    ui, _ = generic_create(UI, {"folder": folder, "name": ui_name})

    module_collections, modules, module_objects = save_module_collection(
        folder, ui, ui_info["availableModules"]
    )
    parameter_collections = save_parameter_collection(
        folder, ui, ui_info["availableParameters"]
    )
    (
        section_collection,
        created_sections,
        section_x_collections,
    ) = save_section_collection(
        folder, ui, ui_info["sections"], module_collections, parameter_collections
    )
    save_ui_contents(
        ui, [section_collection], module_collections, parameter_collections
    )
    save_selections(
        ui_info["sections"],
        created_sections,
        section_x_collections,
        module_collections,
        modules,
        module_objects,
    )

    print("successs")
