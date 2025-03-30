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

from .logger import SettaLogger

logger = logging.getLogger(__name__)


class SettaListener:
    def __init__(self, host=C.DEFAULT_HOST, port=C.DEFAULT_PORT):
        self.logger = SettaLogger(host=host, port=port)
        self.caller_frame = inspect.currentframe().f_back
        self.rel_path = relative_to_cwd(self.caller_frame.f_code.co_filename)
        self.script_id = convert_folder_path_to_module_path(self.rel_path)

    def interactive(self, dependencies=None):
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
                deps = ", ".join([str(x) for x in info["dependencies"]])
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
            if messageType == C.WS_PROJECT_DATA:
                exporter_obj = export_for_interactive_fn(message["content"])
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
                    self._run_functions(interactive_functions, exporter_obj.output)
                )

            if not exporter_obj:
                continue

            if messageType == C.WS_CALL_INTERACTIVE_FNS:
                asyncio.create_task(
                    self._run_functions(interactive_functions, exporter_obj.output)
                )

    # Add this new helper method
    async def _run_functions(self, interactive_functions, p):
        # Create a list to store all the function tasks
        for name, v in interactive_functions.items():
            try:
                # Run the function in an executor to avoid blocking the event loop
                # This handles CPU-bound functions without blocking the websocket
                await asyncio.get_event_loop().run_in_executor(None, v["function"], p)
            except Exception as e:
                print(f"Error running function {name}: {e}")


def get_interactive_functions(caller_frame):
    # Get the module from the caller's frame
    caller_module = inspect.getmodule(caller_frame)

    # Find all exposed functions in that module
    interactive_functions = {}
    for name, obj in inspect.getmembers(caller_module):
        if inspect.isfunction(obj) and getattr(obj, "_setta_interactive", False):
            # Include function dependencies in the metadata
            interactive_functions[name] = {
                "function": obj,
                "dependencies": getattr(obj, "_setta_dependencies", []),
            }

    return interactive_functions


def run_interactive_functions(interactive_functions, p):
    for v in interactive_functions.values():
        v["function"](p)


def get_mapped_dependencies_to_fns(fns, exporter_obj):
    output = defaultdict(set)
    for fn_name, metadata in fns.items():
        for d in metadata["dependencies"]:
            if d is not None:
                d = exporter_obj.var_name_reverse_mapping.get(d)
                if not d:
                    continue
            output[d].add(fn_name)
    return output
