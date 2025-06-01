from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from setta.database.table_definitions import NotificationsTable
from setta.types.notifications import SettaNotification


def load_project_notifications(db: Session, project_config_id: str, limit=20):
    stmt = (
        select(NotificationsTable)
        .where(NotificationsTable.projectConfigId == project_config_id)
        .order_by(desc(NotificationsTable.id))
        .limit(limit)
    )
    results = db.scalars(stmt).all()

    notifications: list[SettaNotification] = []
    for row in results:
        notification = SettaNotification(
            id=row.id,
            projectConfigId=row.projectConfigId,
            timestamp=row.timestamp,
            type=row.type,
            message=row.message,
        )
        notifications.append(notification)

    return notifications
