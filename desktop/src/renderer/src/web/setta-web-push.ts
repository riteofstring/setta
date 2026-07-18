import type { BackendClient, RuntimeInfoResponse, WebPushSubscription } from "@generated/backend";

export async function subscribeForWebPush(
  info: RuntimeInfoResponse,
  client: BackendClient,
  requestPermission: boolean,
): Promise<void> {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return;
  }
  let permission = Notification.permission;
  if (permission === "default" && requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted" || info.vapidPublicKey === "") {
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      applicationServerKey: urlBase64ToArrayBuffer(info.vapidPublicKey),
      userVisibleOnly: true,
    }));
  await client.pushSubscribe({ subscription: pushSubscriptionJSON(subscription) });
}

function pushSubscriptionJSON(subscription: PushSubscription): WebPushSubscription {
  const json = subscription.toJSON();
  if (typeof json.endpoint !== "string" || !json.keys) {
    throw new Error("push subscription JSON is missing endpoint or keys");
  }
  const keys = json.keys as Record<string, unknown>;
  if (typeof keys.auth !== "string" || typeof keys.p256dh !== "string") {
    throw new Error("push subscription JSON is missing auth or p256dh keys");
  }
  return {
    endpoint: json.endpoint,
    keys: {
      auth: keys.auth,
      p256dh: keys.p256dh,
    },
  };
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return buffer;
}
