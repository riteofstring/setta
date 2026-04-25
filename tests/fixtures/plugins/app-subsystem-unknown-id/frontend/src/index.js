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
        command: "/acme-app",
        action: "create_acme_app",
        summary: "Create an app through the unknown-id fixture provider.",
        appGenerationMode: "acme_app",
      },
    ],
    imageRequiredModes: ["acme_app"],
    customSlashCommandModes: {
      options: [{ id: "acme_app", name: "Acme app" }],
      defaultMode: "acme_app",
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
