def load_settings(db):
    query = """
        SELECT *
        FROM Settings
        WHERE profileName = "default"
    """
    db.execute(query)
    output = dict(db.fetchone())
    output.pop("profileName")
    return output
