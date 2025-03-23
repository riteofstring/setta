import asyncio
import inspect
import json
import logging
import traceback

import websockets

from setta.utils.constants import C, set_constants

logger = logging.getLogger(__name__)


def interactive(dependencies=None):
    """
    Decorator to mark functions as interactive for WebSocket communication.

    Args:
        dependencies (list, optional): List of dependency names required by this function.
                                      Default is None (no dependencies).

    Returns:
        function: Decorated function with _setta_interactive attribute set to True and
                 _setta_dependencies attribute set to the provided dependencies.
    """

    def decorator(func):
        func._setta_interactive = True
        func._setta_dependencies = dependencies or []
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


async def _handle_websocket(websocket, interactive_functions):
    try:
        # Send registration message with function info including dependencies
        registration_info = {
            "messageType": C.WS_ADD_SCRIPT_METADATA,
            "content": {
                name: {"dependencies": info["dependencies"]}
                for name, info in interactive_functions.items()
            },
        }

        await websocket.send(json.dumps(registration_info))

        # Process incoming messages
        while True:
            try:
                # Wait for a message
                message = await websocket.recv()
                data = json.loads(message)

                # Handle function calls
                if data.get("type") == "call":
                    fn_name = data.get("fn_name")

                    if fn_name in interactive_functions:
                        args = data.get("args", [])
                        kwargs = data.get("kwargs", {})

                        try:
                            # Call the function
                            if isinstance(args, list):
                                result = interactive_functions[fn_name]["function"](
                                    *args, **kwargs
                                )
                            else:
                                result = interactive_functions[fn_name]["function"](
                                    args, **kwargs
                                )

                            # Send successful result
                            await websocket.send(
                                json.dumps(
                                    {
                                        "id": data.get("id"),
                                        "status": "success",
                                        "content": result,
                                        "messageType": data.get("return_message_type"),
                                    }
                                )
                            )
                        except Exception as e:
                            print(f"Error in function {fn_name}: {e}", flush=True)
                            traceback.print_exc()
                            await websocket.send(
                                json.dumps(
                                    {
                                        "id": data.get("id"),
                                        "status": "error",
                                        "error": f"Error executing {fn_name}: {str(e)}",
                                        "traceback": traceback.format_exc(),
                                    }
                                )
                            )
                    else:
                        await websocket.send(
                            json.dumps(
                                {
                                    "id": data.get("id"),
                                    "status": "error",
                                    "error": f"Function {fn_name} not found",
                                }
                            )
                        )

                # Handle shutdown request
                elif data.get("type") == "shutdown":
                    print("Received shutdown command", flush=True)
                    break

            except websockets.exceptions.ConnectionClosed:
                print("Connection closed", flush=True)
                break
            except json.JSONDecodeError:
                print("Received invalid JSON", flush=True)
            except Exception as e:
                print(f"Error handling message: {e}", flush=True)
                traceback.print_exc()

    except Exception as e:
        print(f"WebSocket handler error: {e}", flush=True)
        traceback.print_exc()


async def _connect_to_server(interactive_functions):
    try:
        endpoint = f"{C.WEBSOCKET}{C.ROUTE_WEBSOCKET_PYTHON_SCRIPT}"
        async with websockets.connect(endpoint) as websocket:
            await _handle_websocket(websocket, interactive_functions)
    except websockets.ConnectionClosedError:
        logger.debug("Connection closed unexpectedly")
    except ConnectionRefusedError:
        logger.debug("Connection refused")


def start_listener(host=C.DEFAULT_HOST, port=C.DEFAULT_PORT):
    set_constants(host=host, port=port)

    caller_frame = inspect.currentframe().f_back
    # Find all interactive functions
    interactive_functions = get_interactive_functions(caller_frame)
    # script_id = os.path.relpath(caller_frame.f_code.co_filename)

    # Print available functions for debugging
    if interactive_functions:
        print(
            f"Starting WebSocket listener with {len(interactive_functions)} interactive functions:"
        )
        for name, info in interactive_functions.items():
            deps = ", ".join(info["dependencies"]) if info["dependencies"] else "none"
            print(f" - {name} (dependencies: {deps})", flush=True)
    else:
        print(
            "Warning: No functions have been marked with @interactive decorator",
            flush=True,
        )

    # Start the event loop
    try:
        asyncio.run(_connect_to_server(interactive_functions))
    except KeyboardInterrupt:
        print("Listener stopped by user", flush=True)
    except Exception as e:
        print(f"Error in WebSocket listener: {e}", flush=True)
        traceback.print_exc()
