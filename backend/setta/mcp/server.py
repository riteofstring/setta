# some parts borrowed from https://github.com/tadata-org/fastapi_mcp/blob/main/fastapi_mcp/server.py

import asyncio
import contextlib
import inspect
import json
import logging
from functools import wraps
from http import HTTPStatus
from typing import TYPE_CHECKING, Any, Callable
from urllib.parse import quote
from uuid import uuid4

import anyio
from fastapi import FastAPI, Request
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import Context
from mcp.server.fastmcp.tools import Tool
from mcp.server.sse import SseServerTransport
from mcp.server.streamable_http import (
    CONTENT_TYPE_SSE,
    GET_STREAM_KEY,
    LAST_EVENT_ID_HEADER,
    MCP_PROTOCOL_VERSION_HEADER,
    MCP_SESSION_ID_HEADER,
    EventMessage,
    StreamableHTTPServerTransport,
)
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.shared.message import ServerMessageMetadata, SessionMessage
from mcp.types import (
    DEFAULT_NEGOTIATED_VERSION,
    INTERNAL_ERROR,
    INVALID_PARAMS,
    PARSE_ERROR,
    JSONRPCError,
    JSONRPCMessage,
    JSONRPCRequest,
    JSONRPCResponse,
)
from pydantic import ValidationError
from sse_starlette import EventSourceResponse
from starlette.applications import Starlette
from starlette.responses import Response
from starlette.types import Receive, Scope, Send

from setta.database.db_objs import DBE
from setta.logging.tasks import spawn_background_task
from setta.mcp.tool_metadata import SettaToolType
from setta.mcp.tool_registry import register_setta_tool
from setta.mcp.tool_setup import SETTA_INIT_MCP_TOOLS, SETTA_MCP_TOOLS
from setta.mcp.utils import (
    convert_canonical_ids_to_temporary,
    convert_temporary_ids_to_canonical,
)
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

if TYPE_CHECKING:
    from setta.server_state import SettaFastAPIState

logger = logging.getLogger(__name__)
_CATCH_ALL_PATH = "/{full_path:path}"


def _move_catch_all_route_to_end(app: FastAPI) -> None:
    routes = list(app.router.routes)
    catch_all = [
        route for route in routes if getattr(route, "path", None) == _CATCH_ALL_PATH
    ]
    if not catch_all:
        return
    app.router.routes = [
        route for route in routes if route not in catch_all
    ] + catch_all


class _SettaSseServerTransport(SseServerTransport):
    @contextlib.asynccontextmanager
    async def connect_sse(self, scope, receive, send):  # pragma: no cover
        if scope["type"] != "http":
            logger.error("connect_sse received non-HTTP request")
            raise ValueError("connect_sse can only handle HTTP requests")

        request = Request(scope, receive)
        error_response = await self._security.validate_request(request, is_post=False)
        if error_response:
            await error_response(scope, receive, send)
            raise ValueError("Request validation failed")

        read_stream_writer, read_stream = anyio.create_memory_object_stream(0)
        write_stream, write_stream_reader = anyio.create_memory_object_stream(0)

        session_id = uuid4()
        self._read_stream_writers[session_id] = read_stream_writer

        root_path = scope.get("root_path", "")
        full_message_path_for_client = root_path.rstrip("/") + self._endpoint
        client_post_uri_data = (
            f"{quote(full_message_path_for_client)}?session_id={session_id.hex}"
        )

        sse_stream_writer, sse_stream_reader = anyio.create_memory_object_stream(0)

        async def sse_writer():
            async with sse_stream_writer, write_stream_reader:
                await sse_stream_writer.send(
                    {"event": "endpoint", "data": client_post_uri_data}
                )

                async for session_message in write_stream_reader:
                    await sse_stream_writer.send(
                        {
                            "event": "message",
                            "data": session_message.message.model_dump_json(
                                by_alias=True, exclude_none=True
                            ),
                        }
                    )

        async with anyio.create_task_group() as tg:

            async def response_wrapper(scope, receive, send):
                try:
                    await EventSourceResponse(
                        content=sse_stream_reader, data_sender_callable=sse_writer
                    )(scope, receive, send)
                finally:
                    await read_stream_writer.aclose()
                    await write_stream_reader.aclose()

            tg.start_soon(response_wrapper, scope, receive, send)

            try:
                yield (read_stream, write_stream)
            finally:
                await read_stream.aclose()
                await write_stream.aclose()
                await sse_stream_writer.aclose()
                await sse_stream_reader.aclose()


