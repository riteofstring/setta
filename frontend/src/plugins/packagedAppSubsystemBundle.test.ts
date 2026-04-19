import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendSrcDir = path.dirname(fileURLToPath(import.meta.url));
const packagedBundlePath = path.resolve(
  frontendSrcDir,
  "../../../plugins/setta-json-render-app-gen/frontend/dist/index.js",
);
const FIRST_PARTY_PLUGIN_FRONTEND_BRIDGE_REGISTRY_KEY =
  "__settaFirstPartyPluginFrontends__";
const FIRST_PARTY_APP_SUBSYSTEM_PLUGIN_ID = "setta-json-render-app-gen";

describe("packaged app subsystem bundle", () => {
  it("registers app subsystem frontend surfaces through the plugin host", async () => {
    const registration = {
      overviewTab: {
        component: () => null,
      },
      previewSurface: {
        component: () => null,
      },
    };
    Object.defineProperty(
      globalThis,
      FIRST_PARTY_PLUGIN_FRONTEND_BRIDGE_REGISTRY_KEY,
      {
        configurable: true,
        value: {
          [FIRST_PARTY_APP_SUBSYSTEM_PLUGIN_ID]: {
            apiVersion: 1,
            register: (host: {
              registerAppSubsystem: (nextRegistration: unknown) => void;
            }) => {
              host.registerAppSubsystem(registration);
            },
          },
        },
        writable: true,
      },
    );

    const bundleModule = (await import(
      pathToFileURL(packagedBundlePath).href
    )) as {
      register?: (host: {
        registerAppSubsystem: (registration: unknown) => void;
      }) => void;
    };

    let registeredDefinition: unknown = null;
    bundleModule.register?.({
      registerAppSubsystem: (registration) => {
        registeredDefinition = registration;
      },
    });

    expect(typeof bundleModule.register).toBe("function");
    expect(registeredDefinition).toBe(registration);
  });
});
