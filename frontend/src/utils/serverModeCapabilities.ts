import type { ServerModeResponse } from "./generatedTypes";

type ServerMode = ServerModeResponse["mode"] | null;

type ServerModeCapabilities = {
  canManageDesktopLauncher: boolean;
};

const MODE_CAPABILITY_MAP: Readonly<
  Record<ServerModeResponse["mode"], ServerModeCapabilities>
> = Object.freeze({
  ide: { canManageDesktopLauncher: true },
  share: { canManageDesktopLauncher: false },
  app: { canManageDesktopLauncher: false },
  launcher: { canManageDesktopLauncher: false },
});

export function resolveServerModeCapabilities(
  mode: ServerMode,
): ServerModeCapabilities {
  if (mode === null) {
    return { canManageDesktopLauncher: false };
  }
  return MODE_CAPABILITY_MAP[mode];
}
