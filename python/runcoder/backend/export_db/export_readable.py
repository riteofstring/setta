import os
from collections import defaultdict
from pathlib import Path

import yaml
from yaml.representer import Representer

from runcoder.backend.db.projects.load import load_full_project
from runcoder.backend.db_path import DEFAULT_DB_ALIAS
from runcoder.utils.constants import C


def export_readable(dbs, filename, data):
    # export defaultdict the same way as dict
    yaml.add_representer(defaultdict, Representer.represent_dict)

    all_used_data = defaultdict(dict)
    full_projects = []
    for p in data["Project"]:
        full_project = load_full_project(dbs, p["name"], with_base_uitypes=False)
        full_projects.append(full_project)
        for c in full_project["configs"]:
            for k, v in c.items():
                all_used_data[k].update(v)

    root_folder = f"{filename}_export"
    os.makedirs(root_folder, exist_ok=True)

    for project in full_projects:
        export_project(root_folder, project)


def export_settings_table(folder, settings_table):
    sub_folder = Path(folder) / "settings"
    os.makedirs(sub_folder, exist_ok=True)
    for s in settings_table:
        profileName = s.pop("profileName")
        filepath = sub_folder / f"{profileName}.yaml"
        with open(filepath, "w") as file:
            yaml.dump(s, file, allow_unicode=True)


def export_project(folder, project):
    project_folder = Path(folder) / project["name"]
    os.makedirs(project_folder, exist_ok=True)
    for config in project["configs"]:
        export_config(project_folder, config)


def export_config(folder, config):
    config_folder = folder / config["projectConfig"]["name"]
    os.makedirs(config_folder, exist_ok=True)
    for k, v in config.items():
        if k == "sections":
            export_sections(config_folder, config, v)


def export_sections(folder, config, sections):
    for k, v in sections.items():
        if k in config["projectConfig"]["children"].keys():
            export_section(folder, config, v)


def export_section(folder, config, section):
    section_folder = folder / section["name"]
    os.makedirs(section_folder, exist_ok=True)
    for evColId in section["evColIds"]:
        export_evCol(
            section_folder,
            config,
            section["selectedItem"],
            config["evCols"][DEFAULT_DB_ALIAS][evColId],
        )

    if section["code"]:
        export_code(section_folder, section["code"], section["codeLanguage"])

    for c in section["children"]:
        export_section(section_folder, config, config["sections"][c])


def export_evCol(folder, config, selectedItem, evCol):
    filename = folder / evCol["name"]
    codeInfo = config["codeInfo"]
    output = defaultdict(dict)
    for codeInfoId, value in evCol["values"].items():
        parent = get_parameter_parent(codeInfoId, codeInfo)
        parentName = parent["name"] if parent else None
        output[parentName][codeInfo[codeInfoId]["name"]] = value

    if output:
        with open(f"{filename}.yaml", "w") as file:
            yaml.dump(output, file, allow_unicode=True)


def get_parameter_parent(id, codeInfo):
    for c in codeInfo.values():
        if id in c["children"] and c["rcType"] == C.CALLABLE:
            return c
    return None


def export_code(folder, code, codeLanguage):
    filename = folder / "code"
    extension = {"javascript": "js", "python": "py", "bash": "sh"}[codeLanguage]
    with open(f"{filename}.{extension}", "w") as file:
        file.write(code)
