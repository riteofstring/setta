import { LocalHostnamePolicyConfig } from "./generatedTypes";

const LOCAL_HOSTNAME_SET = new Set(
  LocalHostnamePolicyConfig.loopbackHosts.map((hostname: string) =>
    hostname.toLowerCase(),
  ),
);

export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAME_SET.has(hostname.trim().toLowerCase());
}
