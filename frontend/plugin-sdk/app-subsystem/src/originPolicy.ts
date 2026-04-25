import { isLocalHostname } from "./hostnames";

export function isSameHostOrLocalPeerOriginAllowed(
  peerOrigin: string,
  currentOrigin: string,
): boolean {
  let peerUrl: URL;
  let currentUrl: URL;
  try {
    peerUrl = new URL(peerOrigin);
    currentUrl = new URL(currentOrigin);
  } catch {
    return false;
  }
  if (peerUrl.hostname === currentUrl.hostname) {
    return true;
  }
  return (
    isLocalHostname(peerUrl.hostname) && isLocalHostname(currentUrl.hostname)
  );
}
