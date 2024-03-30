import os
import yaml
from pathlib import Path

def export_readable(filename, data):
    root_folder = f"{filename}_export"
    os.makedirs(root_folder, exist_ok=True)

    for k,v in data.items():
        if k == "Settings":
            export_settings_table(root_folder, v)
        elif k == "Project":
            export_projects(root_folder, v)
        elif k == "ProjectConfig":
            print(v)


def export_settings_table(folder, settings_table):
    sub_folder = Path(folder) / "settings"
    os.makedirs(sub_folder, exist_ok=True)
    for s in settings_table:
        profileName = s.pop("profileName")
        filepath = sub_folder / f"{profileName}.yaml"
        with open(filepath, "w") as file:
            yaml.dump(s, file, allow_unicode=True)


def export_projects(folder, projects_table):
    for p in projects_table:
        sub_folder = Path(folder) / p["name"]
        os.makedirs(sub_folder, exist_ok=True)