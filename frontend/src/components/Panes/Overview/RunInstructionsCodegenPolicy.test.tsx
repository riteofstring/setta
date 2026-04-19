/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { createProjectCodegenPythonTarget } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RunInstructionsCodegenPolicy,
  type RunInstructionsSectionOption,
} from "./RunInstructionsCodegenPolicy";

const TEST_STYLES = {
  toggleRoot: "",
  toggleThumb: "",
  toggleLabel: "",
  panelCard: "",
  panelRow: "",
  panelSelect: "",
  panelCompactSelect: "",
  panelIconButton: "",
  panelIconButtonDestructive: "",
};

function createPartialSectionPolicyTarget() {
  const target = createProjectCodegenPythonTarget();
  const textBlockPolicy = target.sectionPolicy.typePolicies.TextBlock;
  if (!textBlockPolicy) {
    throw new Error("Missing default TextBlock section policy");
  }
  return {
    ...target,
    sectionPolicy: {
      ...target.sectionPolicy,
      typePolicies: {
        TextBlock: textBlockPolicy,
      },
    },
  };
}

describe("RunInstructionsCodegenPolicy", () => {
  let host: HTMLDivElement;
  let root: Root;

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
  });

  it("renders section defaults when the loaded section type policies are partial", async () => {
    const target = createPartialSectionPolicyTarget();

    await act(async () => {
      root.render(
        <RunInstructionsCodegenPolicy
          styles={TEST_STYLES}
          isDeploymentMode={false}
          pythonCodegenEnabled={true}
          pythonTarget={target}
          sectionPolicy={target.sectionPolicy}
          codeObjValuePolicy={target.codeObjValuePolicy}
          defaultCodeObjValuePolicy={target.codeObjValuePolicy}
          allowlistEnabled={true}
          allowlist={target.sectionPolicy.allowlist ?? []}
          metaControlAllowlist={target.sectionPolicy.metaControlAllowlist ?? []}
          pendingOverrideId=""
          pendingCodeObjOverrideId=""
          availableOverrideSections={[]}
          overrideEntries={[]}
          availableCodeObjOverrides={[]}
          codeObjOverrideEntries={[]}
          sectionOptionsById={new Map()}
          codeObjOptionsById={new Map()}
          setPendingOverrideId={() => {}}
          setPendingCodeObjOverrideId={() => {}}
          updatePythonTarget={() => {}}
          updateSectionPolicy={() => {}}
          updateCodeObjValuePolicy={() => {}}
        />,
      );
    });

    expect(host.textContent).toContain("Section Type Defaults");
    expect(host.textContent).toContain("Callable");
  });

  it("uses default section type policies when adding an override for a missing entry", async () => {
    const target = createPartialSectionPolicyTarget();
    const updateSectionPolicy = vi.fn();
    const overrideSection: RunInstructionsSectionOption = {
      id: "chat-section",
      name: "Chat Section",
      type: "Chat",
    };

    await act(async () => {
      root.render(
        <RunInstructionsCodegenPolicy
          styles={TEST_STYLES}
          isDeploymentMode={false}
          pythonCodegenEnabled={true}
          pythonTarget={target}
          sectionPolicy={target.sectionPolicy}
          codeObjValuePolicy={target.codeObjValuePolicy}
          defaultCodeObjValuePolicy={target.codeObjValuePolicy}
          allowlistEnabled={true}
          allowlist={target.sectionPolicy.allowlist ?? []}
          metaControlAllowlist={target.sectionPolicy.metaControlAllowlist ?? []}
          pendingOverrideId={overrideSection.id}
          pendingCodeObjOverrideId=""
          availableOverrideSections={[overrideSection]}
          overrideEntries={[]}
          availableCodeObjOverrides={[]}
          codeObjOverrideEntries={[]}
          sectionOptionsById={new Map([[overrideSection.id, overrideSection]])}
          codeObjOptionsById={new Map()}
          setPendingOverrideId={() => {}}
          setPendingCodeObjOverrideId={() => {}}
          updatePythonTarget={() => {}}
          updateSectionPolicy={updateSectionPolicy}
          updateCodeObjValuePolicy={() => {}}
        />,
      );
    });

    const addButton = host.querySelector<HTMLButtonElement>(
      '[data-testid="run-instructions-section-override-add"]',
    );
    expect(addButton).not.toBeNull();

    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(updateSectionPolicy).toHaveBeenCalledTimes(1);
    expect(updateSectionPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionOverrides: expect.objectContaining({
          "chat-section": {
            mode: "inherit",
            representation: "file_read",
          },
        }),
      }),
    );
  });
});
