import "./styles.css";
import type { SettaPluginHost } from "@setta/app-subsystem-frontend-sdk";
import {
  createWatchCodeControl,
  type WatchCodePluginHost,
} from "./watchCodeControl";

export const apiVersion = 1 satisfies SettaPluginHost["apiVersion"];

const requiredCapabilities = [
  "registerCanvasControl",
  "registerSettingRevealHandler",
  "registerRouter",
  "readProjectState",
  "subscribeProjectState",
];

export function register(host: unknown): void {
  if (!host || typeof host !== "object") {
    return;
  }
  const candidate = host as Partial<WatchCodePluginHost>;
  if (
    candidate.apiVersion !== apiVersion ||
    !Array.isArray(candidate.effectiveCapabilities)
  ) {
    return;
  }
  if (!hasRequiredCapabilities(candidate.effectiveCapabilities)) {
    return;
  }

  const watchCodeHost = host as WatchCodePluginHost;
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
