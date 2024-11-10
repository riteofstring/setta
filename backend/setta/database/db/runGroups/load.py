import json


def load_run_groups(db, projectConfigId):
    query = """
        SELECT ProjectConfigRunGroup.selected, RunGroup.id, RunGroup.jsonRepr
        FROM ProjectConfigRunGroup
        LEFT JOIN RunGroup
        ON ProjectConfigRunGroup.runGroupId = RunGroup.id
        WHERE ProjectConfigRunGroup.projectConfigId = :projectConfigId
        ORDER BY ProjectConfigRunGroup."order"
    """
    db.execute(query, {"projectConfigId": projectConfigId})
    runGroups = {}
    selected = {}
    for row in db.fetchall():
        runGroups[row["id"]] = json.loads(row["jsonRepr"])
        selected[row["id"]] = row["selected"]

    return runGroups, selected
