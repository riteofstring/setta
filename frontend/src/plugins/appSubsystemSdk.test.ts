import {
  createAppSubsystemFrontendHost,
  isAppSubsystemFrontendRegistration,
  registerAppSubsystemPlugin,
} from "@setta/app-subsystem-frontend-sdk";
import { describe, expect, it, vi } from "vitest";

describe("appSubsystemFrontendSdk", () => {
  it("registers app subsystem providers through the typed SDK host", () => {
    const registration = {
      previewSurface: {
        renderer: {
          mount: () => undefined,
        },
      },
    };
    const registerAppSubsystem = vi.fn();

    const host = registerAppSubsystemPlugin(
      {
        apiVersion: 1,
        pluginId: "acme.plugin",
        registerAppSubsystem,
      },
      registration,
    );

    expect(host.pluginId).toBe("acme.plugin");
    expect(registerAppSubsystem).toHaveBeenCalledWith(registration);
  });

  it("rejects hosts that do not expose the app subsystem registration capability", () => {
    expect(() =>
      registerAppSubsystemPlugin(
        {
          apiVersion: 1,
          pluginId: "acme.plugin",
        },
        {
          previewSurface: {
            renderer: {
              mount: () => undefined,
            },
          },
        },
      ),
    ).toThrow(
      "Plugin host does not support registerAppSubsystem for app-subsystem providers.",
    );
  });

  it("provides default typed frontend-host services for plugin renderers", () => {
    const frontendHost = createAppSubsystemFrontendHost();

    expect(frontendHost.apiVersion).toBe(1);
    expect(frontendHost.getProjectContext()).toEqual({
      defaultProjectConfigId: null,
      projectMetadata: [],
      projectConfig: {
        id: null,
        name: "",
        entryCodeBlockId: null,
      },
    });
    expect(frontendHost.subscribeProjectContext(() => undefined)).toBeTypeOf(
      "function",
    );
    expect(frontendHost.getRuntimeContext()).toEqual({
      isAppDeploymentMode: false,
      shareSessionId: null,
      sessionRunCount: 0,
      sharePolicy: null,
      defaultRunSnapshotMode: "ephemeral",
      runSnapshotModeByProjectConfigId: {},
    });
    expect(frontendHost.subscribeRuntimeContext(() => undefined)).toBeTypeOf(
      "function",
    );
    expect(() => frontendHost.notify({ message: "hello" })).not.toThrow();
  });

  it("validates the renderer-based app subsystem registration contract", () => {
    expect(
      isAppSubsystemFrontendRegistration({
        overviewTab: {
          renderer: {
            mount: () => undefined,
            update: () => undefined,
            unmount: () => undefined,
          },
          titleQuickInfo: "Title",
          moreMenuQuickInfo: "Quick info",
          moreMenuLabel: "Menu",
        },
        chat: {
          slashCommands: [
            {
              command: "/app",
              action: "custom_prompt",
              summary: "Generate an app",
              appGenerationMode: "json_render",
            },
          ],
          imageRequiredModes: ["json_render_image"],
          customSlashCommandModes: {
            options: [{ id: "plain_chat", name: "Plain chat" }],
            defaultMode: "plain_chat",
          },
        },
      }),
    ).toBe(true);

    expect(
      isAppSubsystemFrontendRegistration({
        previewSurface: {
          renderer: {
            mount: "not-a-function",
          },
        },
      }),
    ).toBe(false);
  });
});
