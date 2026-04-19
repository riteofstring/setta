#!/usr/bin/env python3

import json
import sys

BACKEND_PROBE_ARG = "--setta-plugin-backend-probe"
BACKEND_RUNTIME_ARG = "--setta-plugin-backend-runtime"


def write_json(payload: object) -> None:
    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")
    sys.stdout.flush()


def fail(message: str) -> None:
    sys.stderr.write(message + "\n")
    sys.exit(1)


def main() -> None:
    if len(sys.argv) != 2:
        return

    command = sys.argv[1]
    if command == BACKEND_PROBE_ARG:
        write_json(
            {
                "schemaVersion": 1,
                "codegenTargets": [],
                "routes": [],
                "staticDirs": [],
                "listenerEndpoints": [],
            }
        )
        return

    if command != BACKEND_RUNTIME_ARG:
        return

    try:
        request = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        fail(f"decode backend runtime request: {error}")

    kind = str(request.get("kind", "")).strip()
    response: dict[str, object] = {"schemaVersion": 1}
    if kind == "http":
        response["http"] = {"statusCode": 404, "headers": {}}
    elif kind == "listener_endpoint":
        response["listenerEndpoint"] = {"result": None}
    else:
        fail(f"unsupported backend runtime kind {kind!r}")
    write_json(response)


if __name__ == "__main__":
    main()
