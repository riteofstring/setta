def delete_projects(db, ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        DELETE FROM Project
        WHERE id IN ({placeholders});
    """
    db.execute(query, ids)
