def save_settings(dbs, settings):
    db = dbs.settings

    query = """
        INSERT INTO Settings (profileName)
        VALUES (:profileName)
        ON CONFLICT (profileName)
        DO NOTHING
    """
    db.executemany(query, settings)
