from pydantic import BaseModel


class BaseCodeObjImplModifier(BaseModel):
    pass


class ParamCodeObjModifier(BaseCodeObjImplModifier):
    value: str = ""
