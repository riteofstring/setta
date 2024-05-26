from runcoder.code_gen.python.extract_args_from_help import extract_args_from_help

from .utils import TaskDefinition


def _extractArgparseArgs(message):
    script_path = message["message"]
    output = extract_args_from_help(script_path)
    return {"output": output, "name": "extractArgparseArgs", "cache": None}


extractArgparseArgs = TaskDefinition(
    name="extractArgparseArgs",
    fn=_extractArgparseArgs,
    as_subprocess=True,
    is_built_in=True,
)
