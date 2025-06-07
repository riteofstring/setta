"""
HTTP client for Fly.io API.
"""

from typing import Any

import httpx


class FlyError(Exception):
    """Base exception for Fly.io errors."""

    pass


class FlyAuthError(FlyError):
    """Authentication error."""

    pass


class FlyNotFoundError(FlyError):
    """Resource not found error."""

    pass


class FlyClient:
    """HTTP client for Fly.io GraphQL and Machines API."""

    def __init__(self, api_token: str, api_url: str, machines_url: str):
        self.api_token = api_token
        self.api_url = api_url
        self.machines_url = machines_url
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }

    async def graphql(self, query: str, variables: dict[str, Any] | None = None) -> dict:
        """Execute a GraphQL query."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.api_url,
                json={"query": query, "variables": variables or {}},
                headers=self.headers,
            )

            if response.status_code == 401:
                raise FlyAuthError("Invalid Fly.io API token")

            result = response.json()

            if errors := result.get("errors"):
                error_msg = errors[0].get("message", "Unknown error")
                raise FlyError(f"GraphQL error: {error_msg}")

            return result.get("data", {})

    async def machines_request(self, method: str, path: str, json: dict | None = None) -> dict:
        """Make a request to the Machines API."""
        url = f"{self.machines_url}/{path}"

        async with httpx.AsyncClient() as client:
            response = await client.request(
                method=method,
                url=url,
                headers=self.headers,
                json=json,
            )

            if response.status_code == 401:
                raise FlyAuthError("Invalid Fly.io API token")
            elif response.status_code == 404:
                raise FlyNotFoundError(f"Resource not found: {path}")
            elif response.status_code >= 400:
                raise FlyError(f"Machines API error: {response.text}")

            return response.json() if response.text else {}
