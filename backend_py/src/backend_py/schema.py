from datetime import datetime
from typing import Optional, List

from sqlalchemy import text
from sqlmodel import Field, SQLModel, create_engine, Relationship


class Session(SQLModel, table=True):
    id: str = Field(primary_key=True)
    sid: str = Field(unique=True)
    data: str
    expiresAt: datetime = Field(
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
        }
    )


class CodeInfo(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    editable: bool
    rcType: str
    defaultVal: str = Field(default=None)


class CodeInfoCol(SQLModel, table=True):
    parent_id: str = Field(foreign_key="codeinfo.id", primary_key=True)
    child_id: str = Field(foreign_key="codeinfo.id", primary_key=True)
    order: int


class User(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str = Field(unique=True)
    password: bytes
    salt: bytes
    darkMode: bool = Field(default=False)


class Section(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    paramInfoId: Optional[str] = Field(foreign_key="codeinfo.id")
    width: int
    height: int


class SectionChildren(SQLModel, table=True):
    parent_id: str = Field(foreign_key="section.id", primary_key=True)
    child_id: str = Field(foreign_key="section.id", primary_key=True)
    order: int


class EVColId(SQLModel, table=True):
    id: str = Field(primary_key=True)


class EVCol(SQLModel, table=True):
    id: str = Field(foreign_key="evcolid.id", primary_key=True)
    codeInfoId: str = Field(foreign_key="codeinfo.id", primary_key=True)
    value: str = Field(default=None)


class SectionConfigCollections(SQLModel, table=True):
    uiTypeId: str = Field(
        foreign_key="uitype.id", primary_key=True
    )
    codeInfoId: str = Field(
        foreign_key="codeinfo.id", primary_key=True
    )


class UIType(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    ownerId: str = Field(default=None, foreign_key="user.id")
    type: str
    presetType: str = Field(default=None)
    sectionConfigCollections: List["CodeInfo"] = Relationship(back_populates="codeinfo", link_model=SectionConfigCollections)
    sectionConfigSubType: str = Field(default=None)
    sectionConfigChildUITypeId: str = Field(default=None, foreign_key="uitype.id")


engine = create_engine("sqlite:///dev.db")
