from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from setta.database.table_definitions import NotificationsTable
from setta.types.notifications import SettaNotification


def load_project_notifications(db: Session, project_config_id: str, limit=20):
    stmt = (
        select(NotificationsTable)
        .where(NotificationsTable.projectConfigId == project_config_id)
        .order_by(desc(NotificationsTable.id))
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


def load_notification(db: Session, notification_id: str):
    """
    Load a single notification by its ID.

    Args:
        db: The database connection/cursor object
        notification_id: The ID of the notification to retrieve

    Returns:
    - A notification object if found, None otherwise
    """
    query = """
        SELECT
            id,
            projectConfigId,
            timestamp,
            type,
            message,
            metadata,
            read_status
        FROM
            Notifications
        WHERE
            id = :notification_id
    """

    query_params = {"notification_id": notification_id}

    db.execute(query, query_params)
    row = db.fetchone()

    if not row:
        return None

    return SettaNotification(**row)
