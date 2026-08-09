/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BehaviorDropTypeEnum } from "../../dnd/dropTypes";
import { DROP_FEEDBACK_Z_INDEX } from "../../dnd/layers";
import { useSectionRefs } from "../sectionRefs";
import { DndSlot } from "./DndSlot";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("DndSlot", () => {
  let host: HTMLDivElement;
  let target: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    target = document.createElement("div");
    target.getBoundingClientRect = () =>
      ({ top: 40, left: 60, width: 200, height: 120 }) as DOMRect;
    document.body.append(host, target);
    useSectionRefs.setState({ withNested: { target }, selfOnly: {} });
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    target.remove();
    useSectionRefs.getState().reset();
  });

  it("portals invalid feedback above the free-move drag overlay", async () => {
    await act(async () => {
      root.render(
        createElement(DndSlot, {
          behaviorDropType: BehaviorDropTypeEnum.INVALID,
          children: createElement("div", null, "section"),
          isGroup: false,
          sectionId: "target",
        }),
      );
    });

    const overlay = document.body.querySelector<HTMLElement>("[data-dnd-slot-overlay='true']");
    expect(overlay?.style.position).toBe("fixed");
    expect(overlay?.style.top).toBe("40px");
    expect(overlay?.style.left).toBe("60px");
    expect(overlay?.style.width).toBe("200px");
    expect(overlay?.style.height).toBe("120px");
    expect(overlay?.style.zIndex).toBe(String(DROP_FEEDBACK_Z_INDEX));
    expect(overlay?.textContent).toContain("No nesting");
  });
});
