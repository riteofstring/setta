import json
from typing import Dict

from setta.cli.logger import default_section_type
from setta.database.utils import create_new_id
from setta.utils.utils import nested_access

from . import fns
from .fns.utils import (
    SettaMemoryFn,
    TaskDefinition,
    TaskMessage,
    get_task_metadata_for_frontend,
)
from .task_runner import TaskRunner
from .utils import import_code_from_string


class Tasks:
    def __init__(self, lsp_writers):
        self.lsp_writers = lsp_writers
        self.task_runner = TaskRunner()
        self.cache = {}
        self.fns: Dict[str, TaskDefinition] = {}
        self.custom_fn_names = {}
        self.custom_fn_name_to_exporter_obj = {}
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

    def add_fns_from_module(self, module, task_name=None, exporter_obj=None):
        count = 1
        task_metadata = []
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
                task_metadata.append(get_task_metadata_for_frontend(attr, exporter_obj))
        return task_metadata

    async def add_custom_fns(self, codeDict, project_config_name, exporter_obj):
        error_msgs = {}
        task_metadata = []
        content = []
        self.remove_existing_custom_fns(project_config_name)
        for id, code in codeDict.items():
            task_name = f"{project_config_name}-{id}"
            try:
                module = import_code_from_string(code)
                if module:
                    task_metadata.extend(
                        self.add_fns_from_module(
                            module, task_name=task_name, exporter_obj=exporter_obj
                        )
                    )
            except Exception as e:
                error_msgs[task_name] = str(e)
        self.custom_fn_names[project_config_name] = [x["name"] for x in task_metadata]
        for t in task_metadata:
            self.custom_fn_name_to_exporter_obj[t["name"]] = exporter_obj

        for t in task_metadata:
            task_output = await self(
                t["name"], TaskMessage(id=create_new_id(), content={})
            )
            content.extend(task_output["content"])

        return task_metadata, error_msgs, content

    def remove_existing_custom_fns(self, project_config_name):
        if project_config_name not in self.custom_fn_names:
            return
        for x in self.custom_fn_names[project_config_name]:
            del self.fns[x]
            del self.custom_fn_name_to_exporter_obj[x]
        del self.custom_fn_names[project_config_name]

    def process_message(self, fn, fn_name, message):
        if isinstance(fn, SettaMemoryFn):
            if fn_name in self.custom_fn_name_to_exporter_obj:
                exporter_obj = self.custom_fn_name_to_exporter_obj[fn_name]
                for k, v in message.content.items():
                    nice_str = exporter_obj.var_name_mapping[tuple(json.loads(k))]
                    p_dict, key = nested_access(exporter_obj.output, nice_str)
                    p_dict[key] = v
                message.content = exporter_obj.output
            message = message.content
        return message

    def process_output(self, fn, result):
        if isinstance(fn, SettaMemoryFn):
            for x in result:
                x.setdefault("sectionType", default_section_type(x["type"]))
            result = {"content": result}
        elif isinstance(fn, TaskDefinition):
            if result is None:
                result = {}
        return result
