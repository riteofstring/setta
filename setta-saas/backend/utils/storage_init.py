"""
Storage initialization helper
"""

from config import get_settings
from services import storage_service


def init_storage():
    """Initialize storage on startup"""
    settings = get_settings()

    # Skip if storage not configured
    if not settings.storage_access_key or not settings.storage_secret_key:
        print("Storage not configured, skipping initialization")
        return

    # Create bucket if it doesn't exist
    try:
        storage_service.create_bucket()
        print("Storage initialized successfully")
    except Exception as e:
        print(f"Storage initialization warning: {e}")
        # Don't fail startup if storage init fails
