import { describe, expect, test } from "vitest";

import { parseServerSentEvents } from "./server-sent-events";

describe("shared server-sent event parsing", () => {
  test("parses ids, event names, comments, and multiline data", async () => {
    const events = [];
    for await (const event of parseServerSentEvents(
      textStream(
        ': keepalive\nid: stream:1\nevent: chat.run.updated\ndata: {"a":1}\ndata: {"b":2}\n\n',
      ),
    )) {
      events.push(event);
    }
    expect(events).toEqual([
      {
        data: '{"a":1}\n{"b":2}',
        event: "chat.run.updated",
        id: "stream:1",
      },
    ]);
  });

  test("dispatches a final event without a trailing blank line", async () => {
    const events = [];
    for await (const event of parseServerSentEvents(textStream("id: stream:2\ndata: done"))) {
      events.push(event);
    }
    expect(events).toEqual([{ data: "done", event: "", id: "stream:2" }]);
  });
});

function textStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}
