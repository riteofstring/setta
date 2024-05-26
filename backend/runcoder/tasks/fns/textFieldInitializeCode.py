import json

from runcoder.code_gen.export_selected import export_selected, get_code
from runcoder.code_gen.python.generate_code import (
    generate_lines_of_code_without_imports,
)


def textFieldInitializeCode(message):
    message = message["message"]
    project = message["project"]
    exporter_obj = export_selected(project)
    codeJson = exporter_obj.output
    templatedCode = get_code(project)
    sectionId = message["sectionId"]
    paramInfoId = message["paramInfoId"]
    push_var_name = exporter_obj.var_name_mapping[(sectionId, paramInfoId, False)]
    lines, var_name_to_line_num = generate_lines_of_code_without_imports(
        codeJson,
        push_var_name=push_var_name,
        force_appear_var_name=push_var_name,
    )
    infoToFullName = {
        tuple(json.loads(k)): v for k, v in project["infoToFullName"].items()
    }
    pushed_var_name_line_num = var_name_to_line_num[push_var_name]
    referencable_var_names = [
        infoToFullName[exporter_obj.var_name_reverse_mapping[v]]
        for v, line_num in var_name_to_line_num.items()
        if line_num < pushed_var_name_line_num
    ]
    print("textFieldInitializeCode", flush=True)
    print(referencable_var_names, flush=True)
    return {
        "output": None,
        "name": "textFieldInitializeCode",
        "cache": [
            lines,
            var_name_to_line_num,
            referencable_var_names,
            templatedCode,
            exporter_obj,
        ],
    }
