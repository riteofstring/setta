def load_run_groups(db, projectConfigId):
    query = """
        SELECT RunGroupId.id, RunGroupId.name, RunGroupId.selected, RunGroup.sectionId, RunGroup.paramSweepId
        FROM RunGroupId
        LEFT JOIN RunGroup
        ON RunGroupId.id = RunGroup.idid
        WHERE RunGroupId.projectConfigId = :projectConfigId
        ORDER BY RunGroupId."order"
    """
    db.execute(query, {"projectConfigId": projectConfigId})
    output = {}
    for row in db.fetchall():
        id = row["id"]
        if id not in output:
            output[id] = {
                "name": row["name"],
                "selected": row["selected"],
                "sections": {},
            }
        curr = output[id]["sections"]
        sectionId = row["sectionId"]
        paramSweepId = row["paramSweepId"]
        if sectionId is not None:
            if sectionId not in curr:
                curr[sectionId] = {}
            if paramSweepId:
                curr[sectionId][paramSweepId] = True
    return output
