def delete_project_configs(db, ids):
    placeholders = ", ".join([f"CAST(? AS BLOB)"] * len(ids))
    query = f"""
        DELETE FROM ProjectConfig
        WHERE id IN ({placeholders});
    """
    db.execute(query, ids)
