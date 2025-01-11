from typing import Dict

from setta.cli.logger import default_section_type
from setta.database.utils import create_new_id

from . import fns
from .fns.utils import TaskDefinition, TaskMessage
from .task_runner import RunType, TaskRunner
from .utils import SettaInMemoryFnSubprocess, add_fns_from_module


class Tasks:
    def __init__(self, lsp_writers):
        self.lsp_writers = lsp_writers
        self.task_runner = TaskRunner()
        self.cache = {}
        self.fns: Dict[str, TaskDefinition] = {}
        self.in_memory_subprocess = SettaInMemoryFnSubprocess()
        add_fns_from_module(self.fns, fns)

    async def __call__(self, fn_name, message: TaskMessage):
        if fn_name in self.fns:
            return await self.call_regular_fn(fn_name, message)
        return await self.call_in_memory_subprocess_fn(fn_name, message)

    async def call_regular_fn(self, fn_name, message: TaskMessage):
        fn = self.fns[fn_name]
        fn.read_cache(self.cache, message)
        fn_args = [message, *(getattr(self, k) for k in fn.server_dependencies)]
        result = await self.task_runner.run(fn.fn, fn_args, fn.run_as)
        fn.write_cache(self.cache, message, result)
        if result is None:
            result = {}
        result["messageType"] = fn.return_message_type
        return result

    async def call_in_memory_subprocess_fn(self, fn_name, message: TaskMessage):
        self.in_memory_subprocess.parent_conn.send(
            {"type": "call", "fn_name": fn_name, "message": message}
        )
        result = await self.task_runner.run(
            self.in_memory_subprocess.parent_conn.recv, [], RunType.THREAD
        )
        print("result", result, flush=True)
        if result["status"] == "success":
            for x in result["content"]:
                x.setdefault("sectionType", default_section_type(x["type"]))
        else:
            result["content"] = {}

        return {"content": result["content"], "messageType": result["messageType"]}

    async def add_custom_fns(self, code_list, to_cache):
        error_msgs = {}
        task_metadata = {}
        initial_content = []
        for c in code_list:
            # Send import request to subprocess
            self.in_memory_subprocess.parent_conn.send(
                {
                    "type": "import",
                    "code": c["code"],
                    "module_name": c["module_name"],
                    "to_cache": to_cache,
                }
            )
            result = await self.task_runner.run(
                self.in_memory_subprocess.parent_conn.recv, [], RunType.THREAD
            )
            if result["status"] == "success":
                task_metadata.update(result["content"])
            else:
                error_msgs[c["module_name"]] = result["error"]

        for k in task_metadata.keys():
            task_output = await self(k, TaskMessage(id=create_new_id(), content={}))
            initial_content.extend(task_output["content"])

        return task_metadata, error_msgs, initial_content
