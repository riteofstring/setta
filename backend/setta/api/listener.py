import asyncio
import copy
import inspect
import json
import logging
import time
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
        self.endpoint = f"{C.WEBSOCKET}{C.ROUTE_WEBSOCKET_PYTHON_SCRIPT}".format(
            id=self.script_id
        )
        self.fns = []
        self.exporter_obj = None
        self.dependencies_to_fns = defaultdict(set)

        # For debouncing/throttling
        self.pending_tasks = {}

    def interactive(
        self,
        dependencies=None,
        run_on_init=True,
        debounce=0,
        throttle=0,
        leading_edge=False,
    ):
        """
        Decorator to mark functions as interactive for WebSocket communication.

        Args:
            dependencies (list, optional): List of dependency names required by this function.
                                        Default is None, which means run on every change
            run_on_init (bool, optional): Whether to run the function when the server first connects
            debounce (float, optional): Debounce time in seconds. Function won't run until input is stable for this long
            throttle (float, optional): Throttle time in seconds. Function won't run more than once per this time period
            leading_edge (bool, optional): For debounce/throttle, whether to run on the first value (True)
                                         or last value (False)

        Returns:
            function: Decorated function with _setta_interactive attribute set to True and
                    _setta_dependencies attribute set to the provided dependencies.
        """

        def decorator(func):
            func._setta_interactive = True
            func._setta_dependencies = [None] if dependencies is None else dependencies
            func._setta_run_on_init = run_on_init
            func._setta_is_running = False
            func._setta_data = None
            func._setta_data_to_be_updated = {}
            func._setta_debounce = debounce
            func._setta_throttle = throttle
            func._setta_leading_edge = leading_edge
            func._setta_last_run_time = None
            return func

        # Handle the case when decorator is used without parentheses
        if callable(dependencies):
            func = dependencies
            dependencies = None
            return decorator(func)

        return decorator

    def start(self):
        # Find all interactive functions
        self.fns = get_interactive_functions(self.caller_frame)

        # Print available functions for debugging
        if self.fns:
            print(
                f"Starting WebSocket listener with {len(self.fns)} interactive functions:"
            )
            for fn in self.fns:
                deps = ", ".join([str(x) for x in fn._setta_dependencies])
                timing_info = []
                if fn._setta_debounce > 0:
                    timing_info.append(f"debounce={fn._setta_debounce}s")
                if fn._setta_throttle > 0:
                    timing_info.append(f"throttle={fn._setta_throttle}s")
                if timing_info:
                    timing_str = f" ({', '.join(timing_info)})"
                else:
                    timing_str = ""
                print(
                    f" - {fn.__name__} (dependencies: {deps}){timing_str}", flush=True
                )
        else:
            print(
                "Warning: No functions have been marked with @interactive decorator",
                flush=True,
            )

        # Start the event loop
        try:
            asyncio.run(self._connect_to_server())
        except KeyboardInterrupt:
            print("Listener stopped by user", flush=True)

    async def _connect_to_server(self):
        async with websockets.connect(self.endpoint) as websocket:
            self.logger.websocket = websocket
            await self._handle_websocket(websocket)

    async def _handle_websocket(self, websocket):
        await websocket.send(
            json.dumps(
                {"messageType": C.WS_SCRIPT_READY, "content": str(self.rel_path)}
            )
        )

        # Process incoming messages using async for
        async for message in websocket:
            message = json.loads(message)
            messageType = message["messageType"]
            content = message["content"]
            if messageType == C.WS_PROJECT_DATA:
                self.exporter_obj = export_for_interactive_fn(content)
                for fn in self.fns:
                    fn._setta_data = copy.deepcopy(self.exporter_obj.output)
                self.dependencies_to_fns = self.get_mapped_dependencies_to_fns()
                await websocket.send(
                    json.dumps(
                        {
                            "messageType": C.WS_SCRIPT_DEPENDENCIES,
                            "content": list(self.dependencies_to_fns.keys()),
                        }
                    )
                )

                # run all interactive functions when we first receive project data
                asyncio.create_task(self._run_functions_on_init())

            if not self.exporter_obj:
                continue

            if messageType == C.WS_CALL_INTERACTIVE_FNS:
                asyncio.create_task(
                    self._run_functions_with_new_data(
                        content,
                    )
                )

    # Add this new helper method
    async def _run_functions_with_new_data(self, new_data):
        # First update all function data
        for fn in self.fns:
            self.update_stored_data(new_data, fn)

        # Then determine which functions to run
        key, _ = new_data
        functions_to_run = []

        for fn in self.fns:
            if fn._setta_is_running:
                continue

            should_run = False
            if fn.__name__ in self.dependencies_to_fns.get(None, set()):
                should_run = True
            elif fn.__name__ in self.dependencies_to_fns.get(tuple(key), set()):
                should_run = True

            if should_run:
                functions_to_run.append(fn)

        # Handle each function with debounce/throttle logic
        for fn in functions_to_run:
            await self._schedule_function_run(fn)

    async def _schedule_function_run(self, fn):
        current_time = time.time()

        # Cancel any existing pending task
        if fn.__name__ in self.pending_tasks:
            self.pending_tasks[fn.__name__].cancel()
            self.pending_tasks.pop(fn.__name__, None)  # Explicitly cleanup

        # Initialize if first run
        if fn._setta_last_run_time is None:
            fn._setta_last_run_time = 0  # Set to 0 to treat as "long ago"

        time_since_last_run = current_time - fn._setta_last_run_time

        # Determine if we should execute now based on debounce/throttle rules
        throttle_allows_execution = (
            fn._setta_throttle <= 0 or time_since_last_run >= fn._setta_throttle
        )

        # Decide execution strategy
        if fn._setta_debounce > 0:
            # Debounce case
            if fn._setta_leading_edge:
                # Leading edge debounce: Execute immediately if throttle allows and cooldown has passed
                if (
                    throttle_allows_execution
                    and time_since_last_run >= fn._setta_debounce
                ):
                    await self.run_function(fn)
                # Otherwise do nothing (ignore this change)
            else:
                # Trailing edge debounce: Always schedule (or reschedule) with delay
                # If throttled, use max of remaining throttle time and debounce time
                if not throttle_allows_execution:
                    delay = max(
                        fn._setta_throttle - time_since_last_run, fn._setta_debounce
                    )
                else:
                    delay = fn._setta_debounce

                self.pending_tasks[fn.__name__] = asyncio.create_task(
                    self._delayed_run(fn, delay)
                )
        elif fn._setta_throttle > 0:
            # Throttle only case
            if throttle_allows_execution:
                # Cooldown passed, execute immediately
                await self.run_function(fn)
            elif fn._setta_leading_edge:
                # Leading edge throttle with active cooldown - ignore
                pass
            else:
                # Trailing edge throttle - schedule for when throttle period ends
                delay = fn._setta_throttle - time_since_last_run
                self.pending_tasks[fn.__name__] = asyncio.create_task(
                    self._delayed_run(fn, delay)
                )
        else:
            # No debounce or throttle - run immediately
            await self.run_function(fn)

    async def _delayed_run(self, fn, delay):
        try:
            await asyncio.sleep(delay)
            # Only run if this is still the active task for this function
            if self.pending_tasks.get(fn.__name__) == asyncio.current_task():
                await self.run_function(fn)
        except asyncio.CancelledError:
            # Handle cancelled task gracefully
            pass
        finally:
            # Always clean up if this task is still registered as the active one
            if self.pending_tasks.get(fn.__name__) == asyncio.current_task():
                self.pending_tasks.pop(fn.__name__, None)

    async def _run_functions_on_init(self):
        for fn in self.fns:
            if fn._setta_is_running:
                continue
            if fn._setta_run_on_init:
                await self.run_function(fn)

    async def run_function(self, fn):
        try:
            # Run the function in an executor to avoid blocking the event loop
            # This handles CPU-bound functions without blocking the websocket
            fn._setta_is_running = True
            fn._setta_last_run_time = time.time()
            await asyncio.get_event_loop().run_in_executor(None, fn, fn._setta_data)
        except Exception as e:
            print(f"Error running function {fn.__name__}: {e}")
        finally:
            fn._setta_is_running = False
            # Apply any updates that came in while the function was running
            for key, value in fn._setta_data_to_be_updated.items():
                self.update_stored_data((key, value), fn)
            fn._setta_data_to_be_updated = {}

    def get_mapped_dependencies_to_fns(self):
        output = defaultdict(set)
        for fn in self.fns:
            for d in fn._setta_dependencies:
                if d is not None:
                    d = self.exporter_obj.var_name_reverse_mapping.get(d)
                    if not d:
                        continue
                output[d].add(fn.__name__)
        return output

    # new_data is a list of tuples, where each tuple is [key, value]
    def update_stored_data(self, new_data, fn):
        key, value = new_data
        if fn._setta_is_running:
            fn._setta_data_to_be_updated[tuple(key)] = value
        else:
            nice_str = self.exporter_obj.var_name_mapping.get(tuple(key))
            if not nice_str:
                return
            p_dict, p_dict_key = nested_access(fn._setta_data, nice_str)
            p_dict[p_dict_key] = value


def get_interactive_functions(caller_frame):
    # Get the module from the caller's frame
    caller_module = inspect.getmodule(caller_frame)

    # Find all exposed functions in that module
    fns = []
    for _, obj in inspect.getmembers(caller_module):
        if inspect.isfunction(obj) and getattr(obj, "_setta_interactive", False):
            # Include function dependencies in the metadata
            fns.append(obj)

    return fns
