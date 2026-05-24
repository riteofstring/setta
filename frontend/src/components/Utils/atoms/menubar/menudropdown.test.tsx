import * as Menubar from "@radix-ui/react-menubar";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavbarMenuDropdown } from "./menudropdown";

vi.mock("@radix-ui/react-menubar", async () => {
  const React = await import("react");
  const passthrough = (Tag: React.ElementType) => {
    return ({
      children,
      align,
      sideOffset,
      alignOffset,
      ...props
    }: Record<string, unknown>) => React.createElement(Tag, props, children);
  };
  const Fragment = ({ children }) =>
    React.createElement(React.Fragment, null, children);
  return {
    Root: passthrough("div"),
    Menu: passthrough("div"),
    Trigger: passthrough("button"),
    Portal: Fragment,
    Content: passthrough("div"),
  };
});

describe("NavbarMenuDropdown", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses the elevated app menu layer by default", () => {
    const markup = renderToStaticMarkup(
      <Menubar.Root>
        <NavbarMenuDropdown trigger="Project">
          <div>Menu item</div>
        </NavbarMenuDropdown>
      </Menubar.Root>,
    );

    expect(markup).toContain("z-[35]");
  });
});
