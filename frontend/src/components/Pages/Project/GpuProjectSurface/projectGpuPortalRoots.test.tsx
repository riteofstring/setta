import { renderToStaticMarkup } from "react-dom/server";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  SETTA_POPOVER_PORTAL_PARENT_ID,
} from "utils/constants";
import { describe, expect, it } from "vitest";
import { ProjectGpuPortalRoots } from "./projectGpuPortalRoots";

describe("ProjectGpuPortalRoots", () => {
  it("renders the current project tooltip and popover portal roots", () => {
    const markup = renderToStaticMarkup(<ProjectGpuPortalRoots />);

    expect(markup).toContain(`id="${CODEMIRROR_TOOLTIP_PARENT_ID}"`);
    expect(markup).toContain(`class="setta-codemirror-tooltips"`);
    expect(markup).toContain(`id="${SETTA_POPOVER_PORTAL_PARENT_ID}"`);
    expect(markup).toContain(`class="setta-popover-portals"`);
    expect(markup.indexOf(CODEMIRROR_TOOLTIP_PARENT_ID)).toBeLessThan(
      markup.indexOf(SETTA_POPOVER_PORTAL_PARENT_ID),
    );
  });
});
