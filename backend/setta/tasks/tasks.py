import asyncio
import json
from typing import Dict

from setta.database.utils import create_new_id
from setta.utils.utils import nested_access
from setta.cli.logger import default_section_type

from . import fns
from .fns.utils import (
    TaskDefinition,
    TaskMessage,
    get_task_metadata_for_frontend,
    import_code_from_string,
)
from .task_runner import TaskRunner


class Tasks:
    def __init__(self, lsp_writer):
        self.lsp_writer = lsp_writer
        self.task_runner = TaskRunner()
        self.cache = {}
        self.fns: Dict[str, TaskDefinition] = {}
        self.custom_fn_names = {}
        self.custom_fn_name_to_exporter_obj = {}
        self.add_fns_from_module(fns)

    async def __call__(self, fn_name, message: TaskMessage):
        try:
            print(f"Start processing message ID: {message.id}", flush=True)
            if fn_name in self.custom_fn_name_to_exporter_obj:
                self.process_message_for_custom_fn(fn_name, message)
            fn = self.fns[fn_name]
            fn.read_cache(self.cache, message)
            fn_args = [message, *(getattr(self, k) for k in fn.server_dependencies)]
            result = await self.task_runner.run(message.id, fn.fn, fn_args, fn.run_as)
            fn.write_cache(self.cache, message, result)
            result["messageType"] = fn.return_message_type
            if fn_name in self.custom_fn_name_to_exporter_obj:
                self.process_output_content_for_custom_fn(result["content"])
            return result
        except asyncio.CancelledError:
            print(f"Task for {message.id} was cancelled.", flush=True)
            return {"content": None, "messageType": None}

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
            if t["runOnImport"]:
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

    def process_message_for_custom_fn(self, fn_name, message):
        exporter_obj = self.custom_fn_name_to_exporter_obj[fn_name]
        for k, v in message.content.items():
            nice_str = exporter_obj.var_name_mapping[tuple(json.loads(k))]
            p_dict, key = nested_access(exporter_obj.output, nice_str)
            p_dict[key] = v
        message.content = exporter_obj.output

    def process_output_content_for_custom_fn(self, content):
        for v in content:
            v.setdefault("sectionType", default_section_type(v["type"]))