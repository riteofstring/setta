def convert_to_file_menu_format(projects, project_id):
    data = []
    for p in projects:
        if not project_id:
            data.append({**p, "selectable": False, "depth": 0})
            for c in p["configs"]:
                data.append(
                    {**c, "projectName": p["name"], "selectable": True, "depth": 1}
                )
        elif project_id == p["id"]:
            for c in p["configs"]:
                data.append(
                    {**c, "projectName": p["name"], "selectable": True, "depth": 0}
                )
    return data
