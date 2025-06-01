import json

from sqlalchemy.orm import Session

from setta.types.notifications import SettaNotification


def save_notification(
    db: Session, project_config_id: str, notification: SettaNotification
):
    """
    Save a new notification to the database.

    Args:
        db: The database connection/cursor object
        project_config_id: The ID of the project associated with this notification
        type: The notification type (e.g., 'error', 'warning', 'info', 'success')
        message: The notification message text
        metadata: Optional JSON-serializable dict with additional data

    Returns:
        The ID of the newly created notification
    """
    query = """
        INSERT INTO Notifications (
            projectConfigId,
            type,
            message,
            metadata
        ) VALUES (
            :project_config_id,
            :type,
            :message,
            :metadata
        )
        RETURNING id
    """

    # Convert metadata to JSON string if provided
    metadata_json = json.dumps(metadata) if metadata is not None else None

    query_params = {
        "project_config_id": project_config_id,
        "type": type,
        "message": message,
        "metadata": metadata_json,
    }

    db.execute(query, query_params)

    # Get the ID of the inserted notification
    result = db.fetchone()
    notification_id = result["id"] if result else None

    return notification_id
