import asyncio
import contextlib
import importlib.machinery
import importlib.util
import inspect
import json
import os
import pathlib
import re
import stat
import sys
import tempfile
import threading
import time
import traceback

MAXIMUM_FRAME_BYTES = 4 << 20
MAXIMUM_HEADER_BYTES = 8 << 10
MAXIMUM_ARTIFACT_BYTES = 256 << 20
MAXIMUM_ARTIFACT_SESSION_BYTES = 512 << 20
PROTOCOL_VERSION = 1
NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,127}$")
APPLICATION_EXCEPTIONS = (Exception, GeneratorExit, KeyboardInterrupt, SystemExit)


class ProtocolFailure(Exception):
    pass


class InvocationCancelled(Exception):
    pass


class EntrypointLoader(importlib.machinery.SourceFileLoader):
    def get_code(self, fullname):
        source = self.get_data(self.path)
        return self.source_to_code(source, self.path)


def _pairs_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ProtocolFailure("JSON object contains a duplicate field")
        result[key] = value
    return result


def _reject_constant(value):
    raise ProtocolFailure(f"JSON constant {value} is not supported")


def _read_exact(stream, length):
    result = bytearray()
    while len(result) < length:
        part = stream.read(length - len(result))
        if not part:
            raise EOFError("protocol stream ended inside a frame")
        result.extend(part)
    return bytes(result)


def _read_frame(stream):
    content_length = None
    header_bytes = 0
    while True:
        line = _read_header_line(stream)
        header_bytes += len(line)
        if header_bytes > MAXIMUM_HEADER_BYTES:
            raise ProtocolFailure("frame header exceeds the byte limit")
        line = line[:-2]
        if not line:
            break
        content_length = _parse_content_length(line, content_length)
    if content_length is None or content_length < 1:
        raise ProtocolFailure("Content-Length is missing or invalid")
    if content_length > MAXIMUM_FRAME_BYTES:
        raise ProtocolFailure("frame exceeds the byte limit")
    return _decode_frame(_read_exact(stream, content_length))


def _read_header_line(stream):
    line = stream.readline(MAXIMUM_HEADER_BYTES + 1)
    if not line:
        raise EOFError("protocol stream ended")
    if len(line) > MAXIMUM_HEADER_BYTES:
        raise ProtocolFailure("frame header exceeds the byte limit")
    if not line.endswith(b"\r\n"):
        raise ProtocolFailure("frame header does not use CRLF")
    return line


def _parse_content_length(line, current):
    try:
        key, value = line.decode("ascii").split(":", 1)
    except (UnicodeDecodeError, ValueError) as error:
        raise ProtocolFailure("frame header is invalid") from error
    if key.lower() != "content-length" or current is not None:
        raise ProtocolFailure("frame header is unsupported or repeated")
    value = value.strip()
    if not value or not value.isascii() or not value.isdecimal():
        raise ProtocolFailure("Content-Length is invalid")
    return int(value)


