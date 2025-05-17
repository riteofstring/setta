import asyncio
from pathlib import Path
from typing import Any, Callable

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.code_gen.utils import get_section_type
from setta.project_state.code import Code
from setta.project_state.project_code import (
    ProjectBashCode,
    ProjectGenPythonCode,
    ProjectPythonCode,
)
from setta.project_state.utils import create_timestamped_folder
from setta.utils.constants import CODE_FOLDER, C
from setta.utils.utils import replace_null_keys_with_none
from setta.websockets.websocket_msg_handlers import WMHProjectManager


class ProjectState:
    def __init__(self, lsp_writers, websocket_msg_handler: WMHProjectManager, temp_folder):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.temp_folder = temp_folder
        self.gen_code = None
        self.code_dict: dict[str, ProjectPythonCode] = {}
        self.used_files: set[Path] = set()
        self.message_queue = asyncio.Queue()
        print("[DEBUG] Creating queue task in ProjectState.__init__", flush=True)
        self.queue_task = asyncio.create_task(self._process_queue())
        print(f"[DEBUG] Queue task created with id: {id(self.queue_task)}", flush=True)

    async def _process_queue(self):
        """Background task that processes messages one at a time"""
        print("[DEBUG] Starting _process_queue background task", flush=True)
        while True:
            print(
                f"[DEBUG] Queue size before get: {self.message_queue.qsize()}",
                flush=True,
            )
            # Get the next message handler and its arguments
            print("[DEBUG] Waiting for next message in queue...", flush=True)
            handler, args, future = await self.message_queue.get()
            # print(
            #     f"[DEBUG] Got message from queue: handler={handler.__name__}, args={args}",
            #     flush=True,
            # )
            try:
                # Execute the actual implementation
                print(f"[DEBUG] Starting handler {handler.__name__}", flush=True)
                result = await handler(*args)
                print(f"[DEBUG] Completed handler {handler.__name__}", flush=True)
                # Set the result for the waiting call
                print(
                    f"[DEBUG] Setting result on future (cancelled={future.cancelled()})",
                    flush=True,
                )
                future.set_result(result)
            except Exception as e:
                # Propagate any exceptions back to the caller
                print(f"[DEBUG] Error in handler {handler.__name__}: {e}", flush=True)
                future.set_exception(e)
            finally:
                # Mark the task as done
                print("[DEBUG] Marking queue task as done", flush=True)
                self.message_queue.task_done()

    async def _enqueue(self, handler: Callable, *args: Any):
        """Enqueue a message for processing and wait for its completion"""
        # print(f"[DEBUG] Enqueueing {handler.__name__} with args {args}", flush=True)
        print(
            f"[DEBUG] Queue task status: cancelled={self.queue_task.cancelled()}, done={self.queue_task.done()}, exception={self.queue_task.exception() if self.queue_task.done() else None}",
            flush=True,
        )

        # Create a future to hold the result
        future = asyncio.Future()
        print(f"[DEBUG] Created future {id(future)}", flush=True)

        # Put the message in the queue
        print("[DEBUG] Putting message in queue", flush=True)
        await self.message_queue.put((handler, args, future))
        print("[DEBUG] Message in queue, waiting for result", flush=True)

        # Wait for the message to be processed and return the result
        print(f"[DEBUG] Awaiting future {id(future)}", flush=True)
        start_time = asyncio.get_event_loop().time()
        try:
            result = await future
            end_time = asyncio.get_event_loop().time()
            print(
                f"[DEBUG] Future completed after {end_time - start_time:.2f}s with result",
                flush=True,
            )
            return result
        except Exception as e:
            end_time = asyncio.get_event_loop().time()
            print(
                f"[DEBUG] Future raised exception after {end_time - start_time:.2f}s: {e}",
                flush=True,
            )
            raise

    async def create_run_command(self, project_state):
        return await self._enqueue(self._create_run_command_impl, project_state)

    async def update(self, project_state):
        return await self._enqueue(self._update_impl, project_state)

    async def type_check(self):
        return await self._enqueue(self._type_check_impl)

    async def text_field_autocomplete(
        self, messageId, sectionId, paramInfoId, fullText, position
    ):
        return await self._enqueue(
            self._text_field_autocomplete_impl,
            messageId,
            sectionId,
            paramInfoId,
            fullText,
            position,
        )

    async def parameters_request(self, messageId, sectionId, fullText):
        return await self._enqueue(
            self._parameters_request_impl, messageId, sectionId, fullText
        )

    async def code_area_autocomplete(self, messageId, sectionId, fullText, position):
        return await self._enqueue(
            self._code_area_autocomplete_impl, messageId, sectionId, fullText, position
        )

    async def get_gen_python_code_path(self):
        return await self._enqueue(self._get_gen_python_code_path_impl)

    async def _create_run_command_impl(self, project_state):
        await self._update_impl(project_state)
        target_folder = create_timestamped_folder(CODE_FOLDER)
        entry_id = project_state["entryCodeBlock"]
        gen_code_path = self.gen_code.write_to_folder(
            target_folder, as_entry_code_block=not entry_id
        )
        code_paths = {}
        for sectionId, c in self.code_dict.items():
            code_paths[sectionId] = c.write_to_folder(target_folder)

        if entry_id:
            return self.code_dict[entry_id].get_run_command(code_paths[entry_id])
        return self.gen_code.get_run_command(gen_code_path)

    async def _update_impl(self, project_state):
        self.used_files = set()
        project_state = replace_null_keys_with_none(project_state)
        dep_graph = DependencyGraph(project_state)
        if self.gen_code:
            if project_state.get("requestRenameRefactor"):
                changed_node_values = dep_graph.rename_references(self.gen_code.dep_graph)
                await self.websocket_msg_handler
            self.gen_code.callback_cleanup()

        gen_code_prefix = project_state["projectConfig"]["genCodePrefix"]
        code_generator = PythonCodeGenerator(dep_graph, gen_code_prefix)
        code_generator.generate_code()

        projectConfigName = project_state["projectConfig"]["name"]
        project_temp_folder = self.temp_folder / projectConfigName
        self.gen_code = ProjectGenPythonCode(
            project_temp_folder,
            self.lsp_writers,
            self.websocket_msg_handler,
            project_state,
            dep_graph,
            code_generator,
        )
        await self.gen_code.update_file()
        self.add_to_used_files(self.gen_code)

        if self.code_dict:
            for c in self.code_dict.values():
                if isinstance(c, ProjectPythonCode):
                    c.callback_cleanup()
        self.code_dict = {}

        for i, sectionId in enumerate(project_state["sections"].keys()):
            section_type = get_section_type(project_state, sectionId)

            if section_type == C.CODE:
                section_code = self.create_code_obj(
                    project_temp_folder, project_state, sectionId
                )

                if not section_code:
                    continue

                await section_code.update_file()
                self.add_to_used_files(section_code)
                self.code_dict[sectionId] = section_code

        self.delete_unused_files(project_temp_folder)

    async def _type_check_impl(self):
        await self.gen_code.type_check()

    async def _text_field_autocomplete_impl(
        self, messageId, sectionId, paramInfoId, fullText, position
    ):
        print("*************text_field_autocomplete\n\n\n", flush=True)
        await self.gen_code.text_field_autocomplete(
            messageId, sectionId, paramInfoId, fullText, position
        )

    async def _parameters_request_impl(self, messageId, sectionId, fullText):
        print("parameters_request", flush=True)
        await self.gen_code.parameters_request(messageId, sectionId, fullText)

    async def _code_area_autocomplete_impl(
        self, messageId, sectionId, fullText, position
    ):
        print("*************code_area_autocomplete\n\n\n", flush=True)
        await self.code_dict[sectionId].code_area_autocomplete(
            messageId, fullText, position
        )

    async def _get_gen_python_code_path_impl(self):
        if self.gen_code:
            return self.gen_code.get_gen_python_code_path()
        return None

    def add_to_used_files(self, code_obj: Code):
        self.used_files.add(code_obj.temp_file.resolve())

    def delete_unused_files(self, project_temp_folder: Path):
        # Get all files in the project temp folder and delete unused ones
        if project_temp_folder.exists():
            for file_path in project_temp_folder.glob("**/*"):
                if file_path.is_file() and file_path.resolve() not in self.used_files:
                    try:
                        file_path.unlink()
                        print(f"Deleted unused file: {file_path}")
                    except Exception as e:
                        print(f"Error deleting file {file_path}: {e}")

    def create_code_obj(self, project_temp_folder, project_state, sectionId):
        codeLanguage = project_state["sections"][sectionId]["codeLanguage"]
        if codeLanguage == "python":
            return ProjectPythonCode(
                project_temp_folder,
                self.lsp_writers,
                self.websocket_msg_handler,
                project_state,
                sectionId,
            )
        elif codeLanguage == "bash":
            return ProjectBashCode(project_temp_folder, project_state, sectionId)
        return None
