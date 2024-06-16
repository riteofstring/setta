import subprocess

from runcoder.code_gen.export_selected import export_selected, get_code
from runcoder.code_gen.python.generate_code import generate_code
from runcoder.tasks.task_runner import RunType

from .utils import TaskDefinition, TaskMessage, withTempFiles


class TypeCheckRequestMessage(TaskMessage):
    content: dict


def _typeCheckRequest(message: TypeCheckRequestMessage):
    p = message.content
    exporter_obj = export_selected(p)
    code_json = exporter_obj.output
    print("typeCheckRequest", flush=True)
    try:
        templated_code = get_code(p)
        code, _ = generate_code(code_json, templated_code)
    except SyntaxError:
        print("typeCheckRequest SyntaxError", flush=True)
        return {"output": {}, "name": "typeCheck", "cache": None}

    def fn(temp_file_paths):
        return subprocess.run(
            ["dmypy", "check", temp_file_paths[0]],
            capture_output=True,
            text=True,
            check=True,
        )

    process = withTempFiles(write=[code], in_file_with_suffix=[".py"], then_do=fn)
    stdout = process.stdout

    print("stdout", stdout, flush=True)
    errors = stdout
    output = parse_and_type_check(errors, code, code_json)
    print(output, flush=True)
    return {"output": output, "name": "typeCheck", "cache": None}


typeCheckRequest = TaskDefinition(
    name="typeCheckRequest",
    fn=_typeCheckRequest,
    run_as=RunType.THREAD,
    is_built_in=True,
)
