import asyncio
import inspect
import json
import logging
from collections import defaultdict

import websockets

from setta.gen_code.create_runnable_scripts import (
    convert_folder_path_to_module_path,
    relative_to_cwd,
)
from setta.gen_code.export_selected import export_for_interactive_fn
from setta.utils.constants import C
from setta.utils.utils import nested_access

from .logger import SettaLogger

logger = logging.getLogger(__name__)


class SettaListener:
    def __init__(self, host=C.DEFAULT_HOST, port=C.DEFAULT_PORT):
        self.logger = SettaLogger(host=host, port=port)
        self.caller_frame = inspect.currentframe().f_back
        self.rel_path = relative_to_cwd(self.caller_frame.f_code.co_filename)
        self.script_id = convert_folder_path_to_module_path(self.rel_path)

    def interactive(self, dependencies=None, run_on_init=True):
        """
        Decorator to mark functions as interactive for WebSocket communication.

        Args:
            dependencies (list, optional): List of dependency names required by this function.
                                        Default is None, which means run on every change

        Returns:
            function: Decorated function with _setta_interactive attribute set to True and
                    _setta_dependencies attribute set to the provided dependencies.
        """

        def decorator(func):
            func._setta_interactive = True
            func._setta_dependencies = [None] if dependencies is None else dependencies
            func._setta_run_on_init = run_on_init
            return func

        # Handle the case when decorator is used without parentheses
        if callable(dependencies):
            func = dependencies
            dependencies = None
            return decorator(func)

        return decorator

    def start(self):
        # Find all interactive functions
        interactive_functions = get_interactive_functions(self.caller_frame)

        # Print available functions for debugging
        if interactive_functions:
            print(
                f"Starting WebSocket listener with {len(interactive_functions)} interactive functions:"
            )
            for name, info in interactive_functions.items():
                deps = ", ".join([str(x) for x in info._setta_dependencies])
                print(f" - {name} (dependencies: {deps})", flush=True)
        else:
            print(
                "Warning: No functions have been marked with @interactive decorator",
                flush=True,
            )

        # Start the event loop
        try:
            asyncio.run(self._connect_to_server(interactive_functions))
        except KeyboardInterrupt:
            print("Listener stopped by user", flush=True)

    async def _connect_to_server(self, interactive_functions):
        endpoint = f"{C.WEBSOCKET}{C.ROUTE_WEBSOCKET_PYTHON_SCRIPT}"
        endpoint = endpoint.format(id=self.script_id)
        async with websockets.connect(endpoint) as websocket:
            self.logger.websocket = websocket
            await self._handle_websocket(websocket, interactive_functions)

    async def _handle_websocket(self, websocket, interactive_functions):
        await websocket.send(
            json.dumps(
                {"messageType": C.WS_SCRIPT_READY, "content": str(self.rel_path)}
            )
        )

        exporter_obj = None
        dependencies_to_fns = None

        # Process incoming messages using async for
        async for message in websocket:
            message = json.loads(message)
            messageType = message["messageType"]
            content = message["content"]
            if messageType == C.WS_PROJECT_DATA:
                exporter_obj = export_for_interactive_fn(content)
                dependencies_to_fns = get_mapped_dependencies_to_fns(
                    interactive_functions, exporter_obj
                )
                await websocket.send(
                    json.dumps(
                        {
                            "messageType": C.WS_SCRIPT_DEPENDENCIES,
                            "content": list(dependencies_to_fns.keys()),
                        }
                    )
                )

                # run all interactive functions when we first receive project data
                asyncio.create_task(
                    self._run_functions_on_init(
                        interactive_functions, exporter_obj.output
                    )
                )

            if not exporter_obj or not dependencies_to_fns:
                continue

            if messageType == C.WS_CALL_INTERACTIVE_FNS:
                update_exporter_obj(content, exporter_obj)
                asyncio.create_task(
                    self._run_functions_with_new_data(
                        interactive_functions,
                        exporter_obj.output,
                        dependencies_to_fns,
                        content,
                    )
                )

    # Add this new helper method
    async def _run_functions_with_new_data(
        self, interactive_functions, p, dependencies_to_fns, new_data
    ):
        for name, v in interactive_functions.items():
            if name in dependencies_to_fns.get(None, set()):
                await run_function(name, v, p)
            else:
                key, _ = new_data
                if name in dependencies_to_fns.get(tuple(key), set()):
                    await run_function(name, v, p)

    async def _run_functions_on_init(self, interactive_functions, p):
        for name, v in interactive_functions.items():
            if v._setta_run_on_init:
                await run_function(name, v, p)


def get_interactive_functions(caller_frame):
    # Get the module from the caller's frame
    caller_module = inspect.getmodule(caller_frame)

    # Find all exposed functions in that module
    interactive_functions = {}
    for name, obj in inspect.getmembers(caller_module):
        if inspect.isfunction(obj) and getattr(obj, "_setta_interactive", False):
            # Include function dependencies in the metadata
            interactive_functions[name] = obj

    return interactive_functions


def get_mapped_dependencies_to_fns(fns, exporter_obj):
    output = defaultdict(set)
    for fn_name, fn in fns.items():
        for d in fn._setta_dependencies:
            if d is not None:
                d = exporter_obj.var_name_reverse_mapping.get(d)
                if not d:
                    continue
            output[d].add(fn_name)
    return output


async def run_function(name, fn, p):
    try:
        # Run the function in an executor to avoid blocking the event loop
        # This handles CPU-bound functions without blocking the websocket
        await asyncio.get_event_loop().run_in_executor(None, fn, p)
    except Exception as e:
        print(f"Error running function {name}: {e}")


# new_data is a list of tuples, where each tuple is [key, value]
def update_exporter_obj(new_data, exporter_obj):
    key, value = new_data
    nice_str = exporter_obj.var_name_mapping.get(tuple(key))
    if not nice_str:
        return
    p_dict, p_dict_key = nested_access(exporter_obj.output, nice_str)
    p_dict[p_dict_key] = value
