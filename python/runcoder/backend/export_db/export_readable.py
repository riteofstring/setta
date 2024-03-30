import os
from pathlib import Path
from collections import defaultdict

import yaml

from runcoder.backend.db.projects.load import load_full_project
from runcoder.backend.db_path import DEFAULT_DB_ALIAS

from pprint import pprint

def export_readable(dbs, filename, data):
    all_used_data = defaultdict(dict)
    full_projects = []
    for p in data["Project"]:
        full_project = load_full_project(dbs, p["name"], with_base_uitypes=False)
        full_projects.append(full_project)
        for c in full_project["configs"]:
            for k,v in c.items():
                all_used_data[k].update(v)

    root_folder = f"{filename}_export"
    os.makedirs(root_folder, exist_ok=True)

    for project in full_projects:
        export_project(root_folder, project)


    # for k,v in data.items():
    #     if k == "Settings":
    #         export_settings_table(root_folder, v)
    #     elif k == "Project":
    #         export_projects(root_folder, v)
    #     elif k == "ProjectConfig":
    #         print(v)


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
    for k,v in config.items():
        if k == "sections":
            export_sections(config_folder, config, v)
 
def export_sections(folder, config, sections):
    for k,v in sections.items():
        if k in config["projectConfig"]["children"].keys():
            export_section(folder, config, v)

def export_section(folder, config, section):
    section_folder = folder / section["name"]
    os.makedirs(section_folder, exist_ok=True)
    for evColId in section["evColIds"]:
        export_evCol(section_folder, config, config["evCols"][DEFAULT_DB_ALIAS][evColId])

    for c in section["children"]:
        export_section(section_folder, config, config["sections"][c])
        


def export_evCol(folder, config, evCol):
    filename = folder / evCol["name"]
    codeInfo = config["codeInfo"]
    output = {}
    for codeInfoId, value in evCol["values"].items():
        output[codeInfo[codeInfoId]["name"]] = value

    with open(f"{filename}.yaml", "w") as file:
        yaml.dump(output, file, allow_unicode=True)
