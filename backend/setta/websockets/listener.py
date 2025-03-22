import asyncio
import inspect
import json
import traceback

import websockets


def expose(func):
    func._setta_exposed = True
    return func


def get_exposed_functions():
    # Get the module that called this function
    frame = inspect.currentframe().f_back
    caller_module = inspect.getmodule(frame)

    # Find all exposed functions in the module
    exposed_functions = {}
    for name, obj in inspect.getmembers(caller_module):
        if inspect.isfunction(obj) and getattr(obj, "_setta_exposed", False):
            exposed_functions[name] = obj

    return exposed_functions


async def _handle_websocket(websocket, exposed_functions):
    """Internal function to handle the WebSocket connection and message processing."""
    try:
        # Send registration message
        await websocket.send(
            json.dumps(
                {
                    "type": "registration",
                    "status": "ready",
                    "functions": list(exposed_functions.keys()),
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

                    if fn_name in exposed_functions:
                        args = data.get("args", [])
                        kwargs = data.get("kwargs", {})

                        try:
                            # Call the function
                            if isinstance(args, list):
                                result = exposed_functions[fn_name](*args, **kwargs)
                            else:
                                result = exposed_functions[fn_name](args, **kwargs)

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


async def _connect_to_server(server_url, script_id, exposed_functions):
    """Internal function to connect to the server and handle reconnection."""
    uri = f"ws://{server_url}/script-socket/{script_id}"

    while True:
        try:
            print(f"Connecting to {uri}...", flush=True)
            async with websockets.connect(uri) as websocket:
                print(f"Connected to WebSocket server", flush=True)
                await _handle_websocket(websocket, exposed_functions)

                # If we get here, it was a clean shutdown, so break the loop
                break

        except (websockets.exceptions.ConnectionClosed, ConnectionRefusedError):
            print(f"Connection failed, retrying in 3 seconds...", flush=True)
            await asyncio.sleep(3)
        except Exception as e:
            print(f"Unexpected error: {e}", flush=True)
            traceback.print_exc()
            await asyncio.sleep(3)


def start_listener(script_id=None, server_url="localhost:8000"):
    """
    Start the WebSocket listener to expose decorated functions.
    This function will automatically find all functions decorated with @expose
    in the calling module and make them available via WebSocket.

    Args:
        script_id (str, optional): Unique identifier for this script.
                                  If None, a default ID will be used.
        server_url (str, optional): URL of the WebSocket server.
                                   Defaults to "localhost:8000".

    Example:
        @expose
        def my_function(arg1, arg2):
            return arg1 + arg2

        if __name__ == "__main__":
            start_listener("my_script_123")
    """
    # Use a default script_id if none is provided
    if script_id is None:
        script_id = "script_default"

    # Find all exposed functions
    exposed_functions = get_exposed_functions()

    # Print available functions for debugging
    if exposed_functions:
        print(
            f"Starting WebSocket listener with {len(exposed_functions)} exposed functions:"
        )
        for name in exposed_functions:
            print(f" - {name}", flush=True)
    else:
        print(
            "Warning: No functions have been exposed with @expose decorator", flush=True
        )

    # Start the event loop
    try:
        asyncio.run(_connect_to_server(server_url, script_id, exposed_functions))
    except KeyboardInterrupt:
        print("Listener stopped by user", flush=True)
    except Exception as e:
        print(f"Error in WebSocket listener: {e}", flush=True)
        traceback.print_exc()
