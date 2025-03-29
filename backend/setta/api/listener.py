import asyncio
import functools
import inspect
import json
import logging

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
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                # Call the original function
                result = func(*args, **kwargs)

                # After execution, call the logger's send method
                self.logger.send(True, C.WS_FUNCTION_FINISHED)

                # Return the original result
                return result

            # Set the original metadata
            wrapper._setta_interactive = True
            wrapper._setta_dependencies = (
                [None] if dependencies is None else dependencies
            )
            return wrapper

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
        # Send registration message with function info including dependencies
        registration_info = {
            "messageType": C.WS_SCRIPT_READY,
            "content": {
                "relPath": str(self.rel_path),
                "scriptMetadata": {
                    name: {"dependencies": info["dependencies"]}
                    for name, info in interactive_functions.items()
                },
            },
        }

        await websocket.send(json.dumps(registration_info))

        exporter_obj = None

        # Process incoming messages using async for
        async for message in websocket:
            message = json.loads(message)
            messageType = message["messageType"]
            if messageType == C.WS_PROJECT_DATA:
                exporter_obj = export_for_interactive_fn(message["content"])
                run_interactive_functions(interactive_functions, exporter_obj.output)
            elif messageType == C.WS_CALL_INTERACTIVE_FNS:
                print("received!", message["content"])


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
