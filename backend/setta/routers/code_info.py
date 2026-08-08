import docstring_to_markdown
from fastapi import Depends, HTTPException
from pydantic import BaseModel

from setta.routers.dependencies import require_ide_mode
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route

router = SettaAPIRouter(dependencies=[Depends(require_ide_mode)])


class DocstringToMarkdownRequest(BaseModel):
    docstring: str


@router.post(Route.DOCSTRING_TO_MARKDOWN)
def route_docstring_to_markdown(x: DocstringToMarkdownRequest) -> str:
    try:
        return docstring_to_markdown.convert(x.docstring)
    except docstring_to_markdown.UnknownFormatError as e:
        raise HTTPException(status_code=400, detail=str(e))
