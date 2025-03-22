import asyncio
import logging
from typing import Dict

from . import fns
from .fns.utils import TaskDefinition, TaskMessage
from .task_runner import TaskRunner

logger = logging.getLogger(__name__)


class Tasks:
    def __init__(self, lsp_writers):
        self.lsp_writers = lsp_writers
        self.task_runner = TaskRunner()
        self.cache = {}
        self.fns: Dict[str, TaskDefinition] = {}
        self.in_memory_subprocesses = {}
        self.websockets = []
        self.stop_event = asyncio.Event()
        add_fns_from_module(self.fns, fns)

    async def connect(self, websocket):
        # Accept the new connection
        await websocket.accept()
        self.websockets.append(websocket)
        for k, v in self.in_memory_subprocesses.items():
            v["subprocess"].start_stdout_processor_task()
            logger.debug(f"listening to subprocess {k}")

    async def disconnect(self, websocket):
        self.websockets.remove(websocket)
        if len(self.websockets) == 0:
            for v in self.in_memory_subprocesses.values():
                await v["subprocess"].stop_stdout_processor_task()

    async def __call__(self, message_type, message: TaskMessage):
        return await self.call_regular_fn(message_type, message)

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


def add_fns_from_module(fns_dict, module, module_name=None):
    count = 1
    added_fn_names = []
    for attr in vars(module).values():
        if isinstance(attr, TaskDefinition):
            if not attr.name:
                if not module_name:
                    raise ValueError(
                        "Either TaskDefinition must be initialized with a name, or task_name must be specified"
                    )
                attr.name = f"{module_name}-{count}"
                count += 1
            fns_dict[attr.name] = attr
            added_fn_names.append(attr.name)
    return added_fn_names
