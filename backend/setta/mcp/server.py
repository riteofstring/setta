# some parts borrowed from https://github.com/tadata-org/fastapi_mcp/blob/main/fastapi_mcp/server.py

import asyncio
import contextlib
import inspect
import json
import logging
import weakref
from dataclasses import dataclass
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

from setta.agentic.agentic_scope import (
    AgenticContext,
    AgenticScope,
    AgenticScopeCheck,
    build_code_obj_id_to_section_ids_index,
    build_missing_edge_hints,
    build_scope_blocked_tool_result,
    check_agentic_scope_for_tool,
    resolve_agentic_scope,
)
from setta.database.db_objs import DBE
from setta.logging.tasks import spawn_background_task
from setta.mcp.agentic_context_headers import (
    AGENTIC_CONTEXT_CHAT_ID_HEADER,
    AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER,
    AGENTIC_CONTEXT_SECTION_ID_HEADER,
)
from setta.mcp.id_path_utils import collect_ai_follow_ids_from_paths
from setta.mcp.tool_metadata import SettaToolType
from setta.mcp.tool_registry import register_setta_tool
from setta.mcp.tool_setup import SETTA_INIT_MCP_TOOLS, SETTA_MCP_TOOLS
from setta.mcp.utils import (
    convert_canonical_ids_to_temporary,
    convert_temporary_ids_to_canonical,
)
from setta.types.helpers_lvl3 import (
    build_project_state_summary,
    convert_backend_to_single_config,
    filter_lsp_diagnostics_payload,
    filter_project_state_summary,
)
from setta.types.id import ID
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

if TYPE_CHECKING:
    from setta.server_state import SettaFastAPIState

logger = logging.getLogger(__name__)
_CATCH_ALL_PATH = "/{full_path:path}"
AGENTIC_SCOPE_CACHE_MAX_ENTRIES_PER_SESSION = 32


@dataclass(frozen=True)
class _CachedAgenticScope:
    project_state_revision: int
    project_state_single: object
    scope: AgenticScope
    code_obj_id_to_section_ids: dict[ID, set[ID]] | None = None


