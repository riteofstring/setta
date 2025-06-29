"""
Authentication middleware for JWT verification.
"""

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import get_settings

# Security scheme
security = HTTPBearer(auto_error=False)


def decode_jwt(token: str) -> dict:
    """Decode and verify JWT token."""
    settings = get_settings()

    if not settings.clerk_jwt_public_key:
        print("Warning: CLERK_JWT_PUBLIC_KEY not set")
        return {}

    try:
        # Decode the JWT
        payload = jwt.decode(
            token,
            settings.clerk_jwt_public_key,
            algorithms=["RS256"],
            options={"verify_aud": False},  # Clerk doesn't always set audience
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        print(f"JWT decode error: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        print(f"Unexpected error decoding JWT: {e}")
        raise HTTPException(status_code=401, detail="Could not validate credentials")


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Get current user ID from JWT token (required)."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_jwt(credentials.credentials)

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user ID")

    return user_id


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> str | None:
    """Get current user ID from JWT token (optional)."""
    if not credentials:
        return None

    try:
        payload = decode_jwt(credentials.credentials)
        return payload.get("sub")
    except HTTPException:
        # If token is invalid, return None instead of raising
        return None
    except Exception as e:
        print(f"Error in get_current_user_optional: {e}")
        return None


def require_auth(request: Request):
    """Dependency to require authentication for routes."""
    auth_header = request.headers.get("Authorization")

    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = auth_header.split(" ")[1]
    payload = decode_jwt(token)

    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid token")

    return payload.get("sub")
