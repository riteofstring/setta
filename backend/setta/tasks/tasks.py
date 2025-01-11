import json
from typing import Dict

from setta.cli.logger import default_section_type
from setta.database.utils import create_new_id
from setta.utils.utils import nested_access

from . import fns
from .fns.utils import SettaInMemoryFn, TaskDefinition, TaskMessage
from .task_runner import RunType, TaskRunner
from .utils import import_code_from_string


class Tasks:
    def __init__(self, lsp_writers):
        self.lsp_writers = lsp_writers
        self.task_runner = TaskRunner()
        self.cache = {}
        self.fns: Dict[str, TaskDefinition] = {}
        self.custom_fn_cache = {}
        self.add_fns_from_module(fns)

    async def __call__(self, fn_name, message: TaskMessage):
        print(f"Start processing message ID: {message.id}", flush=True)
        fn = self.fns[fn_name]
        message = self.process_message(fn, fn_name, message)
        fn.read_cache(self.cache, message)
        fn_args = [message, *(getattr(self, k) for k in fn.server_dependencies)]
        result = await self.task_runner.run(fn.fn, fn_args, fn.run_as)
        fn.write_cache(self.cache, message, result)
        result = self.process_output(fn, result)
        result["messageType"] = fn.return_message_type
        return result

    def add_fn(self, task_def: TaskDefinition):
        self.fns[task_def.name] = task_def

    def add_fns_from_module(self, module, task_name=None, task_metadata_fn=None):
        count = 1
        task_metadata = {}
        for attr in vars(module).values():
            if isinstance(attr, TaskDefinition):
                if not attr.name:
                    if not task_name:
                        raise ValueError(
                            "Either TaskDefinition must be initialized with a name, or task_name must be specified"
                        )
                    attr.name = f"{task_name}-{count}"
                    count += 1
                self.add_fn(attr)
                if task_metadata_fn:
                    task_metadata.update(task_metadata_fn(attr))
        return task_metadata

    async def add_custom_fns(self, code_list, task_metadata_fn=None, to_cache=None):
        error_msgs = {}
        task_metadata = {}
        content = []
        # self.remove_existing_custom_fns(project_config_name)
        for c in code_list:
            task_name = c["task_name"]
            try:
                module = await self.task_runner.run(
                    import_code_from_string,
                    [c["code"], c["module_name"], c["add_to_sys_modules"]],
                    RunType.THREAD,
                )
                if module:
                    task_metadata.update(
                        self.add_fns_from_module(
                            module,
                            task_name=task_name,
                            task_metadata_fn=task_metadata_fn,
                        )
                    )
            except Exception as e:
                error_msgs[task_name] = str(e)
        for k in task_metadata.keys():
            if to_cache:
                self.custom_fn_cache[k] = to_cache
            task_output = await self(k, TaskMessage(id=create_new_id(), content={}))
            content.extend(task_output["content"])

        return task_metadata, error_msgs, content

    def remove_existing_custom_fns(self):
        for k in self.custom_fn_cache.keys():
            del self.fns[k]
            del self.custom_fn_cache[k]

    def process_message(self, fn, fn_name, message):
        if isinstance(fn, SettaInMemoryFn):
            if fn_name in self.custom_fn_cache:
                exporter_obj = self.custom_fn_cache[fn_name]
                for k, v in message.content.items():
                    nice_str = exporter_obj.var_name_mapping[tuple(json.loads(k))]
                    p_dict, key = nested_access(exporter_obj.output, nice_str)
                    p_dict[key] = v
                message.content = exporter_obj.output
            message = message.content
        return message

    def process_output(self, fn, result):
        if isinstance(fn, SettaInMemoryFn):
            for x in result:
                x.setdefault("sectionType", default_section_type(x["type"]))
            result = {"content": result}
        elif isinstance(fn, TaskDefinition):
            if result is None:
                result = {}
        return result
