from typing import Literal

from pydantic import BaseModel


class ServerModeResponse(BaseModel, extra="forbid"):
    mode: Literal["ide", "share", "app", "launcher"]
