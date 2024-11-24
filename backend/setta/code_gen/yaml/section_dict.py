import yaml


def section_dict_to_yaml(exporter_obj, codeInfo, sectionVariant):
    pinned = exporter_obj["pinned"].prettyOutput
    unpinned = exporter_obj["unpinned"].prettyOutput
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


def param_sweep_dict_to_yaml(exporter_obj):
    return yaml.dump_all(exporter_obj.prettyOutput)


def run_group_dict_to_yaml(exporter_obj):
    return yaml.dump(exporter_obj.prettyOutput, Dumper=NoEmptyDictDumper)


class NoEmptyDictDumper(yaml.Dumper):
    pass

# Register representer for dict that skips empty ones
def represent_dict_skip_empty(dumper, data):
    if not data:  # if dictionary is empty
        return dumper.represent_scalar('tag:yaml.org,2002:null', '')
    return dumper.represent_dict(data)

NoEmptyDictDumper.add_representer(dict, represent_dict_skip_empty)