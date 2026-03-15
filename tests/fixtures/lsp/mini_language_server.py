import json
import os
import re
import sys
import time


FIXTURE_COMPLETION_LABEL = "fixtureCompletion"
FIXTURE_ERROR_CODE = "fixture-ts"
FIXTURE_ERROR_TOKEN = "__fixture_error__"
FIXTURE_ERROR_MESSAGE = "Fixture TypeScript diagnostic"
FIXTURE_COMPLETION_DELAY_MS = int(os.environ.get("FIXTURE_COMPLETION_DELAY_MS", "0"))
FIXTURE_SIGNATURES = {
    "sorted": {
        "label": "sorted(iterable, /, *, key=None, reverse=False)",
        "documentation": "Return a new sorted list from the items in iterable.",
        "parameters": [
            {"label": "iterable", "documentation": "Values to sort."},
            {"label": "/", "documentation": ""},
            {"label": "*", "documentation": ""},
            {"label": "key=None", "documentation": "Optional sort key."},
            {"label": "reverse=False", "documentation": "Descending order flag."},
        ],
    },
    "str": {
        "label": "str(object='')",
        "documentation": "Return a string version of object.",
        "parameters": [
            {"label": "object=''", "documentation": "Object to stringify."},
        ],
    },
}


def _send(payload: dict) -> None:
    encoded = json.dumps(payload).encode("utf-8")
    header = f"Content-Length: {len(encoded)}\r\n\r\n".encode("utf-8")
    sys.stdout.buffer.write(header)
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def _read_message() -> dict | None:
    headers: dict[str, str] = {}
    while True:
        line = sys.stdin.buffer.readline()
        if line == b"":
            return None
        if line in {b"\n", b"\r\n"}:
            break
        decoded = line.decode("utf-8").strip()
        if decoded == "":
            break
        key, separator, value = decoded.partition(":")
        if separator != ":":
            continue
        headers[key.lower().strip()] = value.strip()

    content_length = int(headers.get("content-length", "0"))
    if content_length <= 0:
        return None
    body = sys.stdin.buffer.read(content_length)
    if body == b"" or len(body) < content_length:
        return None
    return json.loads(body.decode("utf-8"))


def _build_diagnostics(text: str) -> list[dict]:
    if FIXTURE_ERROR_TOKEN not in text:
        return []
    return [
        {
            "range": {
                "start": {"line": 0, "character": 0},
                "end": {"line": 0, "character": 1},
            },
            "severity": 1,
            "source": "fixture-ts-lsp",
            "code": FIXTURE_ERROR_CODE,
            "message": FIXTURE_ERROR_MESSAGE,
        }
    ]


def _publish_diagnostics(uri: str, version: int | None, text: str) -> None:
    _send(
        {
            "jsonrpc": "2.0",
            "method": "textDocument/publishDiagnostics",
            "params": {
                "uri": uri,
                "version": version,
                "diagnostics": _build_diagnostics(text),
            },
        }
    )


def _position_to_offset(text: str, line: int, character: int) -> int:
    current_line = 0
    current_character = 0
    for index, char in enumerate(text):
        if current_line == line and current_character == character:
            return index
        if char == "\n":
            current_line += 1
            current_character = 0
            continue
        current_character += 1
    return len(text)


def _callable_name_for_text(text: str, line: int, character: int) -> str | None:
    prefix = text[: _position_to_offset(text, line, character)]
    matches = re.findall(r"([A-Za-z_][A-Za-z0-9_\.]*)\(", prefix)
    if not matches:
        return None
    return matches[-1].split(".")[-1]


def _signature_help_result(text: str, line: int, character: int) -> dict:
    callable_name = _callable_name_for_text(text, line, character)
    if callable_name is None:
        return {"signatures": [], "activeSignature": 0, "activeParameter": 0}
    signature = FIXTURE_SIGNATURES.get(callable_name)
    if signature is None:
        return {"signatures": [], "activeSignature": 0, "activeParameter": 0}
    return {
        "signatures": [signature],
        "activeSignature": 0,
        "activeParameter": 0,
    }


def main() -> int:
    open_documents: dict[str, str] = {}
    while True:
        message = _read_message()
        if message is None:
            return 0
        method = message.get("method")
        message_id = message.get("id")
        params = message.get("params")

        if method == "initialize" and message_id is not None:
            _send(
                {
                    "jsonrpc": "2.0",
                    "id": message_id,
                    "result": {
                        "capabilities": {
                            "textDocumentSync": 2,
                            "completionProvider": {
                                "triggerCharacters": ["."]
                            },
                        }
                    },
                }
            )
            continue

        if method == "shutdown" and message_id is not None:
            _send({"jsonrpc": "2.0", "id": message_id, "result": None})
            continue

        if method == "exit":
            return 0

        if method in {"textDocument/didOpen", "textDocument/didChange"}:
            if not isinstance(params, dict):
                continue
            text_document = params.get("textDocument")
            if not isinstance(text_document, dict):
                continue
            uri = text_document.get("uri")
            if not isinstance(uri, str):
                continue
            version = text_document.get("version")
            text = ""
            if method == "textDocument/didOpen":
                raw_text = text_document.get("text")
                if isinstance(raw_text, str):
                    text = raw_text
            else:
                content_changes = params.get("contentChanges")
                if isinstance(content_changes, list) and len(content_changes) > 0:
                    first_change = content_changes[0]
                    if isinstance(first_change, dict):
                        raw_text = first_change.get("text")
                        if isinstance(raw_text, str):
                            text = raw_text
            open_documents[uri] = text
            _publish_diagnostics(uri, version if isinstance(version, int) else None, text)
            continue

        if method == "textDocument/didClose":
            if isinstance(params, dict):
                text_document = params.get("textDocument")
                if isinstance(text_document, dict):
                    uri = text_document.get("uri")
                    if isinstance(uri, str):
                        open_documents.pop(uri, None)
            continue

        if method == "textDocument/completion" and message_id is not None:
            if FIXTURE_COMPLETION_DELAY_MS > 0:
                time.sleep(FIXTURE_COMPLETION_DELAY_MS / 1000)
            _send(
                {
                    "jsonrpc": "2.0",
                    "id": message_id,
                    "result": {
                        "isIncomplete": False,
                        "items": [
                            {
                                "label": FIXTURE_COMPLETION_LABEL,
                                "kind": 6,
                                "insertText": FIXTURE_COMPLETION_LABEL,
                                "detail": "Fixture completion",
                            }
                        ],
                    },
                }
            )
            continue

        if method == "textDocument/signatureHelp" and message_id is not None:
            uri = None
            line = 0
            character = 0
            if isinstance(params, dict):
                text_document = params.get("textDocument")
                if isinstance(text_document, dict):
                    raw_uri = text_document.get("uri")
                    if isinstance(raw_uri, str):
                        uri = raw_uri
                position = params.get("position")
                if isinstance(position, dict):
                    raw_line = position.get("line")
                    raw_character = position.get("character")
                    if isinstance(raw_line, int):
                        line = raw_line
                    if isinstance(raw_character, int):
                        character = raw_character
            text = open_documents.get(uri or "", "")
            _send(
                {
                    "jsonrpc": "2.0",
                    "id": message_id,
                    "result": _signature_help_result(text, line, character),
                }
            )
            continue

        if message_id is not None:
            _send({"jsonrpc": "2.0", "id": message_id, "result": None})


if __name__ == "__main__":
    raise SystemExit(main())
