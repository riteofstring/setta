from pydantic import BaseModel


class SimplifiedSection(BaseModel):
    name: str


#       name: s.name,
#       type: getSectionType(s.id, state),
#       codeInfo: getSectionCurrentCodeInfoMcp({ sectionId: s.id }),
#       position: { x, y },
#       size: { width, height },


class SimplifiedCodeInfo(BaseModel):
    name: str
    editable: bool
    defaultVal: str = ""
    description: str = ""
