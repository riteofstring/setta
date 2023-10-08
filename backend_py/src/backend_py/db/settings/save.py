from ...schema import db


def save_settings(settings):
    with db:
        query = """
            INSERT OR REPLACE INTO Settings (profileName, darkMode)
            VALUES (:profileName, :darkMode)
        """
        db.executemany(query, settings)


def save_dark_mode(darkMode):
    with db:
        query = """
            UPDATE Settings
            SET darkMode = :darkMode
            WHERE profileName = "default"
        """
        db.execute(query, {"darkMode": darkMode})
