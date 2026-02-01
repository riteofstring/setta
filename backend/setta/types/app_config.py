from pydantic import BaseModel, Field

from setta.types.chat_messages import JSONValue


class AppRoute(BaseModel, extra="forbid"):
    path: str
    name: str | None = None
    rootKey: str | None = None


class AppConfig(BaseModel, extra="forbid"):
    appSpecVersion: str = "v1"
    catalogId: str = "setta.app.default"
    appSpecPath: str | None = None
    routes: list[AppRoute] = Field(default_factory=list)
    dataBindings: dict[str, JSONValue] = Field(default_factory=dict)
    actions: dict[str, JSONValue] = Field(default_factory=dict)
    theme: dict[str, JSONValue] | None = None
    assets: list[JSONValue] = Field(default_factory=list)
