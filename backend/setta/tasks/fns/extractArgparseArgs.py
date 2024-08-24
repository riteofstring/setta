from setta.code_gen.python.extract_args_from_help import extract_args_from_help
from setta.tasks.task_runner import RunType

from .utils import TaskDefinition, TaskMessage


class ExtractArgparseArgsMessage(TaskMessage):
    content: str


def _extractArgparseArgs(message: ExtractArgparseArgsMessage):
    script_path = message.content
    output = extract_args_from_help(script_path)
    return {"output": output, "name": "extractArgparseArgs", "cache": None}


extractArgparseArgs = TaskDefinition(
    name="extractArgparseArgs",
    fn=_extractArgparseArgs,
    run_as=RunType.THREAD,
)
