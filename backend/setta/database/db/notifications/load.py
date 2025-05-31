from setta.database.db_objs import DB
from setta.types.notifications import SettaNotification


def load_project_notifications(db: DB, project_config_id: str, limit=20):
    """
    Load the latest notifications for a specific project.

    Args:
        db: The database connection/cursor object
        project_config_id: The ID of the project to get notifications for
        limit: Maximum number of notifications to return (default: 20)

    Returns:
        A list of notification objects
    """
    query = """
        SELECT
            id,
            timestamp,
            type,
            message,
            metadata,
            read_status
        FROM
            Notifications
        WHERE
            projectConfigId = :project_config_id
        ORDER BY
            id DESC
        LIMIT :limit
    """

    query_params = {"project_config_id": project_config_id, "limit": limit}

    db.execute(query, query_params)

    notifications: list[SettaNotification] = []
    for row in db.fetchall():
        notification = SettaNotification(**row)
        notifications.append(notification)

    return notifications


def load_notification(db: DB, notification_id: str):
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
