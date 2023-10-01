from ...schema import db


def save_project_details(p):
    save_project(p)
    save_project_configs(p["id"], p["configs"])
    update_default_project_config(p)


def save_project(project):
    with db:
        query = """
            INSERT INTO Project (id, name)
            VALUES (:id, :name)
            ON CONFLICT(id)
            DO UPDATE SET name = excluded.name;
        """

        query_params = {"id": project["id"], "name": project["name"]}
        db.execute(query, query_params)


def save_project_configs(projectId, configs):
    print()
    with db:
        query = """
            INSERT INTO ProjectConfig (id, name, projectId)
            VALUES (:id, :name, :projectId)
            ON CONFLICT(id)
            DO UPDATE SET name = excluded.name
        """

        query_params = []
        for c in configs:
            c = c["projectConfig"]
            query_params.append(
                {"id": c["id"], "name": c["name"], "projectId": projectId}
            )
        db.executemany(query, query_params)


def update_default_project_config(p):
    with db:
        query = """
            UPDATE Project
            SET defaultConfigId = :defaultConfigId
            WHERE ID = :id
        """

        query_params = {"id": p["id"], "defaultConfigId": p["defaultConfigId"]}
        db.execute(query, query_params)
