import type { SettaPluginHost } from "@setta/app-subsystem-frontend-sdk";
import { apiVersion, register } from "../src/index";

const host = {
  apiVersion,
  pluginId: "setta-watch-code",
  serverMode: "ide",
  effectiveCapabilities: [
    "registerCanvasControl",
    "registerSettingRevealHandler",
    "registerRouter",
    "readProjectState",
    "subscribeProjectState",
  ],
  registerCanvasControl: () => undefined,
  registerSettingRevealHandler: () => undefined,
  getProjectContext: () => ({
    projectConfigId: "project-alpha",
    serverMode: "ide",
  }),
  subscribeProjectContext: () => () => undefined,
  readProjectState: () => ({}),
  subscribeProjectState: () => () => undefined,
  fetchBackendRoute: async () => new Response(null, { status: 200 }),
} satisfies SettaPluginHost;

register(host);
