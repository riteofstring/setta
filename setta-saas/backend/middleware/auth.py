"""
Authentication middleware for Clerk integration.
Handles JWT verification and user extraction.
"""

from functools import lru_cache

import httpx
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer

from config import get_settings

# Security scheme for FastAPI docs
security = HTTPBearer()


class AuthError(HTTPException):
    """Custom auth exception for cleaner error handling."""

    def __init__(self, detail: str):
        super().__init__(status_code=401, detail=detail)


@lru_cache
def get_clerk_public_key() -> str:
    """Get Clerk public key from settings."""
    settings = get_settings()
    key = settings.clerk_jwt_public_key

    if not key:
        raise ValueError("CLERK_JWT_PUBLIC_KEY not configured")

    return key


def extract_token(request: Request) -> str:
    """Extract Bearer token from request headers."""
    auth_header = request.headers.get("Authorization", "")

    if not auth_header:
        raise AuthError("Missing authorization header")

    if not auth_header.startswith("Bearer "):
        raise AuthError("Invalid authorization header format")

    token = auth_header.replace("Bearer ", "")
    if not token:
        raise AuthError("Empty token")

    return token


def verify_jwt_token(token: str) -> dict:
    """Verify JWT token and return payload."""
    try:
        public_key = get_clerk_public_key()
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False},  # Clerk doesn't always set audience
        )
        return payload

    except jwt.InvalidTokenError as e:
        raise AuthError(f"Invalid token: {str(e)}")
    except Exception as e:
        raise AuthError(f"Token verification failed: {str(e)}")


async def verify_with_clerk_api(token: str) -> str:
    """Fallback: Verify token with Clerk API if JWT verification fails."""
    settings = get_settings()

    if not settings.clerk_api_key:
        raise AuthError("Clerk API key not configured")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                "https://api.clerk.com/v1/sessions/verify",
                headers={
                    "Authorization": f"Bearer {settings.clerk_api_key}",
                    "Content-Type": "application/json",
                },
                params={"token": token},
                timeout=5.0,
            )

            if response.status_code != 200:
                raise AuthError("Invalid session")

            data = response.json()
            return data.get("user_id")

        except httpx.RequestError:
            raise AuthError("Could not verify token with Clerk")


async def get_current_user_id(request: Request) -> str:
    """Get current user ID from request token."""
    token = extract_token(request)

    # Try local JWT verification first (faster)
    try:
        payload = verify_jwt_token(token)
        user_id = payload.get("sub")

        if not user_id:
            raise AuthError("No user ID in token")

        return user_id

    except AuthError:
        # If local verification fails, try Clerk API
        # This handles cases where JWT might be in different format
        return await verify_with_clerk_api(token)


# Dependency for FastAPI routes
CurrentUser = Depends(get_current_user_id)


# Optional: Get full user data if needed
async def get_current_user_data(user_id: str = CurrentUser) -> dict:
    """Get full user data from Clerk API."""
    settings = get_settings()

    if not settings.clerk_api_key:
        return {"id": user_id}  # Return minimal data if no API key

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"https://api.clerk.com/v1/users/{user_id}",
                headers={
                    "Authorization": f"Bearer {settings.clerk_api_key}",
                },
                timeout=5.0,
            )

            if response.status_code == 200:
                return response.json()

            return {"id": user_id}

        except httpx.RequestError:
            return {"id": user_id}


# Dependency for getting full user data
CurrentUserData = Depends(get_current_user_data)
