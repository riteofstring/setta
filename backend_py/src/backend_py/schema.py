from sqlmodel import SQLModel, Field, create_engine
from datetime import datetime
from pydantic.types import UUID4, Json
from sqlalchemy import Column, String, Boolean, DateTime, Integer, Float, LargeBinary, ForeignKey, text
from sqlalchemy.orm import relationship

class Session(SQLModel, table=True):
    id: str = Field(primary_key=True)
    sid: str = Field(unique=True)
    data: str
    expiresAt: datetime = Field(
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
        }
    )


engine = create_engine("sqlite:///dev.db")