import docstring_to_markdown
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from setta.utils.constants import C

router = APIRouter()


class DocstringToMarkdownRequest(BaseModel):
    docstring: str


@router.post(C.ROUTE_DOCSTRING_TO_MARKDOWN)
def route_docstring_to_markdown(x: DocstringToMarkdownRequest):
    try:
        return docstring_to_markdown.convert(x.docstring)
    except docstring_to_markdown.UnknownFormatError as e:
        raise HTTPException(status_code=400, detail=str(e))
