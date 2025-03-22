import asyncio
import inspect
import json
import os
import traceback

import websockets

from setta.utils.constants import (
    HOST_ENV_VARIABLE,
    PORT_ENV_VARIABLE,
    C,
    load_constants,
    set_constants,
)


def interactive(func):
    func._setta_interactive = True
    return func


def get_interactive_functions():
    # Get the module that called this function
    frame = inspect.currentframe().f_back
    caller_module = inspect.getmodule(frame)

    # Find all interactive functions in the module
    interactive_functions = {}
    for name, obj in inspect.getmembers(caller_module):
        if inspect.isfunction(obj) and getattr(obj, "_setta_interactive", False):
            interactive_functions[name] = obj

    return interactive_functions


async def _handle_websocket(websocket, interactive_functions):
    try:
        # Send registration message
        await websocket.send(
            json.dumps(
                {
                    "type": "registration",
                    "status": "ready",
                    "functions": list(interactive_functions.keys()),
                }
            )
        )

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
                                result = interactive_functions[fn_name](*args, **kwargs)
                            else:
                                result = interactive_functions[fn_name](args, **kwargs)

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
    while True:
        try:
            print(f"Connecting to {C.WEBSOCKET}...", flush=True)
            async with websockets.connect(C.WEBSOCKET) as websocket:
                print(f"Connected to WebSocket server", flush=True)
                await _handle_websocket(websocket, interactive_functions)

                # If we get here, it was a clean shutdown, so break the loop
                break

        except websockets.ConnectionClosedError:
            print(f"Connection failed, retrying in 3 seconds...", flush=True)
            await asyncio.sleep(3)
        except Exception as e:
            print(f"Unexpected error: {e}", flush=True)
            traceback.print_exc()
            await asyncio.sleep(3)


def start_listener(host=None, port=None):
    load_constants()
    set_constants(
        host=host or os.environ.get(HOST_ENV_VARIABLE, C.DEFAULT_HOST),
        port=port or os.environ.get(PORT_ENV_VARIABLE, C.DEFAULT_PORT),
    )

    # Find all interactive functions
    interactive_functions = get_interactive_functions()

    # Print available functions for debugging
    if interactive_functions:
        print(
            f"Starting WebSocket listener with {len(interactive_functions)} interactive functions:"
        )
        for name in interactive_functions:
            print(f" - {name}", flush=True)
    else:
        print(
            "Warning: No functions have been interactive with @interactive decorator",
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
