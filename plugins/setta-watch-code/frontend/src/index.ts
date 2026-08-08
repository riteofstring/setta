import "./styles.css";
import {
  createWatchCodeControl,
  type WatchCodePluginHost,
} from "./watchCodeControl";

export const apiVersion = 1 satisfies WatchCodePluginHost["apiVersion"];

export function register(host: WatchCodePluginHost): void {
  const control = createWatchCodeControl(host);
  host.registerCanvasControl({
    id: "watch-code",
    label: "Watch Code",
    description: "Watch Code settings",
    placement: "project",
    order: 20,
    renderer: control.renderer,
  });
  host.registerSettingRevealHandler(
    "watch-code-settings",
    control.revealSetting,
  );
}
