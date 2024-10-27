import json


def save_run_groups(db, project_config, run_groups):
    query = """
        INSERT INTO RunGroup (id, jsonRepr)
        VALUES (:id, :jsonRepr)
        ON CONFLICT (id)
        DO UPDATE SET jsonRepr = :jsonRepr
    """

    query_params = []
    for id, r in run_groups.items():
        query_params.append({"id": id, "jsonRepr": json.dumps(r)})
    db.executemany(query, query_params)

    query = f"""
        DELETE FROM ProjectConfigRunGroup
        WHERE projectConfigId = :projectConfigId
    """
    db.execute(query, {"projectConfigId": project_config["id"]})

    query = """
        INSERT INTO ProjectConfigRunGroup (projectConfigId, runGroupId, selected, "order")
        VALUES (:projectConfigId, :runGroupId, :selected, :order)
    """

    query_params = []
    for order, (id, selected) in enumerate(project_config["runGroupSelection"].items()):
        query_params.append(
            {
                "projectConfigId": project_config["id"],
                "runGroupId": id,
                "selected": selected,
                "order": order,
            }
        )
    db.executemany(query, query_params)

    query = """
        UPDATE ProjectConfig 
        SET shownRunGroup = :shownRunGroup
        WHERE id = :id
    """

    query_params = {
        "id": project_config["id"],
        "shownRunGroup": project_config["shownRunGroup"],
    }
    db.execute(query, query_params)