def _decode_frame(body):
    try:
        return json.loads(
            body,
            object_pairs_hook=_pairs_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProtocolFailure("frame body is not strict JSON") from error


def _encode_frame(value):
    try:
        body = json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise ProtocolFailure("protocol value is not portable JSON") from error
    if not body or len(body) > MAXIMUM_FRAME_BYTES:
        raise ProtocolFailure("encoded frame exceeds the byte limit")
    return f"Content-Length: {len(body)}\r\n\r\n".encode("ascii") + body


def _exact_object(value, required, optional=()):
    if not isinstance(value, dict):
        raise ProtocolFailure("protocol value is not an object")
    allowed = set(required) | set(optional)
    if set(value) != set(required) and not (
        set(required).issubset(value) and set(value).issubset(allowed)
    ):
        raise ProtocolFailure("protocol object fields are not exact")
    return value


def _valid_id(value):
    return isinstance(value, (str, int)) and not isinstance(value, bool) and value != ""


def _structured_error(code, message):
    text = str(message).strip()
    if not text:
        text = code
    return {"code": code, "message": text[:4096]}


def _resolve_outputs(value):
    outputs = value if isinstance(value, dict) else {"value": value}
    for key in outputs:
        if not isinstance(key, str) or not NAME_PATTERN.fullmatch(key):
            raise ProtocolFailure("handler output name is invalid")
    _encode_frame(outputs)
    return outputs


def _resolve_update(value):
    if not isinstance(value, dict) or set(value) != {
        "outputs",
        "progress",
        "message",
        "artifacts",
    }:
        return {
            "progress": None,
            "message": "",
            "outputs": _resolve_outputs(value),
            "artifacts": [],
        }
    _exact_object(value, ("outputs", "progress", "message", "artifacts"))
    progress = value["progress"]
    if progress is not None and (
        isinstance(progress, bool)
        or not isinstance(progress, (int, float))
        or progress < 0
        or progress > 1
    ):
        raise ProtocolFailure("handler update progress is invalid")
    message = value["message"]
    if not isinstance(message, str) or "\x00" in message:
        raise ProtocolFailure("handler update message is invalid")
    artifacts = value["artifacts"]
    if not isinstance(artifacts, list):
        raise ProtocolFailure("handler update artifacts are invalid")
    for artifact in artifacts:
        _exact_object(artifact, ("name", "mediaType", "path"))
        if (
            not isinstance(artifact["name"], str)
            or not NAME_PATTERN.fullmatch(artifact["name"])
            or not isinstance(artifact["mediaType"], str)
            or not artifact["mediaType"].strip()
            or not isinstance(artifact["path"], str)
            or not artifact["path"].strip()
        ):
            raise ProtocolFailure("handler update artifact is invalid")
    update = {
        "progress": progress,
        "message": message,
        "outputs": _resolve_outputs(value["outputs"]),
        "artifacts": artifacts,
    }
    _encode_frame(update)
    return update


def _run_awaitable(value):
    if inspect.isawaitable(value):
        return asyncio.run(value)
    return value


def _run_bounded(function, timeout):
    result = {}

    def invoke():
        try:
            result["value"] = _run_awaitable(function())
        except APPLICATION_EXCEPTIONS as error:
            result["error"] = error

    thread = threading.Thread(target=invoke, daemon=True)
    thread.start()
    thread.join(timeout=timeout)
    if thread.is_alive():
        return False
    if "error" in result:
        raise result["error"]
    return True


def _tree_bytes(root):
    total = 0
    for directory, _, names in os.walk(root, followlinks=False):
        for name in names:
            candidate = pathlib.Path(directory) / name
            try:
                candidate_stat = candidate.lstat()
            except OSError:
                continue
            if stat.S_ISREG(candidate_stat.st_mode):
                total += candidate_stat.st_size
    return total


class Invocation:
    def __init__(self, request_id, params, worker):
        self.request_id = request_id
        self.params = params
        self.worker = worker
        self.cancelled = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self.thread.start()

    def cancel(self):
        self.cancelled.set()

    def _check_cancelled(self):
        if self.cancelled.is_set():
            raise InvocationCancelled()

    def _send_update(self, value):
        self._check_cancelled()
        update = _resolve_update(value)
        update["artifacts"] = self.worker.stage_artifacts(
            self.params["identity"], update["artifacts"]
        )
        self.worker.send(
            {
                "jsonrpc": "2.0",
                "method": "runtime/update",
                "params": {
                    "identity": self.params["identity"],
                    "progress": update["progress"],
                    "message": update["message"],
                    "outputs": update["outputs"],
                    "artifacts": update["artifacts"],
                },
            }
        )

    def _consume_generator(self, generator):
        try:
            for value in generator:
                self._send_update(value)
            self._check_cancelled()
        finally:
            if self.cancelled.is_set():
                generator.close()

    async def _consume_async_generator(self, generator):
        try:
            while True:
                next_value = asyncio.create_task(generator.__anext__())
                while not next_value.done():
                    if self.cancelled.is_set():
                        next_value.cancel()
                        with contextlib.suppress(asyncio.CancelledError):
                            await next_value
                        raise InvocationCancelled()
                    await asyncio.sleep(0.01)
                try:
                    value = next_value.result()
                except StopAsyncIteration:
                    break
                self._send_update(value)
            self._check_cancelled()
        finally:
            if self.cancelled.is_set():
                await generator.aclose()

    async def _await_with_cancellation(self, awaitable):
        task = asyncio.ensure_future(awaitable)
        while not task.done():
            if self.cancelled.is_set():
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
                raise InvocationCancelled()
            await asyncio.sleep(0.01)
        return task.result()

    def _invoke(self):
        self._check_cancelled()
        handler_name = self.params["handler"]
        handler = self.worker.handlers.get(handler_name)
        if handler is None:
            raise LookupError(f"handler {handler_name!r} is not registered")
        result = handler(**self.params["arguments"])
        if inspect.isasyncgen(result):
            asyncio.run(self._consume_async_generator(result))
            return {}
        if inspect.isgenerator(result):
            self._consume_generator(result)
            return {}
        if inspect.isawaitable(result):
            result = asyncio.run(self._await_with_cancellation(result))
        self._check_cancelled()
        return _resolve_outputs(result)

    def _run(self):
        try:
            outputs = self._invoke()
            result = {"outputs": outputs, "error": None}
        except InvocationCancelled:
            result = {
                "outputs": {},
                "error": _structured_error("cancelled", "Invocation was cancelled."),
            }
        except LookupError as error:
            result = {
                "outputs": {},
                "error": _structured_error("handler_not_found", error),
            }
        except ProtocolFailure as error:
            result = {
                "outputs": {},
                "error": _structured_error("invalid_result", error),
            }
        except APPLICATION_EXCEPTIONS as error:
            traceback.print_exc(file=sys.stderr)
            result = {
                "outputs": {},
                "error": _structured_error("handler_error", error),
            }
        try:
            self.worker.send(
                {"jsonrpc": "2.0", "id": self.request_id, "result": result}
            )
        finally:
            self.worker.finish_invocation(self.request_id)


class Worker:
    def __init__(self, input_stream, output_stream):
        self.input = input_stream
        self.output = output_stream
        self.output_lock = threading.Lock()
        self.state_lock = threading.Lock()
        self.artifact_lock = threading.Lock()
        self.module = None
        self.project_root = None
        self.handlers = {}
        self.load_error = None
        self.initialized = False
        self.invocations = {}
        self.stopping = False

    def send(self, value):
        frame = _encode_frame(value)
        with self.output_lock:
            self.output.write(frame)
            self.output.flush()

    def finish_invocation(self, request_id):
        with self.state_lock:
            self.invocations.pop(request_id, None)

    def _load(self, params):
        _exact_object(params, ("protocolVersion", "projectRoot", "entrypoint"))
        if params["protocolVersion"] != PROTOCOL_VERSION:
            raise ProtocolFailure("worker protocol version is unsupported")
        project_root = pathlib.Path(params["projectRoot"])
        if not project_root.is_absolute() or not project_root.is_dir():
            raise ProtocolFailure("project root is invalid")
        entrypoint_path = self._resolve_entrypoint(project_root, params["entrypoint"])
        if str(project_root) not in sys.path:
            sys.path.insert(0, str(project_root))
        module, handlers = self._load_handlers(entrypoint_path)
        self._run_startup(module)
        self.module = module
        self.project_root = project_root.resolve()
        self.handlers = handlers

    def _resolve_entrypoint(self, project_root, value):
        entrypoint = pathlib.PurePath(value)
        if entrypoint.is_absolute() or ".." in entrypoint.parts:
            raise ProtocolFailure("entrypoint is invalid")
        entrypoint_path = (project_root / entrypoint).resolve()
        try:
            entrypoint_path.relative_to(project_root.resolve())
        except ValueError as error:
            raise ProtocolFailure("entrypoint leaves the project root") from error
        if not entrypoint_path.is_file():
            raise ProtocolFailure("entrypoint is missing")
        return entrypoint_path

    def _load_handlers(self, entrypoint_path):
        module_name = "setta_realtime_app"
        loader = EntrypointLoader(module_name, str(entrypoint_path))
        specification = importlib.util.spec_from_file_location(
            module_name, entrypoint_path, loader=loader
        )
        if specification is None or specification.loader is None:
            raise ProtocolFailure("entrypoint cannot be imported")
        module = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(module)
        handlers = getattr(module, "handlers", None)
        if not isinstance(handlers, dict):
            raise ProtocolFailure("entrypoint handlers must be a dictionary")
        for name, handler in handlers.items():
            if not isinstance(name, str) or not NAME_PATTERN.fullmatch(name):
                raise ProtocolFailure("entrypoint handler name is invalid")
            if not callable(handler):
                raise ProtocolFailure("entrypoint handler is not callable")
        return module, dict(handlers)

    def _run_startup(self, module):
        startup = getattr(module, "startup", None)
        if startup is not None:
            if not callable(startup):
                raise ProtocolFailure("entrypoint startup hook is not callable")
            _run_awaitable(startup())

    def stage_artifacts(self, identity, artifacts):
        if not artifacts:
            return []
        process_root, invocation_root = self._artifact_roots(identity)
        staged = []
        with self.artifact_lock:
            usage = _tree_bytes(process_root)
            if usage > MAXIMUM_ARTIFACT_SESSION_BYTES:
                raise ProtocolFailure("worker artifact capacity is exhausted")
            for artifact in artifacts:
                resolved, added = self._stage_artifact(artifact, invocation_root, usage)
                staged.append(resolved)
                usage += added
        return staged

    def _artifact_roots(self, identity):
        configured_root = os.environ.get("SETTA_WORKER_ARTIFACT_ROOT", "")
        if not configured_root:
            raise ProtocolFailure("worker artifact root is unavailable")
        process_root = pathlib.Path(configured_root).resolve()
        invocation_root = (process_root / identity["invocationId"]).resolve()
        try:
            invocation_root.relative_to(process_root)
        except ValueError as error:
            raise ProtocolFailure("invocation artifact root is invalid") from error
        if not invocation_root.is_dir():
            raise ProtocolFailure("invocation artifact root is unavailable")
        return process_root, invocation_root

    def _stage_artifact(self, artifact, invocation_root, usage):
        source = pathlib.Path(artifact["path"])
        if not source.is_absolute():
            if self.project_root is None:
                raise ProtocolFailure("project root is unavailable")
            source = self.project_root / source
        source = source.resolve()
        try:
            source_stat = source.stat()
        except OSError as error:
            raise ProtocolFailure("handler artifact is unavailable") from error
        if (
            not stat.S_ISREG(source_stat.st_mode)
            or source_stat.st_size > MAXIMUM_ARTIFACT_BYTES
        ):
            raise ProtocolFailure("handler artifact exceeds its boundary")
        destination, added = self._artifact_destination(
            source, invocation_root, artifact["name"], usage, source_stat.st_size
        )
        return {
            "name": artifact["name"],
            "mediaType": artifact["mediaType"],
            "path": str(destination.relative_to(invocation_root)),
        }, added

    def _artifact_destination(self, source, invocation_root, name, usage, size):
        artifact_root = (invocation_root / "artifacts").resolve()
        try:
            source.relative_to(artifact_root)
            return source, 0
        except ValueError:
            if usage + size > MAXIMUM_ARTIFACT_SESSION_BYTES:
                raise ProtocolFailure("worker artifact capacity is exhausted") from None
            return self._copy_artifact(source, invocation_root, name), size

    def _copy_artifact(self, source, invocation_root, name):
        try:
            source_stat = source.stat()
        except OSError as error:
            raise ProtocolFailure("handler artifact is unavailable") from error
        if not stat.S_ISREG(source_stat.st_mode):
            raise ProtocolFailure("handler artifact is not a regular file")
        destination_root = invocation_root / "artifacts"
        destination_root.mkdir(mode=0o700, exist_ok=True)
        descriptor, destination_name = tempfile.mkstemp(
            prefix=name + "-", dir=destination_root
        )
        destination = pathlib.Path(destination_name)
        written = 0
        try:
            with (
                source.open("rb") as input_stream,
                os.fdopen(descriptor, "wb") as output_stream,
            ):
                while True:
                    part = input_stream.read(1 << 20)
                    if not part:
                        break
                    written += len(part)
                    if written > MAXIMUM_ARTIFACT_BYTES:
                        raise ProtocolFailure("handler artifact exceeds the byte limit")
                    output_stream.write(part)
        except APPLICATION_EXCEPTIONS:
            destination.unlink(missing_ok=True)
            raise
        return destination

    def _initialize(self, request_id, params):
        if self.initialized:
            raise ProtocolFailure("worker is already initialized")
        self.initialized = True
        try:
            self._load(params)
        except APPLICATION_EXCEPTIONS as error:
            self.load_error = _structured_error("load_error", error)
            traceback.print_exc(file=sys.stderr)
        self.send(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "protocolVersion": PROTOCOL_VERSION,
                    "runtimeKind": "python",
                    "handlers": sorted(self.handlers),
                    "loadError": self.load_error,
                },
            }
        )

    def _invoke(self, request_id, params):
        if not self.initialized or self.load_error is not None or self.stopping:
            self.send(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "result": {
                        "outputs": {},
                        "error": _structured_error(
                            "worker_not_ready", "Worker is not ready."
                        ),
                    },
                }
            )
            return
        _exact_object(params, ("identity", "handler", "arguments", "content"))
        _exact_object(
            params["identity"],
            ("sessionId", "bindingId", "invocationId", "sequence"),
        )
        if not isinstance(params["handler"], str) or not NAME_PATTERN.fullmatch(
            params["handler"]
        ):
            raise ProtocolFailure("invoke handler is invalid")
        if not isinstance(params["arguments"], dict) or not isinstance(
            params["content"], list
        ):
            raise ProtocolFailure("invoke collections are invalid")
        for name in params["arguments"]:
            if not isinstance(name, str) or not NAME_PATTERN.fullmatch(name):
                raise ProtocolFailure("invoke argument name is invalid")
        for reference in params["content"]:
            _exact_object(
                reference,
                ("id", "mediaType", "byteLength", "sha256", "invocationId"),
            )
        invocation = Invocation(request_id, params, self)
        with self.state_lock:
            if request_id in self.invocations:
                raise ProtocolFailure("invoke request id is duplicated")
            self.invocations[request_id] = invocation
        invocation.start()

    def _cancel(self, params):
        _exact_object(params, ("id",))
        if not _valid_id(params["id"]):
            raise ProtocolFailure("cancel request id is invalid")
        with self.state_lock:
            invocation = self.invocations.get(params["id"])
        if invocation is not None:
            invocation.cancel()

    def _shutdown(self, request_id, params):
        _exact_object(params, ())
        self.stopping = True
        with self.state_lock:
            invocations = list(self.invocations.values())
        for invocation in invocations:
            invocation.cancel()
        deadline = time.monotonic() + 2
        for invocation in invocations:
            invocation.thread.join(timeout=max(0, deadline - time.monotonic()))
        shutdown = getattr(self.module, "shutdown", None) if self.module else None
        if shutdown is not None:
            if not callable(shutdown):
                raise ProtocolFailure("entrypoint shutdown hook is not callable")
            if not _run_bounded(shutdown, max(0, deadline - time.monotonic())):
                print("entrypoint shutdown hook exceeded its deadline", file=sys.stderr)
        self.send({"jsonrpc": "2.0", "id": request_id, "result": None})

    def _dispatch(self, message):
        _exact_object(message, ("jsonrpc", "method", "params"), ("id",))
        if message["jsonrpc"] != "2.0" or not isinstance(message["method"], str):
            raise ProtocolFailure("JSON-RPC request is invalid")
        request_id = message.get("id")
        method = message["method"]
        if method == "initialize" and _valid_id(request_id):
            self._initialize(request_id, message["params"])
            return True
        if method == "runtime/invoke" and _valid_id(request_id):
            self._invoke(request_id, message["params"])
            return True
        if method == "$/cancelRequest" and "id" not in message:
            self._cancel(message["params"])
            return True
        if method == "shutdown" and _valid_id(request_id):
            self._shutdown(request_id, message["params"])
            return False
        raise ProtocolFailure("JSON-RPC method or id is invalid")

    def run(self):
        while True:
            message = _read_frame(self.input)
            if not self._dispatch(message):
                return 0


def _protocol_streams():
    try:
        input_fd = int(os.environ["SETTA_WORKER_INPUT_FD"])
        output_fd = int(os.environ["SETTA_WORKER_OUTPUT_FD"])
    except (KeyError, ValueError) as error:
        raise ProtocolFailure("worker protocol descriptors are required") from error
    if input_fd < 3 or output_fd < 3 or input_fd == output_fd:
        raise ProtocolFailure("worker protocol descriptors are invalid")
    if os.name == "nt":
        import msvcrt

        input_fd = msvcrt.open_osfhandle(input_fd, os.O_RDONLY)
        output_fd = msvcrt.open_osfhandle(output_fd, os.O_WRONLY)
    return (
        os.fdopen(input_fd, "rb", buffering=0, closefd=False),
        os.fdopen(output_fd, "wb", buffering=0, closefd=False),
    )


def main():
    try:
        input_stream, output_stream = _protocol_streams()
        return Worker(input_stream, output_stream).run()
    except EOFError:
        return 0
    except (KeyError, OSError, ProtocolFailure, TypeError, ValueError):
        traceback.print_exc(file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