class _SettaStreamableHTTPServerTransport(StreamableHTTPServerTransport):
    async def _handle_post_request(
        self, scope: Scope, request: Request, receive: Receive, send: Send
    ) -> None:
        writer = self._read_stream_writer
        if writer is None:  # pragma: no cover
            raise ValueError(
                "No read stream writer available. Ensure connect() is called first."
            )
        try:
            if not await self._validate_accept_header(request, scope, send):
                return

            if not self._check_content_type(request):  # pragma: no cover
                response = self._create_error_response(
                    "Unsupported Media Type: Content-Type must be application/json",
                    HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
                )
                await response(scope, receive, send)
                return

            body = await request.body()

            try:
                raw_message = json.loads(body)
            except json.JSONDecodeError as exc:
                response = self._create_error_response(
                    f"Parse error: {exc}",
                    HTTPStatus.BAD_REQUEST,
                    PARSE_ERROR,
                )
                await response(scope, receive, send)
                return

            try:  # pragma: no cover
                message = JSONRPCMessage.model_validate(raw_message)
            except ValidationError as exc:  # pragma: no cover
                response = self._create_error_response(
                    f"Validation error: {exc}",
                    HTTPStatus.BAD_REQUEST,
                    INVALID_PARAMS,
                )
                await response(scope, receive, send)
                return

            is_initialization_request = (
                isinstance(message.root, JSONRPCRequest)
                and message.root.method == "initialize"
            )  # pragma: no cover

            if is_initialization_request:  # pragma: no cover
                if self.mcp_session_id:
                    request_session_id = self._get_session_id(request)
                    if request_session_id and request_session_id != self.mcp_session_id:
                        response = self._create_error_response(
                            "Not Found: Invalid or expired session ID",
                            HTTPStatus.NOT_FOUND,
                        )
                        await response(scope, receive, send)
                        return
            elif not await self._validate_request_headers(
                request, send
            ):  # pragma: no cover
                return

            if not isinstance(message.root, JSONRPCRequest):  # pragma: no cover
                response = self._create_json_response(
                    None,
                    HTTPStatus.ACCEPTED,
                )
                await response(scope, receive, send)

                metadata = ServerMessageMetadata(request_context=request)
                session_message = SessionMessage(message, metadata=metadata)
                await writer.send(session_message)
                return

            protocol_version = (
                str(
                    message.root.params.get(
                        "protocolVersion", DEFAULT_NEGOTIATED_VERSION
                    )
                )
                if is_initialization_request and message.root.params
                else request.headers.get(
                    MCP_PROTOCOL_VERSION_HEADER, DEFAULT_NEGOTIATED_VERSION
                )
            )

            request_id = str(message.root.id)  # pragma: no cover
            self._request_streams[request_id] = anyio.create_memory_object_stream[
                EventMessage
            ](0)  # pragma: no cover
            request_stream_reader = self._request_streams[request_id][
                1
            ]  # pragma: no cover

            if self.is_json_response_enabled:  # pragma: no cover
                metadata = ServerMessageMetadata(request_context=request)
                session_message = SessionMessage(message, metadata=metadata)
                await writer.send(session_message)
                try:
                    response_message = None
                    async for event_message in request_stream_reader:
                        if isinstance(
                            event_message.message.root, JSONRPCResponse | JSONRPCError
                        ):
                            response_message = event_message.message
                            break
                        logger.debug("received: %s", event_message.message.root.method)

                    if response_message:
                        response = self._create_json_response(response_message)
                        await response(scope, receive, send)
                    else:
                        logger.error(
                            "No response message received before stream closed"
                        )
                        response = self._create_error_response(
                            "Error processing request: No response received",
                            HTTPStatus.INTERNAL_SERVER_ERROR,
                        )
                        await response(scope, receive, send)
                except Exception:
                    logger.exception("Error processing JSON response")
                    response = self._create_error_response(
                        "Error processing request",
                        HTTPStatus.INTERNAL_SERVER_ERROR,
                        INTERNAL_ERROR,
                    )
                    await response(scope, receive, send)
                finally:
                    await self._clean_up_memory_streams(request_id)
            else:  # pragma: no cover
                sse_stream_writer, sse_stream_reader = (
                    anyio.create_memory_object_stream[dict[str, str]](0)
                )

                self._sse_stream_writers[request_id] = sse_stream_writer

                async def sse_writer() -> None:
                    try:
                        async with sse_stream_writer, request_stream_reader:
                            await self._maybe_send_priming_event(
                                request_id, sse_stream_writer, protocol_version
                            )

                            async for event_message in request_stream_reader:
                                event_data = self._create_event_data(event_message)
                                await sse_stream_writer.send(event_data)

                                if isinstance(
                                    event_message.message.root,
                                    JSONRPCResponse | JSONRPCError,
                                ):
                                    break
                    except anyio.ClosedResourceError:
                        logger.debug("SSE stream closed by close_sse_stream()")
                    except Exception:
                        logger.exception("Error in SSE writer")
                    finally:
                        logger.debug("Closing SSE writer")
                        self._sse_stream_writers.pop(request_id, None)
                        await self._clean_up_memory_streams(request_id)

                headers = {
                    "Cache-Control": "no-cache, no-transform",
                    "Connection": "keep-alive",
                    "Content-Type": CONTENT_TYPE_SSE,
                    **(
                        {MCP_SESSION_ID_HEADER: self.mcp_session_id}
                        if self.mcp_session_id
                        else {}
                    ),
                }
                response = EventSourceResponse(
                    content=sse_stream_reader,
                    data_sender_callable=sse_writer,
                    headers=headers,
                )

                try:
                    async with anyio.create_task_group() as tg:
                        tg.start_soon(response, scope, receive, send)
                        session_message = self._create_session_message(
                            message, request, request_id, protocol_version
                        )
                        await writer.send(session_message)
                except Exception:
                    logger.exception("SSE response error")
                    await sse_stream_writer.aclose()
                    await sse_stream_reader.aclose()
                    await self._clean_up_memory_streams(request_id)
                finally:
                    await sse_stream_writer.aclose()
                    await sse_stream_reader.aclose()

        except Exception as err:  # pragma: no cover
            logger.exception("Error handling POST request")
            response = self._create_error_response(
                f"Error handling POST request: {err}",
                HTTPStatus.INTERNAL_SERVER_ERROR,
                INTERNAL_ERROR,
            )
            await response(scope, receive, send)
            if writer:
                await writer.send(Exception(err))
            return

    async def _handle_get_request(
        self, request: Request, send: Send
    ) -> None:  # pragma: no cover
        writer = self._read_stream_writer
        if writer is None:
            raise ValueError(
                "No read stream writer available. Ensure connect() is called first."
            )

        _, has_sse = self._check_accept_headers(request)

        if not has_sse:
            response = self._create_error_response(
                "Not Acceptable: Client must accept text/event-stream",
                HTTPStatus.NOT_ACCEPTABLE,
            )
            await response(request.scope, request.receive, send)
            return

        if not await self._validate_request_headers(request, send):
            return

        if last_event_id := request.headers.get(LAST_EVENT_ID_HEADER):
            await self._replay_events(last_event_id, request, send)
            return

        headers = {
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "Content-Type": CONTENT_TYPE_SSE,
        }

        if self.mcp_session_id:
            headers[MCP_SESSION_ID_HEADER] = self.mcp_session_id

        if GET_STREAM_KEY in self._request_streams:
            response = self._create_error_response(
                "Conflict: Only one SSE stream is allowed per session",
                HTTPStatus.CONFLICT,
            )
            await response(request.scope, request.receive, send)
            return

        sse_stream_writer, sse_stream_reader = anyio.create_memory_object_stream[
            dict[str, str]
        ](0)

        async def standalone_sse_writer() -> None:
            try:
                self._request_streams[GET_STREAM_KEY] = (
                    anyio.create_memory_object_stream[EventMessage](0)
                )
                standalone_stream_reader = self._request_streams[GET_STREAM_KEY][1]

                async with sse_stream_writer, standalone_stream_reader:
                    async for event_message in standalone_stream_reader:
                        event_data = self._create_event_data(event_message)
                        await sse_stream_writer.send(event_data)
            except Exception:
                logger.exception("Error in standalone SSE writer")
            finally:
                logger.debug("Closing standalone SSE writer")
                await self._clean_up_memory_streams(GET_STREAM_KEY)

        response = EventSourceResponse(
            content=sse_stream_reader,
            data_sender_callable=standalone_sse_writer,
            headers=headers,
        )

        try:
            await response(request.scope, request.receive, send)
        except Exception:
            logger.exception("Error in standalone SSE response")
            await sse_stream_writer.aclose()
            await sse_stream_reader.aclose()
            await self._clean_up_memory_streams(GET_STREAM_KEY)
        finally:
            await sse_stream_writer.aclose()
            await sse_stream_reader.aclose()


