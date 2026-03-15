let wasOpen = false;
let lastPathname: string | null = null;
let lastShareSessionId: string | null = null;
let currentShareSessionId: string | null = null;
let currentRoute: string | null = null;

export function rememberWebsocketTarget(
  pathname: string,
  shareSessionId: string | null,
): void {
  lastPathname = pathname;
  lastShareSessionId = shareSessionId;
}

export function getLastWebsocketPathname(): string | null {
  return lastPathname;
}

export function getLastWebsocketTarget(pathname: string): {
  pathname: string;
  shareSessionId: string | null;
} {
  return {
    pathname: lastPathname ?? pathname,
    shareSessionId: lastShareSessionId,
  };
}

export function getCurrentWebsocketShareSessionId(): string | null {
  return currentShareSessionId;
}

export function matchesCurrentWebsocketTarget(
  route: string,
  shareSessionId: string | null,
): boolean {
  return currentRoute === route && currentShareSessionId === shareSessionId;
}

export function setCurrentWebsocketTarget(
  route: string,
  shareSessionId: string | null,
): void {
  currentRoute = route;
  currentShareSessionId = shareSessionId;
}

export function clearCurrentWebsocketTarget(): void {
  currentRoute = null;
  currentShareSessionId = null;
}

export function markWebsocketOpen(): void {
  wasOpen = true;
}

export function clearWasWebsocketOpen(): void {
  wasOpen = false;
}

export function consumeWasWebsocketOpen(): boolean {
  const nextWasOpen = wasOpen;
  wasOpen = false;
  return nextWasOpen;
}
