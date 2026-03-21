/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveCodeMirrorTooltipParent,
  useCodeMirrorTooltipParent,
} from "./useCodeMirrorTooltipParent";

function TooltipParentProbe({
  parentDivId,
}: {
  parentDivId?: string | null;
}) {
  const parent = useCodeMirrorTooltipParent(parentDivId);
  return <div data-testid="tooltip-parent-probe">{parent?.id ?? "null"}</div>;
}

describe("useCodeMirrorTooltipParent", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body
      .querySelectorAll('[data-testid="tooltip-parent-fixture"]')
      .forEach((node) => node.remove());
  });

  it("resolves an existing tooltip parent synchronously on the first render", async () => {
    const tooltipParent = document.createElement("div");
    tooltipParent.id = "tooltip-parent-1";
    tooltipParent.dataset.testid = "tooltip-parent-fixture";
    document.body.append(tooltipParent);

    await act(async () => {
      root.render(<TooltipParentProbe parentDivId="tooltip-parent-1" />);
    });

    expect(host.textContent).toBe("tooltip-parent-1");
  });

  it("returns null when the tooltip parent id is missing", () => {
    expect(resolveCodeMirrorTooltipParent("missing-tooltip-parent")).toBeNull();
  });
});
