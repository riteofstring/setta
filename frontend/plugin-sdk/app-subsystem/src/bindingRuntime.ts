function formatGeneratedOriginHost(hostname: string): string {
  if (hostname.includes(":") && !hostname.startsWith("[")) {
    return "[" + hostname + "]";
  }
  return hostname;
}

function parseGeneratedOrigin(
  rawOrigin: string | null | undefined,
): URL | null {
  if (typeof rawOrigin !== "string") {
    return null;
  }
  const trimmedOrigin = rawOrigin.trim();
  if (!trimmedOrigin) {
    return null;
  }
  try {
    return new URL(trimmedOrigin);
  } catch {
    return null;
  }
}

function isGeneratedHttpOrigin(parsedOrigin: URL): boolean {
  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    return false;
  }
  if (!parsedOrigin.hostname) {
    return false;
  }
  return !parsedOrigin.username && !parsedOrigin.password;
}

function formatNormalizedGeneratedOrigin(parsedOrigin: URL): string {
  const formattedHost = formatGeneratedOriginHost(parsedOrigin.hostname);
  const port = parsedOrigin.port.trim();
  if (!port) {
    return parsedOrigin.protocol + "//" + formattedHost;
  }
  return parsedOrigin.protocol + "//" + formattedHost + ":" + port;
}

export function normalizeGeneratedOrigin(
  rawOrigin: string | null | undefined,
): string | null {
  const parsedOrigin = parseGeneratedOrigin(rawOrigin);
  if (!parsedOrigin) {
    return null;
  }
  if (!isGeneratedHttpOrigin(parsedOrigin)) {
    return null;
  }
  return formatNormalizedGeneratedOrigin(parsedOrigin);
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

function hasGeneratedControlCharacters(value: string): boolean {
  for (const char of value) {
    const codepoint = char.codePointAt(0);
    if (codepoint !== undefined && (codepoint < 32 || codepoint === 127)) {
      return true;
    }
  }
  return false;
}

function getGeneratedPathError(value: string, label: string): string | null {
  if (value.includes("/") || value.includes("\\")) {
    return label + " cannot include path separators.";
  }
  if (value.includes("..")) {
    return label + " cannot include '..' path segments.";
  }
  return null;
}

function validateGeneratedCommonNameInput(
  name: string,
  options: {
    allowEmpty: boolean;
    label: string;
    skipPathChecks?: boolean;
  },
): string | null {
  const normalized = name.trim();
  if (!normalized) {
    return options.allowEmpty ? null : options.label + " cannot be empty.";
  }
  if (hasGeneratedControlCharacters(normalized)) {
    return options.label + " cannot include control characters.";
  }
  if (options.skipPathChecks ?? false) {
    return null;
  }
  return getGeneratedPathError(normalized, options.label);
}

export function validateGeneratedSimpleNameInput(
  name: string,
  label: string,
  reservedNames: ReadonlySet<string>,
  allowedChars: ReadonlySet<string>,
  allowReserved: boolean = false,
): string | null {
  const baseError = validateGeneratedCommonNameInput(name, {
    allowEmpty: false,
    label,
  });
  if (baseError) {
    return baseError;
  }
  const normalized = name.trim();
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
  pythonKeywords?: ReadonlySet<string>,
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
  return index > 0 && !(pythonKeywords?.has(value) ?? false);
}

export function validateGeneratedParamNameInput(
  name: string,
  options: {
    allowEmpty: boolean;
    label: string;
    requirePythonIdentifier: boolean;
    pythonIdentifierStartChars: ReadonlySet<string>;
    pythonIdentifierContinueChars: ReadonlySet<string>;
    pythonKeywords: ReadonlySet<string>;
    skipPathChecks?: boolean;
  },
): string | null {
  const commonOptions: {
    allowEmpty: boolean;
    label: string;
    skipPathChecks?: boolean;
  } = {
    allowEmpty: options.allowEmpty,
    label: options.label,
  };
  if (options.skipPathChecks !== undefined) {
    commonOptions.skipPathChecks = options.skipPathChecks;
  }
  const baseError = validateGeneratedCommonNameInput(name, commonOptions);
  if (baseError) {
    return baseError;
  }
  const normalized = name.trim();
  if (!normalized) {
    return null;
  }
  if (options.requirePythonIdentifier) {
    if (
      !isGeneratedPythonIdentifier(
        normalized,
        options.pythonIdentifierStartChars,
        options.pythonIdentifierContinueChars,
      )
    ) {
      return options.label + " must be a valid Python identifier.";
    }
    if (options.pythonKeywords.has(normalized)) {
      return options.label + " cannot be a Python keyword.";
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
