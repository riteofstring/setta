export type TerminalLockDebugEntry = {
  event: string;
  ts: string;
  [key: string]: unknown;
};

type WindowWithTerminalLockDebug = Window & {
  __settaTerminalLockDebug?: TerminalLockDebugEntry[];
};

export function logTerminalLockDebug(
  event: string,
  payload: Record<string, unknown> = {},
): void {
  const entry: TerminalLockDebugEntry = {
    event,
    ts: new Date().toISOString(),
    ...payload,
  };
  const line = `[setta-terminal-lock] ${JSON.stringify(entry)}`;
  // eslint-disable-next-line no-console
  console.log(line);

  if (typeof window === "undefined") {
    return;
  }

  const win = window as WindowWithTerminalLockDebug;
  if (!win.__settaTerminalLockDebug) {
    win.__settaTerminalLockDebug = [];
  }
  win.__settaTerminalLockDebug.push(entry);
}
