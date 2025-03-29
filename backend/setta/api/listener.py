import asyncio
import inspect
import json
import logging
import os
import traceback

import websockets

from setta.gen_code.create_runnable_scripts import (
    convert_folder_path_to_module_path,
    relative_to_cwd,
)
from setta.utils.constants import C, set_constants

logger = logging.getLogger(__name__)


def interactive(dependencies=None):
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


async def _handle_websocket(websocket, rel_path, interactive_functions):
    registration_info = {
        "messageType": C.WS_SCRIPT_READY,
        "content": str(rel_path),
    }

    await websocket.send(json.dumps(registration_info))

    # Send registration message with function info including dependencies
    # registration_info = {
    #     "messageType": C.WS_ADD_SCRIPT_METADATA,
    #     "content": {
    #         name: {"dependencies": info["dependencies"]}
    #         for name, info in interactive_functions.items()
    #     },
    # }

    # await websocket.send(json.dumps(registration_info))

    # Process incoming messages using async for
    async for message in websocket:
        print("message", message)
        # try:
        #     data = json.loads(message)
        #     fn_name = data.get("fn_name")
        #     if fn_name not in interactive_functions:
        #         continue

        #     args = data.get("args", [])
        #     kwargs = data.get("kwargs", {})

        #     try:
        #         # Call the function
        #         if isinstance(args, list):
        #             interactive_functions[fn_name]["function"](*args, **kwargs)
        #         else:
        #             interactive_functions[fn_name]["function"](args, **kwargs)

        #     except Exception as e:
        #         print(f"Error in function {fn_name}: {e}", flush=True)
        #         traceback.print_exc()

        # except json.JSONDecodeError:
        #     print("Received invalid JSON", flush=True)
        # except Exception as e:
        #     print(f"Error handling message: {e}", flush=True)
        #     traceback.print_exc()


async def _connect_to_server(rel_path, interactive_functions):
    script_id = convert_folder_path_to_module_path(rel_path)
    endpoint = f"{C.WEBSOCKET}{C.ROUTE_WEBSOCKET_PYTHON_SCRIPT}"
    endpoint = endpoint.format(id=script_id)
    async with websockets.connect(endpoint) as websocket:
        await _handle_websocket(websocket, rel_path, interactive_functions)


def start_listener(host=C.DEFAULT_HOST, port=C.DEFAULT_PORT):
    set_constants(host=host, port=port)

    caller_frame = inspect.currentframe().f_back
    # Find all interactive functions
    interactive_functions = get_interactive_functions(caller_frame)
    rel_path = relative_to_cwd(caller_frame.f_code.co_filename)

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
        asyncio.run(_connect_to_server(rel_path, interactive_functions))
    except KeyboardInterrupt:
        print("Listener stopped by user", flush=True)
