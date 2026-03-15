import json
import os
import sys
import time
import urllib.parse


def send(payload):
    data = json.dumps(payload).encode("utf-8")
    sys.stdout.buffer.write(f"Content-Length: {len(data)}\r\n\r\n".encode("utf-8"))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def read_message():
    headers = {}
    while True:
        line = sys.stdin.buffer.readline()
        if line == b"":
            return None
        if line in {b"\n", b"\r\n"}:
            break
        key, sep, value = line.decode("utf-8").partition(":")
        if sep == ":":
            headers[key.lower().strip()] = value.strip()
    length = int(headers.get("content-length", "0"))
    if length <= 0:
        return None
    body = sys.stdin.buffer.read(length)
    if len(body) < length:
        return None
    return json.loads(body.decode("utf-8"))


def uri_to_path(uri):
    parsed = urllib.parse.urlparse(uri)
    return urllib.parse.unquote(parsed.path)


def diagnostic_payload_for_content(content):
    if "__fixture_error__" not in content:
        return []
    return [
        {
            "range": {
                "start": {"line": 0, "character": 0},
                "end": {"line": 0, "character": 5},
            },
            "severity": 1,
            "source": "fixture-ts-lsp",
            "message": "Fixture TypeScript diagnostic",
            "code": "fixture-ts",
        }
    ]


def publish_diagnostics(uri, content):
    send(
        {
            "jsonrpc": "2.0",
            "method": "textDocument/publishDiagnostics",
            "params": {
                "uri": uri,
                "diagnostics": diagnostic_payload_for_content(content),
            },
        }
    )


def completion_delay_seconds():
    raw = os.environ.get("FIXTURE_COMPLETION_DELAY_MS", "").strip()
    if not raw:
        return 0
    try:
        return max(int(raw), 0) / 1000.0
    except ValueError:
        return 0


def signature_help_for_content(content):
    if "sorted(" not in content:
        return {"signatures": [], "activeSignature": 0, "activeParameter": 0}
    return {
        "signatures": [
            {
                "label": "sorted(iterable, /, *, key=None, reverse=False)",
                "documentation": "Fixture signature help for sorted().",
                "parameters": [
                    {"label": "iterable"},
                    {"label": "/"},
                    {"label": "*"},
                    {"label": "key=None"},
                    {"label": "reverse=False"},
                ],
            }
        ],
        "activeSignature": 0,
        "activeParameter": 0,
    }


documents = {}

while True:
    message = read_message()
    if message is None:
        raise SystemExit(0)

    method = message.get("method")
    message_id = message.get("id")
    params = message.get("params") or {}

    if method == "initialize" and message_id is not None:
        send(
            {
                "jsonrpc": "2.0",
                "id": message_id,
                "result": {
                    "capabilities": {
                        "textDocumentSync": 2,
                        "completionProvider": {"triggerCharacters": ["."]},
                        "signatureHelpProvider": {"triggerCharacters": ["("]},
                    }
                },
            }
        )
        continue

    if method == "workspace/didChangeConfiguration":
        continue

    if method == "textDocument/didOpen":
        text_document = params.get("textDocument") or {}
        uri = text_document.get("uri", "")
        documents[uri] = text_document.get("text", "")
        publish_diagnostics(uri, documents[uri])
        continue

    if method == "textDocument/didChange":
        text_document = params.get("textDocument") or {}
        uri = text_document.get("uri", "")
        changes = params.get("contentChanges") or []
        if changes:
            documents[uri] = changes[-1].get("text", "")
        publish_diagnostics(uri, documents.get(uri, ""))
        continue

    if method == "textDocument/didClose":
        text_document = params.get("textDocument") or {}
        uri = text_document.get("uri", "")
        documents.pop(uri, None)
        continue

    if method == "textDocument/completion" and message_id is not None:
        delay_seconds = completion_delay_seconds()
        if delay_seconds > 0:
            time.sleep(delay_seconds)
        send(
            {
                "jsonrpc": "2.0",
                "id": message_id,
                "result": {
                    "isIncomplete": False,
                    "items": [
                        {
                            "label": "fixtureCompletion",
                            "kind": 6,
                            "insertText": "fixtureCompletion",
                            "detail": uri_to_path((params.get("textDocument") or {}).get("uri", "")),
                        }
                    ],
                },
            }
        )
        continue

    if method == "textDocument/signatureHelp" and message_id is not None:
        uri = (params.get("textDocument") or {}).get("uri", "")
        send(
            {
                "jsonrpc": "2.0",
                "id": message_id,
                "result": signature_help_for_content(documents.get(uri, "")),
            }
        )
        continue

    if method == "shutdown" and message_id is not None:
        send({"jsonrpc": "2.0", "id": message_id, "result": None})
        continue

    if method == "exit":
        raise SystemExit(0)
