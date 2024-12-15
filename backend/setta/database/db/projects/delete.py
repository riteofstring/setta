from setta.database.utils import uuid_str_to_blob

def delete_project_configs(db, ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        DELETE FROM ProjectConfig
        WHERE id IN ({placeholders});
    """
    db.execute(query, [uuid_str_to_blob(x) for x in ids])
