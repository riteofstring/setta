import { describe, expect, test, vi } from "vitest";

import { createBrowserWebEventStreamActivity } from "./web-event-stream-activity";

describe("browser web event stream activity", () => {
  test("pushes hidden, offline, page lifecycle, and restored activity changes", () => {
    const documentTarget = new EventTarget();
    const windowTarget = new EventTarget();
    const state = { online: true, visibility: "visible" as DocumentVisibilityState };
    const activity = createBrowserWebEventStreamActivity({
      document: {
        addEventListener: documentTarget.addEventListener.bind(documentTarget),
        get visibilityState() {
          return state.visibility;
        },
      },
      navigator: {
        get onLine() {
          return state.online;
        },
      },
      window: {
        addEventListener: windowTarget.addEventListener.bind(windowTarget),
      },
    });
    const changed = vi.fn();
    activity.onChanged(changed);

    state.visibility = "hidden";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    state.online = false;
    windowTarget.dispatchEvent(new Event("offline"));
    state.visibility = "visible";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    state.online = true;
    windowTarget.dispatchEvent(new Event("online"));
    windowTarget.dispatchEvent(new Event("pagehide"));
    windowTarget.dispatchEvent(new Event("pageshow"));

    expect(changed.mock.calls.map(([active]) => active)).toEqual([false, true, false, true]);
    expect(activity.isActive()).toBe(true);
  });
});
