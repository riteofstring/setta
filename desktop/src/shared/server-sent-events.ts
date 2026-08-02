export interface ServerSentEvent {
  data: string;
  event: string;
  id: string;
}

interface ServerSentEventState {
  data: string[];
  event: string;
  id: string;
}

export async function* parseServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerSentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let state = emptyEventState();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffered += decoder.decode();
      break;
    }
    buffered += decoder.decode(value, { stream: true });

    let line = nextLine(buffered);
    while (line) {
      buffered = line.remaining;
      const event = applyServerSentEventLine(state, line.value);
      if (event) {
        yield event;
        state = emptyEventState();
      }
      line = nextLine(buffered);
    }
  }

  if (buffered !== "") {
    const event = applyServerSentEventLine(state, trimLineEnding(buffered));
    if (event) {
      yield event;
      state = emptyEventState();
    }
  }
  const finalEvent = dispatchServerSentEvent(state);
  if (finalEvent) {
    yield finalEvent;
  }
}

function applyServerSentEventLine(
  state: ServerSentEventState,
  line: string,
): ServerSentEvent | null {
  if (line === "") {
    return dispatchServerSentEvent(state);
  }
  if (line.startsWith(":")) {
    return null;
  }
  const field = parseServerSentEventField(line);
  applyServerSentEventField(state, field.name, field.value);
  return null;
}

function parseServerSentEventField(line: string): { name: string; value: string } {
  const separator = line.indexOf(":");
  const name = separator === -1 ? line : line.slice(0, separator);
  let value = separator === -1 ? "" : line.slice(separator + 1);
  if (value.startsWith(" ")) {
    value = value.slice(1);
  }
  return { name, value };
}

function applyServerSentEventField(state: ServerSentEventState, field: string, value: string) {
  switch (field) {
    case "data":
      state.data.push(value);
      return;
    case "event":
      state.event = value;
      return;
    case "id":
      state.id = value;
      return;
    case "retry":
      return;
    default:
      return;
  }
}

function dispatchServerSentEvent(state: ServerSentEventState): ServerSentEvent | null {
  if (state.data.length === 0) {
    state.event = "";
    state.id = "";
    return null;
  }
  const event = {
    data: state.data.join("\n"),
    event: state.event,
    id: state.id,
  };
  state.data = [];
  state.event = "";
  state.id = "";
  return event;
}

function emptyEventState(): ServerSentEventState {
  return { data: [], event: "", id: "" };
}

function nextLine(value: string): { remaining: string; value: string } | null {
  const index = value.indexOf("\n");
  if (index === -1) {
    return null;
  }
  return {
    remaining: value.slice(index + 1),
    value: trimLineEnding(value.slice(0, index)),
  };
}

function trimLineEnding(value: string): string {
  return value.endsWith("\r") ? value.slice(0, -1) : value;
}
