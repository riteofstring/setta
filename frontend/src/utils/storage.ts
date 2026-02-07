export function safeSessionStorage(): Storage | undefined {
  if (typeof sessionStorage !== "undefined") {
    return sessionStorage;
  }
  if (typeof window === "undefined") {
    return undefined;
  }
  if (typeof window.sessionStorage === "undefined") {
    return undefined;
  }
  return window.sessionStorage;
}
