def save_as_existing_project_config(db, project, config_name):
    query = """
        SELECT *
        FROM ProjectConfig
        WHERE name = :config_name
    """

    db.execute(query, {"config_name": config_name})
    x = db.fetchone()
    project["projectConfig"] = {
        **project["projectConfig"],
        "id": x["id"],
        "name": x["name"],
    }
    project_to_save = copy_project_details(project)
    save_project_details(db, project_to_save)
    return project_to_save
