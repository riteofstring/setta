function formatGeneratedOriginHost(hostname: string): string {
  if (hostname.includes(":") && !hostname.startsWith("[")) {
    return "[" + hostname + "]";
  }
  return hostname;
}

export function normalizeGeneratedOrigin(
  rawOrigin: string | null | undefined,
): string | null {
  if (typeof rawOrigin !== "string") {
    return null;
  }
  const trimmedOrigin = rawOrigin.trim();
  if (!trimmedOrigin) {
    return null;
  }
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(trimmedOrigin);
  } catch {
    return null;
  }
  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    return null;
  }
  if (!parsedOrigin.hostname) {
    return null;
  }
  if (parsedOrigin.username || parsedOrigin.password) {
    return null;
  }
  const port = parsedOrigin.port.trim();
  if (!port) {
    return (
      parsedOrigin.protocol +
      "//" +
      formatGeneratedOriginHost(parsedOrigin.hostname)
    );
  }
  return (
    parsedOrigin.protocol +
    "//" +
    formatGeneratedOriginHost(parsedOrigin.hostname) +
    ":" +
    port
  );
}

export function normalizeGeneratedToolName(
  rawToolName: string | null | undefined,
  singlePrefix: string,
  doublePrefix: string,
  askUserQuestionToolName: string,
): string | null {
  if (typeof rawToolName !== "string") {
    return null;
  }
  const trimmed = rawToolName.trim();
  if (!trimmed) {
    return null;
  }
  let normalized = trimmed;
  if (normalized.startsWith("mcp__")) {
    normalized = normalized.slice("mcp__".length);
  }
  if (
    normalized.startsWith(singlePrefix) &&
    !normalized.startsWith(doublePrefix)
  ) {
    normalized = doublePrefix + normalized.slice(singlePrefix.length);
  }
  if (!trimmed.startsWith("mcp__") && normalized.toLowerCase() === "question") {
    return askUserQuestionToolName;
  }
  return normalized;
}

export function validateGeneratedSimpleNameInput(
  name: string,
  label: string,
  reservedNames: ReadonlySet<string>,
  allowedChars: ReadonlySet<string>,
  allowReserved: boolean = false,
): string | null {
  const normalized = name.trim();
  if (!normalized) {
    return label + " cannot be empty.";
  }
  for (const char of normalized) {
    const codepoint = char.codePointAt(0);
    if (codepoint !== undefined && (codepoint < 32 || codepoint === 127)) {
      return label + " cannot include control characters.";
    }
  }
  if (normalized.includes("/") || normalized.includes("\\")) {
    return label + " cannot include path separators.";
  }
  if (normalized.includes("..")) {
    return label + " cannot include '..' path segments.";
  }
  for (const char of normalized) {
    if (!allowedChars.has(char)) {
      return label + " can only contain letters, numbers, spaces, '_' and '-'.";
    }
  }
  if (!allowReserved && reservedNames.has(normalized.toLowerCase())) {
    return label + " '" + normalized + "' is reserved.";
  }
  return null;
}

export function sanitizeGeneratedSimpleNameSlug(
  name: string,
  replacementChars: ReadonlySet<string>,
): string {
  let output = "";
  for (const char of name) {
    output += replacementChars.has(char) ? "_" : char;
  }
  while (output.includes("__")) {
    output = output.replace("__", "_");
  }
  while (output.startsWith("_")) {
    output = output.slice(1);
  }
  while (output.endsWith("_")) {
    output = output.slice(0, -1);
  }
  return output.toLowerCase();
}

export function isGeneratedPythonIdentifier(
  value: string,
  startChars: ReadonlySet<string>,
  continueChars: ReadonlySet<string>,
): boolean {
  let index = 0;
  for (const char of value) {
    if (index === 0) {
      if (!startChars.has(char)) {
        return false;
      }
    } else if (!continueChars.has(char)) {
      return false;
    }
    index += 1;
  }
  return index > 0;
}

