from pydantic import BaseModel, Field


class AppValidationIssue(BaseModel, extra="forbid"):
    message: str = Field(description="Human-readable validation message.")
    elementKey: str | None = Field(
        default=None,
        description="Optional UIElement key associated with this issue.",
    )
    elementType: str | None = Field(
        default=None,
        description="Optional component type associated with this issue.",
    )


class AppCapabilities(BaseModel, extra="forbid"):
    catalogId: str
    catalogVersion: str
    appSpecVersion: str
    themeSchemaVersion: str
    features: dict[str, bool] = Field(default_factory=dict)
