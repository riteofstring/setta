/* @vitest-environment jsdom */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  WorkspaceCarousel,
  type WorkspaceCarouselItem,
} from "./WorkspaceCarousel.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const items = [
  { content: <span>Alpha content</span>, id: "alpha", label: "Alpha" },
  { content: <span>Bravo content</span>, id: "bravo", label: "Bravo" },
  { content: <span>Charlie content</span>, id: "charlie", label: "Charlie" },
] satisfies WorkspaceCarouselItem[];

function Harness() {
  const [activeItemId, setActiveItemId] = useState("bravo");
  return (
    <WorkspaceCarousel
      activeItemId={activeItemId}
      ariaLabel="Evidence frames"
      items={items}
      onActiveItemChange={setActiveItemId}
    />
  );
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const element = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!element) {
    throw new Error(`Expected the ${label} button.`);
  }
  return element;
}

describe("WorkspaceCarousel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("navigates one controlled item through buttons and the thumbnail keyboard", async () => {
    await act(async () => root.render(<Harness />));

    expect(container.textContent).toContain("Bravo content");
    expect(container.textContent).toContain("2 / 3");
    await act(async () => button(container, "Previous item").click());
    expect(container.textContent).toContain("Alpha content");
    expect(button(container, "Previous item").disabled).toBe(true);

    await act(async () => button(container, "Show Charlie").click());
    expect(container.textContent).toContain("Charlie content");
    expect(button(container, "Next item").disabled).toBe(true);

    await act(async () =>
      button(container, "Show Charlie").dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Home" }),
      ),
    );
    expect(container.textContent).toContain("Alpha content");
    expect(document.activeElement).toBe(button(container, "Show Alpha"));
  });

  it("renders a caller-owned empty state", async () => {
    await act(async () =>
      root.render(
        <WorkspaceCarousel
          activeItemId={null}
          ariaLabel="Empty evidence"
          emptyState={<span>No evidence</span>}
          items={[]}
          onActiveItemChange={() => {}}
        />,
      ),
    );

    expect(container.textContent).toBe("No evidence");
    expect(
      container.querySelector('[aria-roledescription="carousel"]'),
    ).not.toBeNull();
  });
});
