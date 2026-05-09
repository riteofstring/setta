import json
import sys


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


def publish_diagnostics(uri, content, version):
    diagnostics = []
    if "unknown_symbol" in content:
        diagnostics.append(
            {
                "range": {
                    "start": {"line": 0, "character": 8},
                    "end": {"line": 0, "character": 22},
                },
                "severity": 1,
                "source": "basedpyright",
                "message": '"unknown_symbol" is not defined',
            }
        )
    params = {"uri": uri, "diagnostics": diagnostics}
    if version is not None:
        params["version"] = version
    send({"jsonrpc": "2.0", "method": "textDocument/publishDiagnostics", "params": params})


def signature_help_for_content(content):
    if "sorted(" not in content:
        return {"signatures": [], "activeSignature": 0, "activeParameter": 0}
    return {
        "signatures": [
            {
                "label": "sorted(iterable, /, *, key=None, reverse=False)",
                "parameters": [{"label": "iterable"}],
            }
        ],
        "activeSignature": 0,
        "activeParameter": 0,
    }


def initialize_response(message_id):
    return {
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


def completion_response(message_id):
    return {
        "jsonrpc": "2.0",
        "id": message_id,
        "result": {
            "isIncomplete": False,
            "items": [{"label": "upper", "kind": 2, "insertText": "upper"}],
        },
    }


def update_document(documents, params):
    text_document = params.get("textDocument") or {}
    uri = text_document.get("uri", "")
    changes = params.get("contentChanges") or []
    current = documents.get(uri, {"text": "", "version": None})
    if changes:
        current["text"] = changes[-1].get("text", "")
    current["version"] = text_document.get("version", current.get("version"))
    documents[uri] = current
    publish_diagnostics(uri, current["text"], current["version"])


def open_document(documents, params):
    text_document = params.get("textDocument") or {}
    uri = text_document.get("uri", "")
    documents[uri] = {
        "text": text_document.get("text", ""),
        "version": text_document.get("version"),
    }
    publish_diagnostics(uri, documents[uri]["text"], documents[uri]["version"])


def signature_help_response(message_id, documents, params):
    uri = (params.get("textDocument") or {}).get("uri", "")
    return {
        "jsonrpc": "2.0",
        "id": message_id,
        "result": signature_help_for_content((documents.get(uri) or {}).get("text", "")),
    }


def handle_message(documents, message):
    method = message.get("method")
    message_id = message.get("id")
    params = message.get("params") or {}

    if method == "initialize" and message_id is not None:
        send(initialize_response(message_id))
        return
    if method == "workspace/didChangeConfiguration":
        return
    if method == "textDocument/didOpen":
        open_document(documents, params)
        return
    if method == "textDocument/didChange":
        update_document(documents, params)
        return
    if method == "textDocument/completion" and message_id is not None:
        send(completion_response(message_id))
        return
    if method == "textDocument/signatureHelp" and message_id is not None:
        send(signature_help_response(message_id, documents, params))
        return
    if method == "shutdown" and message_id is not None:
        send({"jsonrpc": "2.0", "id": message_id, "result": None})
        return
    if method == "exit":
        raise SystemExit(0)


def main():
    documents = {}
    while True:
        message = read_message()
        if message is None:
            raise SystemExit(0)
        handle_message(documents, message)


if __name__ == "__main__":
    main()
