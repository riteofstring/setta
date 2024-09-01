from typing import Dict

import yaml
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.code_gen.export_selected import (
    get_section_type,
    get_selected_section_variant,
    simple_export_selected,
)
from setta.utils.constants import C

from .dependencies import get_tasks

router = APIRouter()


class UpdateInteractiveCodeRequest(BaseModel):
    project: dict


@router.post(C.ROUTE_UPDATE_INTERACTIVE_CODE)
def route_update_interactive_code(
    x: UpdateInteractiveCodeRequest, tasks=Depends(get_tasks)
):
    p = x.project
    exporter_obj = simple_export_selected(p)
    print(yaml.safe_dump(exporter_obj.output), flush=True)

    codeDict = {}
    for id in p["sections"].keys():
        if get_section_type(p, id) == C.INTERACTIVE_CODE:
            codeDict[id] = get_selected_section_variant(p, id)["code"]

    projectConfigName = x.project["projectConfig"]["name"]
    task_names, error_msgs = tasks.add_custom_fns(codeDict, projectConfigName)
    return {"taskNames": task_names, "errorMsgs": error_msgs}
