def delete_projects(dbs, ids):
    db = dbs.default
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        DELETE FROM ProjectConfig
        WHERE id IN ({placeholders});
    """
    db.execute(query, ids)
