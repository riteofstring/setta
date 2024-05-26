import asyncio

from ..utils.constants import C, set_constants
from .cache import Cache
from .fns.autocomplete import codeCompletion, textFieldCompletion
from .fns.extractArgparseArgs import extractArgparseArgs
from .fns.parametersRequest import parametersRequest
from .fns.textFieldInitializeCode import textFieldInitializeCode
from .fns.typeCheckRequest import typeCheckRequest
from .task_runner import TaskRunner


class Tasks:
    def __init__(self):
        self.task_runner = TaskRunner()
        self.cache = Cache()
        self.fns = {
            "codeCompletion": codeCompletion,
            "textFieldInitializeCode": textFieldInitializeCode,
            "textFieldCompletion": textFieldCompletion,
            "parametersRequest": parametersRequest,
            "typeCheckRequest": typeCheckRequest,
            "extractArgparseArgs": extractArgparseArgs,
        }
        self.interactive_fns = {}

    async def __call__(self, fn_name, message):
        try:
            print(f"Start processing message ID: {message.get('id', None)}", flush=True)
            if fn_name in self.interactive_fns:
                fn = self.interactive_fns[fn_name]
                use_thread = True
            else:
                fn = self.fns[fn_name]
                use_thread = False
            self.maybe_read_cache(fn_name, message)
            result = await self.task_runner.run_non_blocking_subprocess(
                self.copyConstsThenRunFn, use_thread, C, fn, message
            )
            self.maybe_cache_result(message, result)
            return result
        except asyncio.CancelledError:
            print(f"Task for {message.get('id', None)} was cancelled.", flush=True)
            return {"output": None, "name": None}

    def maybe_read_cache(self, fn_name, message):
        if fn_name in [
            "parametersRequest",
            "codeCompletion",
            "textFieldCompletion",
        ]:
            message = message["message"]
            message["cached"] = self.cache.text_field_generated_code.get(
                message["projectConfigId"], {}
            ).get(message["sectionId"], None)

    def maybe_cache_result(self, message, result):
        if result["cache"] is None:
            return
        if result["name"] == "textFieldInitializeCode":
            project = message["message"]["project"]
            sectionId = message["message"]["sectionId"]
            self.cache.add_text_field_generated_code(
                project["projectConfig"]["id"], sectionId, result["cache"]
            )

    def add_interactive_fn(self, key, fn):
        self.interactive_fns[key] = fn

    def copyConstsThenRunFn(self, inputC, fn, message):
        set_constants(**vars(inputC))
        return fn(message)
