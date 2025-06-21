from pydantic import BaseModel, Field


class BaseSectionImplModifier(BaseModel):
    pass


class SectionWithParamsModifier(BaseSectionImplModifier):
    codeObjImplLayeringMap: dict[str, str] = Field(default_factory=dict)
