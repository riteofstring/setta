/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ColorPickerInput } from "./ColorPickerInput";

let host: HTMLDivElement;
let root: Root;

describe("ColorPickerInput", () => {
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
  });

  it("can auto-open the popup color-choice menu on mount", async () => {
    await act(async () => {
      root.render(
        <ColorPickerInput
          colorChoices={[
            { color: "#ff0000", description: "Red" },
            { color: "#00ff00", description: "Green" },
          ]}
          colorPickerChoicesClasses="flex"
          onChange={() => {}}
          shouldAutoOpenOnMount={true}
          value={JSON.stringify("#ff0000")}
          wrapperClassName="flex"
        />,
      );
    });

    const menuItems = document.body.querySelectorAll("[role='menuitem']");
    expect(menuItems).toHaveLength(2);
    expect(
      Array.from(menuItems).map((item) => item.textContent?.trim()),
    ).toEqual(["Red", "Green"]);
  });
});
