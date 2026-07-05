import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { WorkspaceLayoutRecoveryNotice } from "./workspace-layout-area-components";

describe("workspace layout recovery notice", () => {
  test("renders an explicit recreate action for persisted layout recovery", () => {
    const html = renderToString(
      <WorkspaceLayoutRecoveryNotice
        message="Workspace UI state could not be loaded"
        onDismiss={vi.fn()}
        recreateAction={{
          ariaLabel: "Recreate saved workspace layout",
          onClick: vi.fn(),
          title: "Recreate saved workspace layout",
        }}
      />,
    );

    expect(html).toContain('data-testid="workspace-layout-recovery"');
    expect(html).toContain("Workspace UI state could not be loaded");
    expect(html).toContain('aria-label="Recreate saved workspace layout"');
    expect(html).toContain('aria-label="Dismiss layout recovery notice"');
  });

  test("omits recovery markup when no message is active", () => {
    const html = renderToString(
      <WorkspaceLayoutRecoveryNotice message={null} onDismiss={vi.fn()} />,
    );

    expect(html).toBe("");
  });
});
