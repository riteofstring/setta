from pydantic import BaseModel


class CodeObjImplModifier(BaseModel):
    pass


class ParamCodeObjModifier(CodeObjImplModifier):
    value: str = ""
