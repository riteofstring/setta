from ...schema import db


def delete_projects(ids):
    with db:
        placeholders = ", ".join(["?"] * len(ids))
        query = f"""
            DELETE FROM Project
            WHERE id IN ({placeholders});
        """
        db.execute(query, ids)