class _SettaStreamableHTTPSessionManager(StreamableHTTPSessionManager):
    async def _handle_stateless_request(
        self, scope: Scope, receive: Receive, send: Send
    ) -> None:
        logger.debug("Stateless mode: Creating new transport for this request")
        http_transport = _SettaStreamableHTTPServerTransport(
            mcp_session_id=None,
            is_json_response_enabled=self.json_response,
            event_store=None,
            security_settings=self.security_settings,
        )

        async def run_stateless_server(
            *, task_status: anyio.abc.TaskStatus[None] = anyio.TASK_STATUS_IGNORED
        ):
            async with http_transport.connect() as streams:
                read_stream, write_stream = streams
                task_status.started()
                try:
                    await self.app.run(
                        read_stream,
                        write_stream,
                        self.app.create_initialization_options(),
                        stateless=True,
                    )
                except Exception:  # pragma: no cover
                    logger.exception("Stateless session crashed")

        assert self._task_group is not None
        await self._task_group.start(run_stateless_server)
        await http_transport.handle_request(scope, receive, send)
        await http_transport.terminate()

    async def _handle_stateful_request(
        self, scope: Scope, receive: Receive, send: Send
    ) -> None:
        request = Request(scope, receive)
        request_mcp_session_id = request.headers.get(MCP_SESSION_ID_HEADER)

        if (
            request_mcp_session_id is not None
            and request_mcp_session_id in self._server_instances
        ):  # pragma: no cover
            transport = self._server_instances[request_mcp_session_id]
            logger.debug("Session already exists, handling request directly")
            await transport.handle_request(scope, receive, send)
            return

        if request_mcp_session_id is None:
            logger.debug("Creating new transport")
            async with self._session_creation_lock:
                new_session_id = uuid4().hex
                http_transport = _SettaStreamableHTTPServerTransport(
                    mcp_session_id=new_session_id,
                    is_json_response_enabled=self.json_response,
                    event_store=self.event_store,
                    security_settings=self.security_settings,
                    retry_interval=self.retry_interval,
                )

                assert http_transport.mcp_session_id is not None
                self._server_instances[http_transport.mcp_session_id] = http_transport
                logger.info("Created new transport with session ID: %s", new_session_id)

                async def run_server(
                    *,
                    task_status: anyio.abc.TaskStatus[None] = anyio.TASK_STATUS_IGNORED,
                ) -> None:
                    async with http_transport.connect() as streams:
                        read_stream, write_stream = streams
                        task_status.started()
                        try:
                            await self.app.run(
                                read_stream,
                                write_stream,
                                self.app.create_initialization_options(),
                                stateless=False,
                            )
                        except Exception as exc:
                            logger.error(
                                "Session %s crashed: %s",
                                http_transport.mcp_session_id,
                                exc,
                                exc_info=True,
                            )
                        finally:
                            if (
                                http_transport.mcp_session_id
                                and http_transport.mcp_session_id
                                in self._server_instances
                                and not http_transport.is_terminated
                            ):
                                logger.info(
                                    "Cleaning up crashed session %s from active instances.",
                                    http_transport.mcp_session_id,
                                )
                                del self._server_instances[
                                    http_transport.mcp_session_id
                                ]

                assert self._task_group is not None
                await self._task_group.start(run_server)

                await http_transport.handle_request(scope, receive, send)
        else:  # pragma: no cover
            response = Response(
                "Bad Request: No valid session ID provided",
                status_code=HTTPStatus.BAD_REQUEST,
            )
            await response(scope, receive, send)


