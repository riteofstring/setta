from sqlalchemy import update
from sqlalchemy.orm import Session

from setta.database.table_definitions import ProjectStateTable
from setta.types.project_state import ProjectState


def save_project_state(db: Session, state: ProjectState):
    json_data = state.model_dump()
    stmt = (
        update(ProjectStateTable)
        .where(ProjectStateTable.id == 1)
        .values(state=json_data)
    )
    db.execute(stmt)
