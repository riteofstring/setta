type LogPayload =
  | Record<string, unknown>
  | Array<unknown>
  | string
  | number
  | boolean
  | null;

export function logStateEvent(label: string, payload?: LogPayload): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] ${label}`;
  if (payload === undefined) {
    console.log(prefix);
    return;
  }
  if (typeof payload === "string") {
    console.log(prefix, payload);
    return;
  }
  console.log(prefix, JSON.stringify(payload));
}
