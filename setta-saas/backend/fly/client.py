"""
HTTP client wrapper for Fly.io GraphQL API.
Handles all GraphQL communication with proper error handling.
"""

from typing import Any

import httpx

from ..config import get_settings


class FlyAPIError(Exception):
    """Base exception for Fly.io API errors."""

    pass


class FlyAuthError(FlyAPIError):
    """Raised when authentication fails."""

    pass


class FlyNotFoundError(FlyAPIError):
    """Raised when a resource is not found."""

    pass


class FlyClient:
    """HTTP client for Fly.io GraphQL API interactions."""

    def __init__(self):
        settings = get_settings()
        self.api_token = settings.fly_api_token
        self.graphql_url = settings.fly_api_url

        if not self.api_token:
            raise FlyAuthError("FLY_API_TOKEN not configured")

        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

    def graphql(self, query: str, variables: dict[str, Any] | None = None) -> dict:
        """Execute a GraphQL query."""
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        with httpx.Client() as client:
            response = client.post(
                self.graphql_url, json=payload, headers=self.headers, timeout=30.0
            )

            if response.status_code == 401:
                raise FlyAuthError("Invalid API token")

            data = response.json()

            if "errors" in data:
                error_msg = data["errors"][0].get("message", "Unknown error")
                raise FlyAPIError(f"GraphQL error: {error_msg}")

            return data.get("data", {})