class SettaFastMCP(FastMCP):
    def __init__(
        self,
        app: FastAPI,
        state: "SettaFastAPIState",
        mount_path: str,
        name: str,
        websocket_msg_handler: WMHFrontendSender,
        dbe: DBE,
        instructions=None,
        **settings,
    ):
        super().__init__(name=name, instructions=instructions, **settings)
        self.state = state
        self.dbe = dbe
        self._temporary_id_map_mtime_ns: int | None = None
        self.temporary_to_canonical = {}
        self.canonical_to_temporary = {}
        self._streamable_stop_event: asyncio.Event | None = None
        self._streamable_manager_task: asyncio.Task[None] | None = None
        self._refresh_temporary_id_map_if_needed()
        msg_path = f"{mount_path}/messages/"
        sse_transport = _SettaSseServerTransport(msg_path)
        streamable_path = f"{mount_path}/streamable"

        async def handle_mcp_connection(request: Request):
            async with sse_transport.connect_sse(
                request.scope, request.receive, request._send
            ) as streams:
                read_stream, write_stream = streams
                try:
                    await self._mcp_server.run(
                        read_stream,
                        write_stream,
                        self._mcp_server.create_initialization_options(),
                    )
                finally:
                    await read_stream.aclose()
                    await write_stream.aclose()

        app.get(mount_path)(handle_mcp_connection)
        app.mount(msg_path, app=sse_transport.handle_post_message)
        streamable_app = self._build_streamable_http_app()
        app.mount(streamable_path, app=streamable_app)
        self._register_streamable_manager(app)
        _move_catch_all_route_to_end(app)

        self.add_setta_tools()
        spawn_background_task(
            websocket_msg_handler.log_and_broadcast_backend_log_event(
                "MCP Server Ready"
            ),
            label="mcp-server-ready",
            extra_values={"mount_path": mount_path},
        )

    def _build_streamable_http_app(self) -> Starlette:
        original_path = self.settings.streamable_http_path
        self.settings.streamable_http_path = "/"
        try:
            return self.streamable_http_app()
        finally:
            self.settings.streamable_http_path = original_path

    def streamable_http_app(self) -> Starlette:
        if self._session_manager is None:
            self._session_manager = _SettaStreamableHTTPSessionManager(
                app=self._mcp_server,
                event_store=self._event_store,
                retry_interval=self._retry_interval,
                json_response=self.settings.json_response,
                stateless=self.settings.stateless_http,
                security_settings=self.settings.transport_security,
            )
        return super().streamable_http_app()

    def _register_streamable_manager(self, app: FastAPI) -> None:
        app.add_event_handler("startup", self.start_streamable_manager)
        app.add_event_handler("shutdown", self.stop_streamable_manager)

    async def start_streamable_manager(self) -> None:
        if self._streamable_manager_task is not None:
            return
        self.streamable_http_app()
        session_manager = self.session_manager
        if self._streamable_stop_event is None or self._streamable_stop_event.is_set():
            self._streamable_stop_event = asyncio.Event()
        stop_event = self._streamable_stop_event

        async def _run_manager() -> None:
            async with session_manager.run():
                await stop_event.wait()

        self._streamable_manager_task = asyncio.create_task(_run_manager())

    async def stop_streamable_manager(self) -> None:
        if self._streamable_stop_event is None:
            return
        self._streamable_stop_event.set()
        await self.terminate_streamable_sessions()
        if self._streamable_manager_task is not None:
            try:
                await asyncio.wait_for(self._streamable_manager_task, timeout=5)
            except asyncio.TimeoutError:
                self._streamable_manager_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await self._streamable_manager_task
        self._streamable_manager_task = None
        self._session_manager = None
        self._streamable_stop_event = None

    async def terminate_streamable_sessions(self) -> None:
        session_manager = getattr(self, "_session_manager", None)
        if session_manager is None:
            return
        instances = getattr(session_manager, "_server_instances", None)
        if not isinstance(instances, dict):
            return
        for transport in list(instances.values()):
            terminate = getattr(transport, "terminate", None)
            if callable(terminate):
                with contextlib.suppress(Exception):
                    await terminate()
        instances.clear()

    def add_setta_tools(self):
        for fn in SETTA_INIT_MCP_TOOLS:
            self._register_setta_tool(fn, SettaToolType.init)
        for fn in SETTA_MCP_TOOLS:
            self._register_setta_tool(fn, SettaToolType.discoverable)

    def _register_setta_tool(
        self, fn: Callable[..., Any], tool_type: SettaToolType
    ) -> None:
        register_setta_tool(
            self._tool_manager, self.setta_id_transformer(fn), tool_type
        )

    def list_registered_tools(self):
        return self._tool_manager.list_tools()

    def get_tool(self, name: str) -> Tool | None:
        return self._tool_manager.get_tool(name)

    def setta_id_transformer(self, func):
        is_async = inspect.iscoroutinefunction(func)

        @wraps(func)
        async def wrapper(**kwargs):
            self._refresh_temporary_id_map_if_needed()
            context_kwargs = {k: v for k, v in kwargs.items() if isinstance(v, Context)}
            for key in context_kwargs:
                kwargs.pop(key)
            kwargs = convert_temporary_ids_to_canonical(
                kwargs, self.temporary_to_canonical
            )
            result = func(**kwargs, **context_kwargs)
            if is_async:
                result = await result
            result = convert_canonical_ids_to_temporary(
                result,
                self.canonical_to_temporary,
                self.temporary_to_canonical,
            )
            self.dbe.write_temporary_id_map(self.canonical_to_temporary)
            return result

        return wrapper

    def _refresh_temporary_id_map_if_needed(self) -> None:
        path = self.dbe.temporary_id_map
        mtime_ns = path.stat().st_mtime_ns if path.exists() else None
        if mtime_ns == self._temporary_id_map_mtime_ns:
            return
        (
            self.temporary_to_canonical,
            self.canonical_to_temporary,
        ) = self.dbe.read_temporary_id_map()
        self._temporary_id_map_mtime_ns = mtime_ns
