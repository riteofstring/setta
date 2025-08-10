from enum import Enum
from typing import Literal

from pydantic import BaseModel

from setta.code_gen.utils import GEN_CODE_CLASS_NAME


class GenCodeLanguage(str, Enum):
    python = "python"


class PythonGenCodeSpecs(BaseModel):
    type: Literal[GenCodeLanguage.python] = GenCodeLanguage.python
    prefix: str = ""
    suffix: str = f"s = {GEN_CODE_CLASS_NAME}()"
