import { describe, expect, test } from "vitest";

import {
  ReactDomSurfaceAdapter,
  type ReactSurfaceRoot,
  type ReactSurfaceRootFactory,
} from "./react-dom-surface-adapter";
import { createFakeHost } from "./test-dom-fakes";
import type { NiriPane } from "./types";

describe("niri React DOM surface adapter", () => {
  test("keeps React mount and unmount semantics stable across lifecycle calls", () => {
    const events: string[] = [];
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot(container) {
        events.push(`create:${container.className}`);
        return new RecordingRoot(events);
      },
    };
    const host = createFakeHost();
    const adapter = new ReactDomSurfaceAdapter(
      fakePane("fake-long-chat"),
      () => "long chat surface",
      rootFactory,
    );

    adapter.mount(host);
    adapter.setViewport({ height: 120, width: 180, x: 0, y: 0 }, "mount");
    adapter.setVisible(true);
    adapter.setFocused(true);
    adapter.freeze("snapshot");
    adapter.resume("focused");

    expect(events).toEqual(["create:niri-react-dom-surface", "render"]);
    expect(host.dataset.surfaceKind).toBe("fake-long-chat");
    expect(host.dataset.surfaceViewport).toBe("180x120");
    expect(host.dataset.surfaceFocused).toBe("true");
    expect(host.dataset.surfaceFrozen).toBe("false");
    expect(host.dataset.surfaceVisible).toBe("true");
    expect(adapter.lifecycleState).toMatchObject({
      focused: true,
      frozen: false,
      mounted: true,
      visible: true,
    });

    adapter.unmount();

    expect(events).toEqual(["create:niri-react-dom-surface", "render", "unmount"]);
    expect(adapter.lifecycleState.mounted).toBe(false);
  });
});

class RecordingRoot implements ReactSurfaceRoot {
  constructor(private readonly events: string[]) {}

  render(): void {
    this.events.push("render");
  }

  unmount(): void {
    this.events.push("unmount");
  }
}

function fakePane(surfaceKind: NiriPane["surfaceKind"]): NiriPane {
  return {
    columnId: "column",
    heat: 42,
    paneId: "pane",
    sequence: 0,
    subtitle: "test",
    surfaceId: "surface",
    surfaceKind,
    title: "Pane",
    tone: "cyan",
    weight: 1,
  };
}
