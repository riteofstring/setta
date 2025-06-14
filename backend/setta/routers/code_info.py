import docstring_to_markdown
from fastapi import HTTPException
from pydantic import BaseModel

from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route

router = SettaAPIRouter()


class DocstringToMarkdownRequest(BaseModel):
    docstring: str


@router.post(Route.DOCSTRING_TO_MARKDOWN)
def route_docstring_to_markdown(x: DocstringToMarkdownRequest) -> str:
    try:
        return docstring_to_markdown.convert(x.docstring)
    except docstring_to_markdown.UnknownFormatError as e:
        raise HTTPException(status_code=400, detail=str(e))