def _parse_meta_id(value: Any) -> ID | None:
    if value is None:
        return None
    if isinstance(value, ID):
        return value
    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return None
        return ID(normalized)
    raise TypeError("Agentic context ids must be strings")


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
                        except Exception:
                            logger.exception(
                                "Session %s crashed.",
                                http_transport.mcp_session_id,
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
        self._agentic_context_by_session: weakref.WeakKeyDictionary[
            Any, AgenticContext
        ] = weakref.WeakKeyDictionary()
        self._agentic_scope_cache_by_session: weakref.WeakKeyDictionary[
            Any, dict[tuple[str | None, ID, ID | None], _CachedAgenticScope]
        ] = weakref.WeakKeyDictionary()
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

    def set_agentic_context_for_session(
        self,
        ctx: Context,
        context: AgenticContext,
    ) -> None:
        session = self._resolve_agentic_session(ctx)
        if session is None:
            raise ValueError("Unable to resolve MCP session for agentic context.")
        try:
            weakref.ref(session)
        except TypeError as exc:
            raise TypeError(
                "MCP session is not weakrefable; provide agentic context via MCP meta or request headers instead."
            ) from exc
        self._agentic_context_by_session[session] = context

    def _resolve_agentic_context(self, ctx: Context) -> AgenticContext | None:
        def _canonicalize(value: ID | None) -> ID | None:
            if value is None:
                return None
            return self.temporary_to_canonical.get(value, value)

        meta = ctx.request_context.meta
        if meta is not None:
            payload = meta.model_dump()
            project_config_id = _parse_meta_id(payload.get("projectConfigId"))
            if project_config_id is not None:
                project_config_id = _canonicalize(project_config_id)
                chat_id = _canonicalize(_parse_meta_id(payload.get("chatId")))
                section_id = _canonicalize(_parse_meta_id(payload.get("sectionId")))
                return AgenticContext(
                    project_config_id=project_config_id,
                    chat_id=chat_id,
                    section_id=section_id,
                )
        request = ctx.request_context.request
        if request is not None and hasattr(request, "headers"):
            headers = request.headers
            project_config_id = _parse_meta_id(
                headers.get(AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER)
            )
            if project_config_id is not None:
                project_config_id = _canonicalize(project_config_id)
                chat_id = _canonicalize(
                    _parse_meta_id(headers.get(AGENTIC_CONTEXT_CHAT_ID_HEADER))
                )
                section_id = _canonicalize(
                    _parse_meta_id(headers.get(AGENTIC_CONTEXT_SECTION_ID_HEADER))
                )
                return AgenticContext(
                    project_config_id=project_config_id,
                    chat_id=chat_id,
                    section_id=section_id,
                )
        session = self._resolve_agentic_session(ctx)
        if session is None:
            return None
        return self._agentic_context_by_session.get(session)

    @staticmethod
    def _resolve_agentic_session(ctx: Context) -> object | None:
        try:
            request_context = ctx.request_context
        except ValueError:
            return None
        return getattr(request_context, "session", None)

    def _resolve_share_session_id(self, ctx: Context) -> str | None:
        meta = ctx.request_context.meta
        if meta is None:
            return None
        payload = meta.model_dump()
        raw = payload.get("shareSessionId")
        if raw is None:
            return None
        if not isinstance(raw, str):
            raise TypeError("shareSessionId must be a string")
        return raw or None

    def setta_id_transformer(self, func):
        is_async = inspect.iscoroutinefunction(func)

        @wraps(func)
        async def wrapper(**kwargs):
            self._refresh_temporary_id_map_if_needed()
            context_kwargs = {k: v for k, v in kwargs.items() if isinstance(v, Context)}
            for key in context_kwargs:
                kwargs.pop(key)
            ctx = next(iter(context_kwargs.values()), None)
            tool_name = func.__name__
            agentic_context = None
            has_request_context = False
            if ctx is not None:
                try:
                    _ = ctx.request_context
                    has_request_context = True
                except ValueError:
                    # Internal calls (tests, local helpers) may construct a Context
                    # without a request context. Treat those as unscoped.
                    has_request_context = False
                if has_request_context:
                    agentic_context = self._resolve_agentic_context(ctx)
            if (
                tool_name != "set_agentic_context"
                and ctx is not None
                and has_request_context
            ):
                if agentic_context is None:
                    logger.warning(
                        "Blocked MCP tool %s due to missing agentic context.",
                        tool_name,
                    )
                    scope_check = AgenticScopeCheck(
                        allowed=False,
                        access_type="structural",
                        target_section_ids=set(),
                        blocked_section_ids=set(),
                        unmapped_code_obj_ids=set(),
                        reason="missing_context",
                    )
                    result = build_scope_blocked_tool_result(
                        tool_name=tool_name,
                        scope_check=scope_check,
                        agentic_context=None,
                        missing_edges=[],
                    )
                    map_size_before = len(self.canonical_to_temporary)
                    result = convert_canonical_ids_to_temporary(
                        result,
                        self.canonical_to_temporary,
                        self.temporary_to_canonical,
                    )
                    if len(self.canonical_to_temporary) != map_size_before:
                        self.dbe.write_temporary_id_map(self.canonical_to_temporary)
                    return result
            kwargs = convert_temporary_ids_to_canonical(
                kwargs, self.temporary_to_canonical
            )
            scope = None
            project_state = None
            code_obj_id_to_section_ids = None
            scope_cache = None
            cache_key = None
            session = None
            project_state_revision = None
            annotations = None
            if tool_name != "set_agentic_context" and agentic_context is not None:
                share_session_id = (
                    self._resolve_share_session_id(ctx)
                    if ctx is not None and has_request_context
                    else None
                )
                session = (
                    self._resolve_agentic_session(ctx)
                    if ctx is not None and has_request_context
                    else None
                )
                if session is not None:
                    try:
                        weakref.ref(session)
                    except TypeError:
                        session = None
                manager = self.state.project_manager_switcher.get(
                    agentic_context.project_config_id,
                    share_session_id=share_session_id,
                )
                project_state_backend = manager.project_state_backend
                project_state_revision = manager.history.revision
                cache_key = (
                    share_session_id,
                    agentic_context.project_config_id,
                    agentic_context.section_id,
                )
                if session is not None:
                    scope_cache = self._agentic_scope_cache_by_session.get(session)
                    if scope_cache is None:
                        scope_cache = {}
                        self._agentic_scope_cache_by_session[session] = scope_cache
                    cached_scope = scope_cache.get(cache_key)
                    if (
                        cached_scope is not None
                        and cached_scope.project_state_revision
                        == project_state_revision
                    ):
                        project_state = cached_scope.project_state_single
                        scope = cached_scope.scope
                        code_obj_id_to_section_ids = (
                            cached_scope.code_obj_id_to_section_ids
                        )
                        # Bump insertion order to approximate an LRU cache.
                        scope_cache.pop(cache_key, None)
                        scope_cache[cache_key] = cached_scope
                    else:
                        project_state = convert_backend_to_single_config(
                            project_state_backend,
                            agentic_context.project_config_id,
                        )
                        scope = resolve_agentic_scope(
                            project_state, agentic_context.section_id
                        )
                        scope_cache[cache_key] = _CachedAgenticScope(
                            project_state_revision=project_state_revision,
                            project_state_single=project_state,
                            scope=scope,
                            code_obj_id_to_section_ids=None,
                        )
                        if len(scope_cache) > AGENTIC_SCOPE_CACHE_MAX_ENTRIES_PER_SESSION:
                            scope_cache.pop(next(iter(scope_cache)))
                else:
                    project_state = convert_backend_to_single_config(
                        project_state_backend,
                        agentic_context.project_config_id,
                    )
                    scope = resolve_agentic_scope(
                        project_state, agentic_context.section_id
                    )
                logger.debug(
                    "Resolved agentic scope (project=%s chat=%s section=%s read=%s write=%s context=%s structural=%s)",
                    agentic_context.project_config_id,
                    agentic_context.chat_id,
                    agentic_context.section_id,
                    len(scope.read_section_ids),
                    len(scope.write_section_ids),
                    len(scope.context_section_ids),
                    scope.structural_allowed,
                )
                tool = self._tool_manager.get_tool(tool_name)
                annotations = tool.annotations if tool else None
                if (
                    code_obj_id_to_section_ids is None
                    and annotations is not None
                    and project_state is not None
                ):
                    id_paths_by_type = dict(
                        getattr(annotations, "idPathsByType", {}) or {}
                    )
                    if id_paths_by_type.get("codeObj"):
                        ids_by_type, _ = collect_ai_follow_ids_from_paths(
                            kwargs,
                            id_paths_by_type,
                            allow_dict_keys=True,
                        )
                        code_obj_ids = set(ids_by_type.get("codeObj", set()))
                        if self.temporary_to_canonical:
                            code_obj_ids = {
                                self.temporary_to_canonical.get(entry, entry)
                                for entry in code_obj_ids
                            }
                        if code_obj_ids:
                            code_obj_id_to_section_ids = (
                                build_code_obj_id_to_section_ids_index(project_state)
                            )
                            if (
                                session is not None
                                and scope_cache is not None
                                and cache_key is not None
                                and project_state_revision is not None
                                and scope is not None
                            ):
                                scope_cache[cache_key] = _CachedAgenticScope(
                                    project_state_revision=project_state_revision,
                                    project_state_single=project_state,
                                    scope=scope,
                                    code_obj_id_to_section_ids=code_obj_id_to_section_ids,
                                )
                scope_check = check_agentic_scope_for_tool(
                    tool_args=kwargs,
                    annotations=annotations,
                    project_state=project_state,
                    scope=scope,
                    temporary_to_canonical=self.temporary_to_canonical,
                    code_obj_id_to_section_ids=code_obj_id_to_section_ids,
                )
                if not scope_check.allowed:
                    missing_edges = build_missing_edge_hints(
                        chat_section_id=agentic_context.section_id,
                        blocked_section_ids=scope_check.blocked_section_ids,
                        access_type=scope_check.access_type,
                        project_state=project_state,
                    )
                    logger.warning(
                        "Blocked MCP tool %s by agentic scope (project=%s chat=%s section=%s blocked=%s).",
                        tool_name,
                        agentic_context.project_config_id,
                        agentic_context.chat_id,
                        agentic_context.section_id,
                        sorted(scope_check.blocked_section_ids),
                    )
                    result = build_scope_blocked_tool_result(
                        tool_name=tool_name,
                        scope_check=scope_check,
                        agentic_context=agentic_context,
                        missing_edges=missing_edges,
                    )
                    map_size_before = len(self.canonical_to_temporary)
                    result = convert_canonical_ids_to_temporary(
                        result,
                        self.canonical_to_temporary,
                        self.temporary_to_canonical,
                    )
                    if len(self.canonical_to_temporary) != map_size_before:
                        self.dbe.write_temporary_id_map(self.canonical_to_temporary)
                    return result
            result_filter = (
                getattr(annotations, "resultFilter", None)
                if annotations is not None
                else None
            )
            if (
                result_filter == "project_state_summary"
                and scope is not None
                and project_state is not None
            ):
                allowed_ids = scope.effective_read_section_ids()
                result = build_project_state_summary(
                    project_state,
                    allowed_section_ids=allowed_ids,
                )
            else:
                result = func(**kwargs, **context_kwargs)
                if is_async:
                    result = await result
                if (
                    result_filter == "project_state_summary"
                    and scope is not None
                    and project_state is not None
                ):
                    allowed_ids = scope.effective_read_section_ids()
                    result = filter_project_state_summary(result, allowed_ids)
                if (
                    result_filter == "lsp_diagnostics"
                    and scope is not None
                    and project_state is not None
                ):
                    allowed_ids = scope.effective_read_section_ids()
                    result = filter_lsp_diagnostics_payload(
                        result,
                        allowed_ids,
                        include_unmapped=scope.structural_allowed,
                    )
            map_size_before = len(self.canonical_to_temporary)
            result = convert_canonical_ids_to_temporary(
                result,
                self.canonical_to_temporary,
                self.temporary_to_canonical,
            )
            if len(self.canonical_to_temporary) != map_size_before:
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
