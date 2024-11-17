import yaml


def section_dict_to_yaml(pinned, unpinned, codeInfo, sectionVariant):
    pinnedStr = yaml.dump(pinned)
    unpinnedStr = yaml.dump(unpinned)

    yamlValue = ""
    if sectionVariant["selectedItem"]:
        selectedItemName = codeInfo[sectionVariant["selectedItem"]]["name"]
        yamlValue += f"{selectedItemName}\n---\n"

    if len(pinned) > 0:
        yamlValue += f"{pinnedStr}\n---\n"
    elif yamlValue != "":
        yamlValue += "\n---\n"
    if len(unpinned) > 0:
        yamlValue += unpinnedStr

    return yamlValue
