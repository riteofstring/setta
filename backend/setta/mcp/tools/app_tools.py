from pydantic import BaseModel

from setta.app.catalog import APP_CATALOG, list_app_components as list_catalog_components
from setta.mcp.tool_setup import setta_tool
from setta.types.chat_messages import JSONValue


class AppCatalogResponse(BaseModel):
    catalog: JSONValue


class AppComponentList(BaseModel):
    components: list[str]


@setta_tool
def get_app_catalog() -> AppCatalogResponse:
    """Return the JSON render catalog used for app generation."""
    return AppCatalogResponse(catalog=APP_CATALOG)


@setta_tool
def list_app_components() -> AppComponentList:
    """List the allowed component types for app generation."""
    return AppComponentList(components=list_catalog_components())
