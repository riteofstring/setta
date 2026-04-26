import type { AppSubsystemFrontendHost } from "./contract";

const activeHostCounts = new Map<AppSubsystemFrontendHost, number>();
const activeHostOrder: AppSubsystemFrontendHost[] = [];

function removeActiveHostFromOrder(host: AppSubsystemFrontendHost): void {
  const index = activeHostOrder.indexOf(host);
  if (index >= 0) {
    activeHostOrder.splice(index, 1);
  }
}

export function activateAppSubsystemFrontendHostRuntime(
  host: AppSubsystemFrontendHost,
): void {
  const currentCount = activeHostCounts.get(host) ?? 0;
  activeHostCounts.set(host, currentCount + 1);
  removeActiveHostFromOrder(host);
  activeHostOrder.push(host);
}

export function deactivateAppSubsystemFrontendHostRuntime(
  host: AppSubsystemFrontendHost,
): void {
  const currentCount = activeHostCounts.get(host);
  if (!currentCount) {
    return;
  }
  if (currentCount === 1) {
    activeHostCounts.delete(host);
    removeActiveHostFromOrder(host);
    return;
  }
  activeHostCounts.set(host, currentCount - 1);
}

export function getActiveAppSubsystemFrontendHostRuntime(): AppSubsystemFrontendHost | null {
  for (let index = activeHostOrder.length - 1; index >= 0; index -= 1) {
    const host = activeHostOrder[index];
    if (host && activeHostCounts.has(host)) {
      return host;
    }
  }
  return null;
}

export async function runWithAppSubsystemFrontendHostRuntime<T>(
  host: AppSubsystemFrontendHost,
  run: () => T | Promise<T>,
): Promise<T> {
  activateAppSubsystemFrontendHostRuntime(host);
  try {
    return await run();
  } finally {
    deactivateAppSubsystemFrontendHostRuntime(host);
  }
}
