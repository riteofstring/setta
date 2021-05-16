from django.db.models import Q

from .models import (
    UI,
    Folder,
    Module,
    ModuleCollection,
    Object,
    ParameterCollection,
    ParameterCollectionParameter,
)


def generic_create(table, kwargs):
    new, was_created = table.objects.get_or_create(**kwargs)
    return new, was_created


def generic_bulk_create(table, batch):
    return table.objects.bulk_create(batch)


def get_users_folders(user):
    return Folder.objects.filter(owner=user)


def save_module_collection(folder, ui, available_modules):
    for name, contents in available_modules.items():
        module_collection, _ = generic_create(
            ModuleCollection, {"folder": folder, "originUI": ui, "name": name}
        )
        for module_name, module_contents in contents["ModuleInfo"].items():
            module, _ = generic_create(
                Module,
                {
                    "folder": folder,
                    "originCollection": module_collection,
                    "name": module_name,
                },
            )
            module_objects = [
                Object(belongsTo=module, name=objectName)
                for objectName in module_contents.keys()
            ]
            # print(Object.objects.filter()
            module_objects = generic_bulk_create(Object, module_objects)
            print("module_objects", module_objects)


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
