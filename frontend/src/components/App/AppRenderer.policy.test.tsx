import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { createSharePolicy } from "utils/generatedTypes";

import { AppActionContext, AppRuntimeContext } from "./appContext";
import { appRegistry } from "./appRegistry";

vi.mock("components/Params/ParamItems/ParamInput", () => ({
  ParamInput: () => <div data-testid="param-input" />,
}));

describe("AppRenderer policy enforcement", () => {
  it("disables param edits and downloads when policy forbids", () => {
    const runtimeValue = {
      dataBindings: {},
      actions: {
        downloadReport: {
          type: "downloadArtifact",
          artifactId: "artifacts/report.txt",
        },
      },
      policy: createSharePolicy({
        allowParamChanges: false,
        allowFileDownloads: false,
        allowExternalLinks: false,
        allowRun: true,
      }),
      canEditParams: false,
      allowExternalLinks: false,
      allowFileDownloads: false,
    };
    const actionState = {
      canRun: true,
      canReset: true,
      isRunning: false,
      runDisabledReason: null,
    };

    const ParamInput = appRegistry.ParamInput;
    const ActionButton = appRegistry.ActionButton;

    const markup = renderToStaticMarkup(
      <AppRuntimeContext.Provider value={runtimeValue}>
        <AppActionContext.Provider value={actionState}>
          <div>
            <ParamInput
              element={{
                props: {
                  sectionId: "section-1",
                  paramId: "param-1",
                  label: "Param",
                },
              }}
            />
            <ActionButton
              element={{
                props: {
                  action: "downloadReport",
                  label: "Download",
                },
              }}
              onAction={() => {}}
            />
          </div>
        </AppActionContext.Provider>
      </AppRuntimeContext.Provider>,
    );

    expect(markup).toContain("Param edits are disabled by policy.");
    expect(markup).toContain("cursor-not-allowed");
    expect(markup).toContain("File downloads are disabled by policy.");
  });
});
