from .models import Folders, ModuleCollections, Modules, ParameterCollections, UIs


def create_folder(user, name):
    new, was_created = Folders.objects.get_or_create(owner=user, name=name)
    return new, was_created


def create_module_collection(user, folder, name):
    new, was_created = ModuleCollections.objects.get_or_create(folder=folder, name=name)
    return new, was_created


def create_parameter_collection(user, folder, name):
    new, was_created = ParameterCollections.objects.get_or_create(
        folder=folder, name=name
    )
    return new, was_created


def get_users_folders(user):
    return Folders.objects.filter(owner=user)


def save_ui(request):
    user = request.user
    data = request.data

    uiInfo = data["ui"]
    folderInfo = data["folder"]

    folder, _ = create_folder(user, folderInfo["name"])

    uiName = uiInfo["name"]
    availableModules = uiInfo["availableModules"]
    availableParameters = uiInfo["availableParameters"]

    for k, v in availableModules.items():
        create_module_collection(user, folder, k)

    for k, v in availableParameters.items():
        create_parameter_collection(user, folder, k)

    print("successs")
