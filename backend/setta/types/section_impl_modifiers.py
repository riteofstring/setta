from pydantic import BaseModel, Field


class SectionImplModifier(BaseModel):
    pass


class SectionWithParamsModifier(SectionImplModifier):
    codeObjImplLayeringMap: dict[str, str] = Field(default_factory=dict)
