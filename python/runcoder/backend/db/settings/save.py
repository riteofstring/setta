def save_settings(db, settings):
    query = """
        INSERT OR REPLACE INTO Settings (profileName, darkMode)
        VALUES (:profileName, :darkMode)
    """
    db.executemany(query, settings)


def save_dark_mode(db, darkMode):
    query = """
        UPDATE Settings
        SET darkMode = :darkMode
        WHERE profileName = "default"
    """
    db.execute(query, {"darkMode": darkMode})
