import { post } from "utils/requestTransport";
import { buildSettaApiPayload } from "utils/settaApiPresets";

export type SettaApiButtonRequestConfig = {
  requestUrl: string;
  requestBody: string;
};

export function sendButtonSettaRequest(
  config: SettaApiButtonRequestConfig,
): void {
  const route = config.requestUrl.trim();
  if (route === "") {
    return;
  }
  // Button-triggered Setta API calls intentionally allow custom user-entered
  // routes in addition to known presets, so this stays on the low-level post()
  // boundary instead of a fail-closed generated endpoint wrapper.
  const payload = buildSettaApiPayload(route, config.requestBody);
  void post(route, payload);
}
