from django.db.models import Q

from .models import (
    UI,
    Folder,
    Module,
    ModuleCollection,
    Object,
    ObjectParameter,
    ParameterCollection,
    ParameterCollectionParameter,
)


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

    module_objects = [
        Object(belongsTo=module, name=objectName)
        for mc in module_collections
        for module in modules.filter(originCollection=mc)
        for objectName in available_modules[mc.name]["ModuleInfo"][module.name].keys()
    ]

    # when ignore_conflicts is True, the returned objects don't have an id
    module_objects = generic_bulk_create_and_return(
        Object, module_objects, ["name", "belongsTo"]
    )

    object_parameters = [
        ObjectParameter(belongsTo=obj, name=p_name)
        for mc in module_collections
        for module in modules.filter(originCollection=mc)
        for obj in module_objects.filter(belongsTo=module)
        for p_name in available_modules[mc.name]["ModuleInfo"][module.name][
            obj.name
        ].keys()
    ]

    object_parameters = generic_bulk_create(ObjectParameter, object_parameters)


def save_ui(request):
    user = request.user
    data = request.data

    ui_info = data["ui"]
    folder_info = data["folder"]
    folder_name = folder_info["name"]

    folder, _ = generic_create(Folder, {"owner": user, "name": folder_name})

    ui_name = ui_info["name"]
    ui, _ = generic_create(UI, {"folder": folder, "name": ui_name})

    save_module_collection(folder, ui, ui_info["availableModules"])
    # availableParameters = ui_info["availableParameters"]

    print("successs")
