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


def get_users_folders(user):
    return Folder.objects.filter(owner=user)


def save_module_collection(folder, ui, availableModules):
    for name, contents in availableModules.items():
        moduleCollection, _ = generic_create(
            ModuleCollection, {"folder": folder, "originUI": ui, "name": name}
        )
        for moduleName, moduleContents in contents["ModuleInfo"].items():
            module, _ = generic_create(
                Module,
                {
                    "folder": folder,
                    "originCollection": moduleCollection,
                    "name": moduleName,
                },
            )
            for objectName, v in moduleContents.items():
                generic_create(Object, {"belongsTo": module, "name": objectName})


def save_ui(request):
    user = request.user
    data = request.data

    uiInfo = data["ui"]
    folderInfo = data["folder"]
    folerName = folderInfo["name"]

    folder, _ = generic_create(Folder, {"owner": user, "name": folerName})

    uiName = uiInfo["name"]
    ui, _ = generic_create(UI, {"folder": folder, "name": uiName})

    save_module_collection(folder, ui, uiInfo["availableModules"])
    # availableParameters = uiInfo["availableParameters"]

    print("successs")
