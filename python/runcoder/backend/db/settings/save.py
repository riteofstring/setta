def save_settings(dbs, settings):
    db = dbs.settings

    query = """
        INSERT INTO Settings (profileName, darkMode)
        VALUES (:profileName, :darkMode)
        ON CONFLICT (profileName)
        DO UPDATE SET darkMode = :darkMode
    """
    db.executemany(query, settings)


def save_dark_mode(dbs, darkMode):
    db = dbs.settings

    query = """
        UPDATE Settings
        SET darkMode = :darkMode
        WHERE profileName = "default"
    """
    db.execute(query, {"darkMode": darkMode})
