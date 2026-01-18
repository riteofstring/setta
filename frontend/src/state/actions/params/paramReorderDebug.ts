type GlobalDebugFlag = {
  __SETTA_PARAM_REORDER_RAW__?: boolean;
};

const CIRCULAR_MARKER = "[Circular]";
const UNSTRINGIFIABLE_MARKER = "[Unserializable]";

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, val: unknown) => {
      if (typeof val === "bigint") {
        return `${val.toString()}n`;
      }
      if (typeof val === "function") {
        return "[Function]";
      }
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) {
          return CIRCULAR_MARKER;
        }
        seen.add(val);
      }
      return val;
    });
  } catch (_err) {
    return UNSTRINGIFIABLE_MARKER;
  }
}

function serializeArg(arg: unknown): unknown {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}`;
  }
  if (arg === null || arg === undefined) {
    return arg;
  }
  const argType = typeof arg;
  if (argType === "string" || argType === "number" || argType === "boolean") {
    return arg;
  }
  return safeStringify(arg);
}

export function logParamReorder(...args: unknown[]) {
  const useRaw = Boolean(
    (globalThis as GlobalDebugFlag).__SETTA_PARAM_REORDER_RAW__,
  );
  if (useRaw) {
    console.log("[param-reorder]", ...args);
    return;
  }
  const serialized = args.map(serializeArg);
  console.log("[param-reorder]", ...serialized);
}
