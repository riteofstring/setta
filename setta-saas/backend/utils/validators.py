"""
Validation utilities for the application.
"""

import re


def validate_project_name(name: str) -> tuple[bool, str]:
    """
    Validate a project name.
    Returns (is_valid, error_message).
    """
    if not name or not name.strip():
        return False, "Project name cannot be empty"

    if len(name) > 100:
        return False, "Project name too long (max 100 characters)"

    if len(name) < 2:
        return False, "Project name too short (min 2 characters)"

    # Check for valid characters
    if not re.match(r"^[a-zA-Z0-9\s\-_]+$", name):
        return (
            False,
            "Project name can only contain letters, numbers, spaces, hyphens, and underscores",
        )

    return True, ""


def sanitize_app_name(name: str) -> str:
    """
    Sanitize a name to be valid for Fly.io app names.
    Fly.io app names must be lowercase, alphanumeric with dashes.
    """
    # Convert to lowercase
    name = name.lower()

    # Replace invalid characters with dashes
    name = re.sub(r"[^a-z0-9-]", "-", name)

    # Remove multiple consecutive dashes
    name = re.sub(r"-+", "-", name)

    # Remove leading/trailing dashes
    name = name.strip("-")

    # Ensure it starts with a letter
    if name and not name[0].isalpha():
        name = "app-" + name

    return name
