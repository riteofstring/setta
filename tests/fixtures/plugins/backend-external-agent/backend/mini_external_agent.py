import json
import sys
from typing import Any


def _emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def _read_start_payload() -> dict[str, Any]:
    line = sys.stdin.readline()
    if line == "":
        return {}
    try:
        payload = json.loads(line)
    except json.JSONDecodeError:
        return {}
    if isinstance(payload, dict):
        return payload
    return {}


def main() -> None:
    payload = _read_start_payload()
    prompt = ""
    inputs = payload.get("inputs")
    if isinstance(inputs, dict):
        raw_prompt = inputs.get("prompt")
        if isinstance(raw_prompt, str):
            prompt = raw_prompt.strip()
    if prompt:
        text = f"fixture external adapter reply: {prompt}"
    else:
        text = "fixture external adapter reply"
    _emit({"type": "message", "text": text})
    _emit({"type": "session", "sessionId": "fixture-session"})
    _emit({"type": "done", "returnCode": 0})


if __name__ == "__main__":
    main()
