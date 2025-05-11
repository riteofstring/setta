import asyncio
from typing import Any, Callable

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.project_state.project_code import ProjectGenCode


class ProjectState:
    def __init__(self, lsp_writers, websocket_msg_handler, temp_folder):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.temp_folder = temp_folder
        self.project_state = None
        self.gen_code = None
        self.code = {}
        self.message_queue = asyncio.Queue()
        self.queue_task = asyncio.create_task(self._process_queue())

    async def _process_queue(self):
        """Background task that processes messages one at a time"""
        while True:
            # Get the next message handler and its arguments
            handler, args, future = await self.message_queue.get()
            try:
                # Execute the actual implementation
                result = await handler(*args)
                # Set the result for the waiting call
                future.set_result(result)
            except Exception as e:
                # Propagate any exceptions back to the caller
                future.set_exception(e)
            finally:
                # Mark the task as done
                self.message_queue.task_done()

    async def _enqueue(self, handler: Callable, *args: Any):
        """Enqueue a message for processing and wait for its completion"""
        # Create a future to hold the result
        future = asyncio.Future()
        # Put the message in the queue
        await self.message_queue.put((handler, args, future))
        # Wait for the message to be processed and return the result
        return await future

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

    # Actual implementation methods

    async def _update_impl(self, project_state):
        # Original implementation
        self.project_state = project_state
        dep_graph = DependencyGraph(self.project_state)
        code_generator = PythonCodeGenerator(dep_graph)
        code, lines = code_generator.generate_code()

        if self.gen_code:
            self.gen_code.callback_cleanup()

        projectConfigName = self.project_state["projectConfig"]["name"]
        project_temp_folder = self.temp_folder / projectConfigName
        self.gen_code = ProjectGenCode(
            self.lsp_writers,
            self.websocket_msg_handler,
            project_temp_folder,
            dep_graph,
            code,
            lines,
        )
        return await self.gen_code.update(self.project_state, code)

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

    # Non-async methods don't need to be queued as they don't yield control
    def delete_temp_files(self):
        self.gen_code.delete_temp_file()
        for v in self.code.values():
            v.delete_temp_file()

    def get_gen_python_code_path(self):
        if self.gen_code:
            return self.gen_code.get_gen_python_code_path()
        return None

    # Cleanup method to properly close the queue processor when needed
    async def cleanup(self):
        """Cancel the queue processor task when shutting down"""
        if self.queue_task and not self.queue_task.done():
            self.queue_task.cancel()
            try:
                await self.queue_task
            except asyncio.CancelledError:
                pass
