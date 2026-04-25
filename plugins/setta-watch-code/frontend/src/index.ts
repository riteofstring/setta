import "./styles.css";
import {
  createWatchCodeControl,
  type WatchCodePluginHost,
} from "./watchCodeControl";

export const apiVersion = 1;

const requiredCapabilities = [
  "registerCanvasControl",
  "registerSettingRevealHandler",
  "readProjectState",
  "subscribeProjectState",
  "mutateWatchCodeSettings",
];

export function register(host: unknown): void {
  const watchCodeHost = normalizeWatchCodePluginHost(host);
  if (!watchCodeHost) {
    return;
  }
  if (!hasRequiredCapabilities(watchCodeHost.effectiveCapabilities)) {
    return;
  }

  const control = createWatchCodeControl(watchCodeHost);
  watchCodeHost.registerCanvasControl({
    id: "watch-code",
    label: "Watch Code",
    description: "Watch Code settings",
    placement: "project",
    order: 20,
    renderer: control.renderer,
  });
  watchCodeHost.registerSettingRevealHandler(
    "watch-code-settings",
    control.revealSetting,
  );
}

function hasRequiredCapabilities(effectiveCapabilities: string[]): boolean {
  const effective = new Set(effectiveCapabilities);
  return requiredCapabilities.every((capability) => effective.has(capability));
}

function normalizeWatchCodePluginHost(
  host: unknown,
): WatchCodePluginHost | null {
  if (!host || typeof host !== "object") {
    return null;
  }
  const candidate = host as Partial<WatchCodePluginHost>;
  if (
    candidate.apiVersion !== apiVersion ||
    typeof candidate.pluginId !== "string" ||
    typeof candidate.serverMode !== "string" ||
    !Array.isArray(candidate.effectiveCapabilities) ||
    typeof candidate.registerCanvasControl !== "function" ||
    typeof candidate.registerSettingRevealHandler !== "function" ||
    typeof candidate.getProjectContext !== "function" ||
    typeof candidate.subscribeProjectContext !== "function" ||
    typeof candidate.readProjectState !== "function" ||
    typeof candidate.subscribeProjectState !== "function" ||
    typeof candidate.setWatchCodeEnabled !== "function" ||
    typeof candidate.setWatchCodeInputs !== "function"
  ) {
    return null;
  }
  return candidate as WatchCodePluginHost;
}
