from sqlalchemy import delete
from sqlalchemy.orm import Session

from setta.database.table_definitions import NotificationsTable


def delete_notification(db: Session, notification_id: str) -> bool:
    stmt = delete(NotificationsTable).where(NotificationsTable.id == notification_id)
    result = db.execute(stmt)
    return result.rowcount > 0
