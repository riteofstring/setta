from pydantic import BaseModel


class NewTerminalCreated(BaseModel):
    projectConfigId: str
    terminalId: str
