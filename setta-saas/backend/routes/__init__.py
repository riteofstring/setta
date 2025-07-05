"""
Routes package for the application.
"""

from .storage_routes import router as storage_router

__all__ = ["storage_router"]
