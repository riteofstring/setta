export const apiVersion = 1;

const previewEnabledListeners = new Set();
let previewEnabled = true;

function notifyPreviewEnabledListeners() {
  for (const listener of previewEnabledListeners) {
    listener(previewEnabled);
  }
}

function formatSurfaceText(surfaceName, props, host) {
  const projectName =
    host?.getProjectContext?.()?.projectConfig?.name?.trim() || "Unknown Project";
  const modalState =
    props && typeof props === "object" && "open" in props
      ? props.open
        ? "open"
        : "closed"
      : "static";
  return `${surfaceName}:${projectName}:${modalState}`;
}

function createRenderer(surfaceName) {
  return {
    mount(target, props, host) {
      target.dataset.acmeAppSubsystemSurface = surfaceName;
      target.setAttribute("data-acme-app-subsystem-surface", surfaceName);
      target.textContent = formatSurfaceText(surfaceName, props, host);
    },
    update(target, props, host) {
      target.textContent = formatSurfaceText(surfaceName, props, host);
    },
    unmount(target) {
      target.dataset.acmeAppSubsystemUnmounted = surfaceName;
      target.textContent = "";
    },
  };
}

export const appSubsystemFrontendRegistration = {
  overviewTab: {
    renderer: createRenderer("overview-tab"),
    titleQuickInfo: "Inspect the unknown-id app subsystem provider.",
    moreMenuQuickInfo: "Open the Acme app subsystem provider.",
    moreMenuLabel: "Acme App",
  },
  previewSurface: {
    renderer: createRenderer("preview-surface"),
  },
  appModeRoute: {
    renderer: createRenderer("app-mode-route"),
  },
  appDeploymentModal: {
    renderer: createRenderer("app-deployment-modal"),
  },
  chat: {
    slashCommands: [
      {
        command: "/app-json",
        action: "app_json_render",
        summary: "Generate a standalone app spec through JSON render.",
        promptTemplate:
          "Generate a polished standalone JSON-render app spec. Use a strong hero section, clear content grouping, and consistent spacing/typography by default. Include one obvious primary action path and production-ready baseline structure.",
        appGenerationMode: "json_render",
      },
    ],
    imageRequiredModes: [],
    customSlashCommandModes: {
      options: [
        { id: "plain_chat", name: "Plain chat" },
        { id: "json_render", name: "JSON Render" },
      ],
      defaultMode: "plain_chat",
    },
  },
  controller: {
    getPreviewEnabled() {
      return previewEnabled;
    },
    subscribePreviewEnabled(listener) {
      previewEnabledListeners.add(listener);
      return () => {
        previewEnabledListeners.delete(listener);
      };
    },
    initializeProjectState() {
      previewEnabled = true;
      notifyPreviewEnabledListeners();
    },
    async initializeAppSessionFromCurrentDeployment() {
      return true;
    },
    resetProjectState() {
      previewEnabled = false;
      notifyPreviewEnabledListeners();
    },
  },
};

function resolveAppSubsystemRegistrationHost(host) {
  if (
    !host ||
    typeof host !== "object" ||
    Array.isArray(host) ||
    typeof host.pluginId !== "string" ||
    host.pluginId.trim().length === 0 ||
    typeof host.apiVersion !== "number" ||
    typeof host.registerAppSubsystem !== "function"
  ) {
    throw new Error(
      "Plugin host does not support registerAppSubsystem for app-subsystem providers.",
    );
  }
  return host;
}

export function register(host) {
  resolveAppSubsystemRegistrationHost(host).registerAppSubsystem(
    appSubsystemFrontendRegistration,
  );
}

export default appSubsystemFrontendRegistration;
