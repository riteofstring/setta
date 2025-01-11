import black
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from pathlib import Path
import sys

from setta.code_gen.create_runnable_scripts import generate_final_code_for_sections, prune_and_topological_sort
from setta.code_gen.export_selected import (
    export_for_in_memory_fn,
    export_selected,
    get_section_code,
    get_section_type,
)
from setta.code_gen.find_placeholders import remove_tp, tp
from setta.tasks.fns.utils import replace_template_vars_with_random_names
from setta.utils.constants import C
from setta.utils.utils import multireplace

from .dependencies import get_tasks

router = APIRouter()


class UpdateInteractiveCodeRequest(BaseModel):
    project: dict


class FormatCodeRequest(BaseModel):
    project: dict
    candidateTemplateVars: dict

from pprint import pprint
@router.post(C.ROUTE_UPDATE_INTERACTIVE_CODE)
async def route_update_interactive_code(
    x: UpdateInteractiveCodeRequest, tasks=Depends(get_tasks)
):
    p = x.project
    exporter_obj = export_selected(
        p, always_export_args_objs=False, force_include_template_var=True
    )
    exporter_obj_in_memory = export_for_in_memory_fn(p)

    projectConfigName = x.project["projectConfig"]["name"]

    template_var_replacement_values = {}
    for variant in p["sectionVariants"]:
        for t in variant["templateVars"]:
            keyword = remove_tp(t["keyword"])
            template_var_replacement_values[keyword] = f"setta_in_memory_{projectConfigName}_{keyword}"


    code_dict = generate_final_code_for_sections(
        p,
        exporter_obj,
        None,
        do_prepend_with_setup_code=False,
        do_convert_var_names_to_readable_form=True,
        template_var_replacement_values=template_var_replacement_values
    )

    to_import, _ = prune_and_topological_sort(code_dict, p["importCodeBlocks"])
    code_list = []
    for section_id in to_import:
        v = code_dict[section_id]
        task_name = template_var_replacement_values[tp()]
        code_list.append(
            {
                "task_name": task_name,
                "code": v["code"],
                "module_name": task_name,
                "add_to_sys_modules": True,
            }
        )

    print([v["task_name"] for v in code_list])

    metadata, error_msgs, content = await tasks.add_custom_fns(
        code_list,
        task_metadata_fn=get_task_metadata_fn(exporter_obj_in_memory),
        to_cache=exporter_obj_in_memory,
    )

    print("error_msgs", error_msgs, flush=True)

    return {"metadata": metadata, "errorMsgs": error_msgs, "content": content}


@router.post(C.ROUTE_FORMAT_CODE)
async def route_format_code(x: FormatCodeRequest):
    p = x.project
    formattedCode = {}
    for id, s in p["sections"].items():
        if get_section_type(p, id) == C.CODE:
            if s["codeLanguage"] == "python":
                code = get_section_code(p, id)
                (
                    code,
                    _,
                    reverse_var_name_mapping,
                ) = replace_template_vars_with_random_names(
                    x.candidateTemplateVars[id], code
                )
                formattedCode[id] = multireplace(
                    format_python_code(code), reverse_var_name_mapping
                )

    return formattedCode


def format_python_code(code: str) -> str:
    try:
        return black.format_str(code, mode=black.Mode())
    except black.InvalidInput:
        pass


def get_task_metadata_fn(exporter_obj):
    def task_metadata_fn(task):
        # None means run the task on every change
        if task.dependencies is None:
            dependencies = None
        # Empty array means only run when the task imported.
        # Non-empty array means run when specified dependencies update.
        else:
            dependencies = [
                exporter_obj.var_name_reverse_mapping[d] for d in task.dependencies
            ]
        return {
            task.name: {
                "dependencies": dependencies,
            }
        }

    return task_metadata_fn