export function validateGeneratedParamNameInput(
  name: string,
  options: {
    allowEmpty: boolean;
    requirePythonIdentifier: boolean;
    skipPathChecks?: boolean;
  },
  pythonKeywords: ReadonlySet<string>,
  isPythonIdentifier: (value: string) => boolean,
): string | null {
  const normalized = name.trim();
  if (!normalized) {
    return options.allowEmpty ? null : "Param name cannot be empty.";
  }
  for (const char of normalized) {
    const codepoint = char.codePointAt(0);
    if (codepoint !== undefined && (codepoint < 32 || codepoint === 127)) {
      return "Param name cannot include control characters.";
    }
  }
  if (!(options.skipPathChecks ?? false)) {
    if (normalized.includes("/") || normalized.includes("\\")) {
      return "Param name cannot include path separators.";
    }
    if (normalized.includes("..")) {
      return "Param name cannot include '..' path segments.";
    }
  }
  if (options.requirePythonIdentifier) {
    if (!isPythonIdentifier(normalized)) {
      return "Param name must be a valid Python identifier.";
    }
    if (pythonKeywords.has(normalized)) {
      return "Param name cannot be a Python keyword.";
    }
  }
  return null;
}

function stripGeneratedTransportAddressQueryAndHash(address: string): string {
  const hashIndex = address.indexOf("#");
  let withoutHash = address;
  if (hashIndex >= 0) {
    withoutHash = address.slice(0, hashIndex);
  }
  const queryIndex = withoutHash.indexOf("?");
  if (queryIndex >= 0) {
    return withoutHash.slice(0, queryIndex);
  }
  return withoutHash;
}

export function resolveGeneratedServerModeCapabilities<
  TMode extends string,
  TCapabilities,
>(
  policy: Readonly<Record<TMode, { capabilities: TCapabilities }>>,
  mode: TMode | null,
  nullCapabilities: TCapabilities,
): TCapabilities {
  if (mode === null) {
    return nullCapabilities;
  }
  return policy[mode].capabilities;
}

export function resolveGeneratedWorkspaceLaunchRouteKind<
  TMode extends string,
  TWorkspaceLaunchRouteKind extends string,
>(
  policy: Readonly<
    Record<TMode, { workspaceLaunchRouteKind: TWorkspaceLaunchRouteKind }>
  >,
  mode: TMode | null,
  nullRouteKind: TWorkspaceLaunchRouteKind,
): TWorkspaceLaunchRouteKind {
  if (mode === null) {
    return nullRouteKind;
  }
  return policy[mode].workspaceLaunchRouteKind;
}

export function resolveGeneratedEndpointOriginForMode<
  TMode extends string,
  TEndpointOriginPolicy extends string,
>(
  address: string,
  serverMode: TMode | null,
  options: {
    bootstrapPage: string;
    launcherMode: TMode;
    endpointOriginPolicy: Readonly<Record<string, TEndpointOriginPolicy>>;
    modeScopedLauncherRoutes: ReadonlySet<string>;
    backendOriginValue: TEndpointOriginPolicy;
    launcherOriginValue: TEndpointOriginPolicy;
    backendValue: TEndpointOriginPolicy;
  },
): TEndpointOriginPolicy {
  const normalizedAddress = stripGeneratedTransportAddressQueryAndHash(address);
  if (normalizedAddress.startsWith(options.bootstrapPage)) {
    return options.backendOriginValue;
  }
  const routePolicy = options.endpointOriginPolicy[normalizedAddress];
  if (routePolicy === options.backendOriginValue) {
    return options.backendOriginValue;
  }
  if (routePolicy === options.launcherOriginValue) {
    if (
      options.modeScopedLauncherRoutes.has(normalizedAddress) &&
      serverMode !== options.launcherMode
    ) {
      return options.backendValue;
    }
    return options.launcherOriginValue;
  }
  return options.backendValue;
}

export function websocketSupportIsRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function websocketSupportReadRequiredString(
  value: unknown,
  fieldName: string,
  issues: Array<string>,
): string {
  if (typeof value === "string") {
    return value;
  }
  issues.push(fieldName + " must be a string.");
  return "";
}

export function websocketSupportReadOptionalString(
  value: unknown,
  fieldName: string,
  issues: Array<string>,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  issues.push(fieldName + " must be a string or null.");
  return null;
}

export function websocketSupportReadDurationMs(
  value: unknown,
  issues: Array<string>,
): number {
  if (value === undefined) {
    return 3000;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  issues.push("durationMs must be a finite number.");
  return 3000;
}
