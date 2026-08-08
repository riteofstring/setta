import { C } from "./c";
import { BootstrapProtocol, TransportRouteConstants } from "./generatedTypes";
import { getOrInitLauncherOriginWithStorageKey } from "./launcherOrigin";
import { normalizeOrigin } from "./origin";
import { isSameHostOrLocalPeerOriginAllowed } from "./originPolicy";
import { safeSessionStorage } from "./storage";

export const BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY =
  "setta.backendOriginOverride";
export const BACKEND_ORIGIN_OVERRIDE_ALLOW_NON_LOCAL_STORAGE_KEY =
  "setta.backendOriginOverrideAllowNonLocal";

type AddressResolverConfig = {
  apiPrefix: string;
  backendOriginOverrideAllowNonLocalStorageKey: string;
  backendOriginOverrideStorageKey: string;
  defaultHost: string;
  defaultPort: number;
  devBackendOriginOverride: string | undefined;
  devMode: boolean | undefined;
  launcherOriginStorageKey: string;
  locationOrigin: string;
};

function readBackendOriginSessionOverride(
  backendOriginOverrideStorageKey: string,
): string | undefined {
  const storage = safeSessionStorage();
  if (!storage) {
    return undefined;
  }
  try {
    const rawOverride = storage.getItem(backendOriginOverrideStorageKey);
    if (!rawOverride) {
      return undefined;
    }
    return normalizeOrigin(
      rawOverride,
      "backend origin override (sessionStorage)",
    );
  } catch (error) {
    console.warn(
      "Failed to read backend origin override from sessionStorage",
      error,
    );
    return undefined;
  }
}

function readBackendOriginOverrideAllowNonLocal(
  backendOriginOverrideAllowNonLocalStorageKey: string,
): string | undefined {
  const storage = safeSessionStorage();
  if (!storage) {
    return undefined;
  }
  try {
    const rawOverride = storage.getItem(
      backendOriginOverrideAllowNonLocalStorageKey,
    );
    if (!rawOverride) {
      return undefined;
    }
    return normalizeOrigin(
      rawOverride,
      "backend origin override allow marker (sessionStorage)",
    );
  } catch (error) {
    console.warn(
      "Failed to read backend origin override allow marker from sessionStorage",
      error,
    );
    return undefined;
  }
}

function resolveBackendOriginSessionOverride(
  config: AddressResolverConfig,
): string | undefined {
  const override = readBackendOriginSessionOverride(
    config.backendOriginOverrideStorageKey,
  );
  if (!override) {
    return undefined;
  }
  if (isSameHostOrLocalPeerOriginAllowed(override, config.locationOrigin)) {
    return override;
  }
  const allowedNonLocalOverride = readBackendOriginOverrideAllowNonLocal(
    config.backendOriginOverrideAllowNonLocalStorageKey,
  );
  return allowedNonLocalOverride === override ? override : undefined;
}

function resolveDevBackendOriginOverride(
  devBackendOriginOverride: string | undefined,
): string | undefined {
  if (!devBackendOriginOverride) {
    return undefined;
  }
  return normalizeOrigin(devBackendOriginOverride, "VITE_BACKEND_ORIGIN");
}

function resolveBackendOrigin(config: AddressResolverConfig): string {
  const sessionOverride = resolveBackendOriginSessionOverride(config);
  if (sessionOverride) {
    return sessionOverride;
  }
  if (config.devMode) {
    const override = resolveDevBackendOriginOverride(
      config.devBackendOriginOverride,
    );
    if (override) {
      return override;
    }
    return `http://${config.defaultHost}:${config.defaultPort}`;
  }
  return config.locationOrigin;
}

function resolveLauncherOrigin(config: AddressResolverConfig): string {
  const sessionOverride = resolveBackendOriginSessionOverride(config);
  if (!config.devMode) {
    return getOrInitLauncherOriginWithStorageKey(
      sessionOverride ?? config.locationOrigin,
      config.launcherOriginStorageKey,
    );
  }

  const override = resolveDevBackendOriginOverride(
    config.devBackendOriginOverride,
  );
  if (override) {
    return getOrInitLauncherOriginWithStorageKey(
      override,
      config.launcherOriginStorageKey,
    );
  }

  let fallback = `http://${config.defaultHost}:${config.defaultPort}`;
  try {
    const backendUrl = new URL(resolveBackendOrigin(config));
    if (backendUrl.protocol === "http:" || backendUrl.protocol === "https:") {
      const hostname = backendUrl.hostname.includes(":")
        ? `[${backendUrl.hostname}]`
        : backendUrl.hostname;
      fallback = `${backendUrl.protocol}//${hostname}:${config.defaultPort}`;
    }
  } catch {
    // Ignore invalid origin values and keep the default fallback.
  }
  return getOrInitLauncherOriginWithStorageKey(
    fallback,
    config.launcherOriginStorageKey,
  );
}

function defaultAddressResolverConfig(): AddressResolverConfig {
  return {
    apiPrefix: TransportRouteConstants.apiPrefix,
    backendOriginOverrideAllowNonLocalStorageKey:
      BACKEND_ORIGIN_OVERRIDE_ALLOW_NON_LOCAL_STORAGE_KEY,
    backendOriginOverrideStorageKey: BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
    defaultHost: C.DEFAULT_HOST,
    defaultPort: C.DEFAULT_PORT,
    devBackendOriginOverride: import.meta.env?.VITE_BACKEND_ORIGIN as
      | string
      | undefined,
    devMode: import.meta.env?.DEV,
    launcherOriginStorageKey: BootstrapProtocol.launcherOriginStorageKey,
    locationOrigin:
      typeof location === "undefined" ? "http://localhost" : location.origin,
  };
}

export class C_ADDRESSES {
  static get DEV_MODE() {
    return defaultAddressResolverConfig().devMode;
  }

  static get DEV_BACKEND_ORIGIN_SESSION_OVERRIDE() {
    return resolveBackendOriginSessionOverride(defaultAddressResolverConfig());
  }

  static get DEV_BACKEND_ORIGIN_OVERRIDE() {
    return resolveDevBackendOriginOverride(
      defaultAddressResolverConfig().devBackendOriginOverride,
    );
  }

  static get BACKEND_ORIGIN() {
    return resolveBackendOrigin(defaultAddressResolverConfig());
  }

  static get LAUNCHER_ORIGIN() {
    return resolveLauncherOrigin(defaultAddressResolverConfig());
  }

  static get LAUNCHER() {
    return `${this.LAUNCHER_ORIGIN}${TransportRouteConstants.apiPrefix}`;
  }

  static get BACKEND() {
    return `${this.BACKEND_ORIGIN}${TransportRouteConstants.apiPrefix}`;
  }

  static get WEBSOCKET() {
    const originUrl = new URL(this.BACKEND_ORIGIN);
    const protocol =
      originUrl.protocol === "https:" || originUrl.protocol === "wss:"
        ? "wss:"
        : "ws:";
    return `${protocol}//${originUrl.host}${TransportRouteConstants.apiPrefix}`;
  }
}
