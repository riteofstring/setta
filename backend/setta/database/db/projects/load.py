from setta.project_state.project_state import AllProjectStates


def load_all_project_states(db):
    query = """
        SELECT state 
        FROM AllProjectStates 
        WHERE id = 1
    """
    db.execute(query)
    row = db.fetchone()
    if not row or row[0] is None:
        return AllProjectStates()
    return AllProjectStates.model_validate_json(row[0])
