/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { describe, expect, it } from "vitest";
import { DropdownInput } from "./DropdownInput";

describe("DropdownInput", () => {
  it("marks the combobox root as a GPU flow nodrag/nopan region", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    try {
      await act(async () => {
        root.render(
          <DropdownInput
            choices={["A", "B"]}
            value="A"
            onChange={() => undefined}
            outerDivClasses="fixture-dropdown"
          />,
        );
      });

      expect(host.firstElementChild?.className).toContain(
        "nodrag nopan fixture-dropdown",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
      document.body.innerHTML = "";
    }
  });
});
