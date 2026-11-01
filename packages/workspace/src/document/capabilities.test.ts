import { describe, expect, it } from "vitest";
import { createWorkspaceHost } from "../workspaceHost.js";
import {
  getWorkspaceCapabilitiesStore,
  setWorkspaceCapabilities,
} from "./capabilities.js";

describe("workspace capabilities", () => {
  it("configures edit authority for one host", () => {
    const host = createWorkspaceHost();
    const otherHost = createWorkspaceHost();

    setWorkspaceCapabilities(host, {
      canEditLayout: false,
      canEditStructure: false,
    });

    expect(getWorkspaceCapabilitiesStore(host).getState()).toMatchObject({
      canEditLayout: false,
      canEditStructure: false,
    });
    expect(getWorkspaceCapabilitiesStore(otherHost).getState()).toMatchObject({
      canEditLayout: true,
      canEditStructure: true,
    });

    host.dispose();
    otherHost.dispose();
  });

  it("rejects malformed capability input", () => {
    const host = createWorkspaceHost();

    expect(() =>
      setWorkspaceCapabilities(host, {
        canEditLayout: false,
        canEditStructure: "false",
      } as never),
    ).toThrow(
      "Workspace capabilities require boolean canEditLayout and canEditStructure values.",
    );

    host.dispose();
  });
});
