import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { assertRecord } from "@shared/backend-runtime";
import type {
  MintTailscaleAuthKeyRequest,
  MintTailscaleAuthKeyResult,
  SaveTailscaleOAuthCredentialsRequest,
  TailscaleLocalTailnetStatus,
  TailscaleOAuthCredentialStatus,
  TailscaleOAuthSetupGuide,
  TailscaleOAuthValidationResult,
} from "@shared/types";
import type { RuntimeSecretStore } from "./runtime-secret-store";

const execFileAsync = promisify(execFile);
const tailscaleOAuthMetadataFileName = "tailscale-oauth.json";
const tailscaleOAuthMetadataSchemaVersion = 1;
const tailscaleOAuthSecretRef = "tailscale-oauth-client-secret:v1";
const defaultExpectedRuntimeTag = "tag:setta-runtime";
const defaultTailnet = "-";
const tailscaleAPIBaseURL = "https://api.tailscale.com";
const tailscaleOAuthTokenPath = "/api/v2/oauth/token";
const tailscaleAuthKeysScope = "auth_keys";
const defaultAuthKeyExpirySeconds = 3600;
const validationAuthKeyExpirySeconds = 300;
const tailscaleStatusTimeoutMs = 3000;
const trustCredentialsURL = "https://login.tailscale.com/admin/settings/oauth";
const authKeysURL = "https://login.tailscale.com/admin/settings/keys";
const oauthDocsURL = "https://tailscale.com/docs/features/oauth-clients";

type TailscaleFetch = (input: URL, init: RequestInit) => Promise<Response>;

interface StoredTailscaleOAuthMetadata {
  client_id: string;
  client_secret_ref: string;
  expected_tag: string;
  last_validated_at: string | null;
  last_validation_error: string | null;
  last_validation_status: "valid" | "failed" | null;
  schema_version: 1;
  tailnet: string;
}

interface TailscaleOAuthServiceOptions {
  fetchImpl?: TailscaleFetch;
  now?: () => Date;
  readLocalTailnetStatus?: () => Promise<TailscaleLocalTailnetStatus>;
  secretStore: RuntimeSecretStore;
  userDataDir: string;
}

interface StoredTailscaleOAuthCredentials {
  clientId: string;
  clientSecret: string;
  expectedTag: string;
  tailnet: string;
}

interface TailscaleAccessToken {
  accessToken: string;
}

interface TailscaleCreateAuthKeyInput {
  description: string;
  ephemeral: boolean;
  expirySeconds: number;
  preauthorized: boolean;
  reusable: boolean;
  tags: string[];
}

interface TailscaleCreatedAuthKey {
  expiresAt: string | null;
  id: string | null;
  key: string;
}

class TailscaleOAuthError extends Error {
  constructor(
    readonly code: TailscaleOAuthValidationResult["code"],
    message: string,
  ) {
    super(message);
  }
}

export class TailscaleOAuthService {
  private readonly fetchImpl: TailscaleFetch;
  private readonly now: () => Date;
  private readonly readLocalTailnetStatusImpl: () => Promise<TailscaleLocalTailnetStatus>;
  private readonly secretStore: RuntimeSecretStore;
  private readonly userDataDir: string;

  constructor(options: TailscaleOAuthServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.readLocalTailnetStatusImpl = options.readLocalTailnetStatus ?? readLocalTailnetStatus;
    this.secretStore = options.secretStore;
    this.userDataDir = options.userDataDir;
  }

  async setupGuide(): Promise<TailscaleOAuthSetupGuide> {
    const [oauth, localTailnet] = await Promise.all([
      this.status(),
      this.readLocalTailnetStatusImpl(),
    ]);
    return {
      aclSnippet: tailscaleTagOwnersSnippet(oauth.expectedTag),
      adminConsoleUrl: trustCredentialsURL,
      credentialFields: {
        clientIdLabel: "OAuth client ID",
        clientSecretLabel: "OAuth client secret",
      },
      docsUrl: oauthDocsURL,
      localTailnet,
      manualAuthKeyFallback: {
        adminConsoleUrl: authKeysURL,
        description:
          "Manual paste remains available: generate a one-off, preauthorized auth key tagged for Setta runtimes and paste it into the setup form.",
        expectedTag: oauth.expectedTag,
      },
      oauth,
      requiredScope: tailscaleAuthKeysScope,
      requiredTag: oauth.expectedTag,
      runtimeIsolationPolicySnippet: tailscaleRuntimeIsolationSnippet(oauth.expectedTag),
    };
  }

  async status(): Promise<TailscaleOAuthCredentialStatus> {
    const metadata = await this.readMetadata();
    if (!metadata) {
      return this.statusFromMetadata(null, false);
    }
    const secret = await this.secretStore.getSecret(metadata.client_secret_ref);
    return this.statusFromMetadata(metadata, secret !== null);
  }

  async saveCredentials(
    request: SaveTailscaleOAuthCredentialsRequest,
  ): Promise<TailscaleOAuthCredentialStatus> {
    const metadata = normalizeSaveCredentialsRequest(request);
    await this.secretStore.setSecret(tailscaleOAuthSecretRef, request.clientSecret.trim());
    await this.writeMetadata(metadata);
    return this.statusFromMetadata(metadata, true);
  }

  async clearCredentials(): Promise<TailscaleOAuthCredentialStatus> {
    await this.writeMetadata(null);
    await this.secretStore.deleteSecret(tailscaleOAuthSecretRef);
    return this.statusFromMetadata(null, false);
  }

  async validateCredentials(): Promise<TailscaleOAuthValidationResult> {
    const credentials = await this.readCredentials();
    if (!credentials) {
      return {
        code: "tailscale_oauth_not_configured",
        keyId: null,
        message: "Tailscale OAuth credentials have not been stored.",
        ok: false,
        revoked: false,
        tag: defaultExpectedRuntimeTag,
      };
    }
    let key: TailscaleCreatedAuthKey;
    try {
      key = await this.createAuthKey(credentials, {
        description: `Setta OAuth validation for ${credentials.expectedTag}`,
        ephemeral: false,
        expirySeconds: validationAuthKeyExpirySeconds,
        preauthorized: true,
        reusable: false,
        tags: [credentials.expectedTag],
      });
    } catch (error) {
      if (error instanceof TailscaleOAuthError) {
        await this.recordValidation(credentials, "failed", error.message);
        return {
          code: error.code,
          keyId: null,
          message: error.message,
          ok: false,
          revoked: false,
          tag: credentials.expectedTag,
        };
      }
      throw error;
    }
    if (!key.id) {
      const message = "Tailscale created a validation auth key without returning a key ID.";
      await this.recordValidation(credentials, "failed", message);
      return {
        code: "tailscale_oauth_api_error",
        keyId: null,
        message,
        ok: false,
        revoked: false,
        tag: credentials.expectedTag,
      };
    }
    try {
      await this.revokeAuthKey(credentials, key.id);
    } catch (error) {
      const message = `Tailscale validation key was created but could not be revoked: ${errorMessage(error)}`;
      await this.recordValidation(credentials, "failed", message);
      return {
        code: "tailscale_oauth_revoke_failed",
        keyId: key.id,
        message,
        ok: false,
        revoked: false,
        tag: credentials.expectedTag,
      };
    }
    await this.recordValidation(credentials, "valid", null);
    return {
      code: "tailscale_oauth_valid",
      keyId: key.id,
      message: `Tailscale OAuth client can mint and revoke auth keys for ${credentials.expectedTag}.`,
      ok: true,
      revoked: true,
      tag: credentials.expectedTag,
    };
  }

  async mintAuthKey(request: MintTailscaleAuthKeyRequest): Promise<MintTailscaleAuthKeyResult> {
    const credentials = await this.readCredentials();
    if (!credentials) {
      throw new Error("Tailscale OAuth credentials have not been stored.");
    }
    const input = normalizeMintAuthKeyRequest(request, credentials.expectedTag);
    const key = await this.createAuthKey(credentials, input);
    return {
      authKey: key.key,
      createdAt: this.now().toISOString(),
      description: input.description,
      ephemeral: input.ephemeral,
      expiresAt: key.expiresAt,
      expirySeconds: input.expirySeconds,
      keyId: key.id,
      preauthorized: input.preauthorized,
      reusable: input.reusable,
      tags: input.tags,
    };
  }

  private metadataPath(): string {
    return join(this.userDataDir, tailscaleOAuthMetadataFileName);
  }

  private statusFromMetadata(
    metadata: StoredTailscaleOAuthMetadata | null,
    secretPresent: boolean,
  ): TailscaleOAuthCredentialStatus {
    const secretStorage = this.secretStore.status();
    if (!metadata) {
      return {
        clientIdPreview: null,
        configured: false,
        expectedTag: defaultExpectedRuntimeTag,
        lastValidatedAt: null,
        lastValidationError: null,
        lastValidationStatus: null,
        secretStorage,
        tailnet: defaultTailnet,
      };
    }
    return {
      clientIdPreview: previewClientID(metadata.client_id),
      configured: secretPresent,
      expectedTag: metadata.expected_tag,
      lastValidatedAt: metadata.last_validated_at,
      lastValidationError: metadata.last_validation_error,
      lastValidationStatus: metadata.last_validation_status,
      secretStorage,
      tailnet: metadata.tailnet,
    };
  }

  private async recordValidation(
    credentials: StoredTailscaleOAuthCredentials,
    status: "valid" | "failed",
    error: string | null,
  ): Promise<void> {
    await this.writeMetadata({
      client_id: credentials.clientId,
      client_secret_ref: tailscaleOAuthSecretRef,
      expected_tag: credentials.expectedTag,
      last_validated_at: this.now().toISOString(),
      last_validation_error: error,
      last_validation_status: status,
      schema_version: tailscaleOAuthMetadataSchemaVersion,
      tailnet: credentials.tailnet,
    });
  }

  private async readCredentials(): Promise<StoredTailscaleOAuthCredentials | null> {
    const metadata = await this.readMetadata();
    if (!metadata) {
      return null;
    }
    const clientSecret = await this.secretStore.getSecret(metadata.client_secret_ref);
    if (!clientSecret) {
      return null;
    }
    return {
      clientId: metadata.client_id,
      clientSecret,
      expectedTag: metadata.expected_tag,
      tailnet: metadata.tailnet,
    };
  }

  private async createAuthKey(
    credentials: StoredTailscaleOAuthCredentials,
    input: TailscaleCreateAuthKeyInput,
  ): Promise<TailscaleCreatedAuthKey> {
    const token = await this.fetchOAuthToken(credentials);
    const response = await this.fetchTailscale(
      authKeysURLForTailnet(credentials.tailnet),
      {
        body: JSON.stringify({
          capabilities: {
            devices: {
              create: {
                ephemeral: input.ephemeral,
                preauthorized: input.preauthorized,
                reusable: input.reusable,
                tags: input.tags,
              },
            },
          },
          description: input.description,
          expirySeconds: input.expirySeconds,
        }),
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
      "create Tailscale auth key",
    );
    if (!response.ok) {
      const message = await tailscaleErrorMessage(response);
      throw new TailscaleOAuthError(
        classifyAuthKeyCreateFailure(response.status),
        authKeyCreateFailureMessage(input.tags, message),
      );
    }
    return decodeCreatedAuthKey(await response.json());
  }

  private async revokeAuthKey(
    credentials: StoredTailscaleOAuthCredentials,
    keyId: string,
  ): Promise<void> {
    const token = await this.fetchOAuthToken(credentials);
    const response = await this.fetchTailscale(
      authKeyURLForTailnet(credentials.tailnet, keyId),
      {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
        },
        method: "DELETE",
      },
      "revoke Tailscale auth key",
    );
    if (!response.ok) {
      throw new Error(await tailscaleErrorMessage(response));
    }
  }

  private async fetchOAuthToken(
    credentials: StoredTailscaleOAuthCredentials,
  ): Promise<TailscaleAccessToken> {
    const body = new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      scope: tailscaleAuthKeysScope,
      tags: credentials.expectedTag,
    });
    const response = await this.fetchTailscale(
      new URL(tailscaleOAuthTokenPath, tailscaleAPIBaseURL),
      {
        body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      },
      "request Tailscale OAuth token",
    );
    if (!response.ok) {
      const message = await tailscaleErrorMessage(response);
      throw new TailscaleOAuthError(
        response.status === 400 || response.status === 401
          ? "tailscale_oauth_invalid_credentials"
          : "tailscale_oauth_api_error",
        `Tailscale OAuth token request failed: ${message}`,
      );
    }
    const record = assertRecord(await response.json(), "TailscaleOAuthTokenResponse");
    const accessToken = stringField(record, "access_token", "TailscaleOAuthTokenResponse");
    const tokenType = optionalStringField(record, "token_type", "TailscaleOAuthTokenResponse");
    if (tokenType && tokenType.toLowerCase() !== "bearer") {
      throw new TailscaleOAuthError(
        "tailscale_oauth_api_error",
        `Tailscale OAuth token type ${tokenType} is not supported.`,
      );
    }
    return { accessToken };
  }

  private async fetchTailscale(
    input: URL,
    init: RequestInit,
    operation: string,
  ): Promise<Response> {
    try {
      return await this.fetchImpl(input, init);
    } catch (error) {
      throw new TailscaleOAuthError(
        "tailscale_oauth_network_failed",
        `${operation} failed before Tailscale returned a response: ${errorMessage(error)}`,
      );
    }
  }

  private async readMetadata(): Promise<StoredTailscaleOAuthMetadata | null> {
    let raw: string;
    try {
      raw = await readFile(this.metadataPath(), "utf8");
    } catch (error) {
      if (isENOENT(error)) {
        return null;
      }
      throw error;
    }
    return decodeStoredTailscaleOAuthMetadata(JSON.parse(raw));
  }

  private async writeMetadata(metadata: StoredTailscaleOAuthMetadata | null): Promise<void> {
    const path = this.metadataPath();
    if (metadata === null) {
      await rm(path, { force: true });
      return;
    }
    await mkdir(dirname(path), { recursive: true });
    const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(metadata, null, 2) + "\n", { mode: 0o600 });
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, path);
  }
}

async function readLocalTailnetStatus(): Promise<TailscaleLocalTailnetStatus> {
  let stdout: string | Buffer;
  try {
    ({ stdout } = await execFileAsync("tailscale", ["status", "--json"], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: tailscaleStatusTimeoutMs,
    }));
  } catch (error) {
    if (isExecNotFound(error)) {
      return emptyLocalTailnetStatus("not_found", "tailscale CLI was not found in PATH");
    }
    return emptyLocalTailnetStatus(
      "error",
      `tailscale status --json failed: ${errorMessage(error)}`,
    );
  }
  try {
    return decodeLocalTailnetStatus(JSON.parse(String(stdout)));
  } catch (error) {
    return emptyLocalTailnetStatus(
      "error",
      `parse tailscale status --json: ${errorMessage(error)}`,
    );
  }
}

function decodeLocalTailnetStatus(value: unknown): TailscaleLocalTailnetStatus {
  const record = assertRecord(value, "TailscaleStatus");
  const self = optionalRecordField(record, "Self", "TailscaleStatus");
  if (!self) {
    return emptyLocalTailnetStatus(
      "not_joined",
      "tailscale status did not include this device; join a tailnet before one-click runtime setup",
    );
  }
  const currentTailnet = optionalRecordField(record, "CurrentTailnet", "TailscaleStatus");
  const dnsName =
    optionalStringField(self, "DNSName", "TailscaleStatus.Self") ??
    optionalStringField(self, "Name", "TailscaleStatus.Self");
  return {
    dnsName,
    error: null,
    loginName:
      optionalStringField(self, "LoginName", "TailscaleStatus.Self") ??
      optionalStringField(self, "User", "TailscaleStatus.Self"),
    status: "joined",
    tailnetName:
      optionalStringField(currentTailnet ?? {}, "Name", "TailscaleStatus.CurrentTailnet") ??
      optionalStringField(record, "MagicDNSSuffix", "TailscaleStatus"),
  };
}

function emptyLocalTailnetStatus(
  status: TailscaleLocalTailnetStatus["status"],
  error: string | null,
): TailscaleLocalTailnetStatus {
  return {
    dnsName: null,
    error,
    loginName: null,
    status,
    tailnetName: null,
  };
}

function normalizeSaveCredentialsRequest(
  request: SaveTailscaleOAuthCredentialsRequest,
): StoredTailscaleOAuthMetadata {
  const clientID = requiredPlainString(request.clientId, "clientId");
  requiredPlainString(request.clientSecret, "clientSecret");
  return {
    client_id: clientID,
    client_secret_ref: tailscaleOAuthSecretRef,
    expected_tag: normalizeExpectedTag(request.expectedTag),
    last_validated_at: null,
    last_validation_error: null,
    last_validation_status: null,
    schema_version: tailscaleOAuthMetadataSchemaVersion,
    tailnet: normalizeTailnet(request.tailnet),
  };
}

function normalizeMintAuthKeyRequest(
  request: MintTailscaleAuthKeyRequest,
  expectedTag: string,
): TailscaleCreateAuthKeyInput {
  const runtimeName = requiredPlainString(request.runtimeName, "runtimeName");
  const tags =
    request.tags === undefined ? [expectedTag] : normalizeTags(request.tags, expectedTag);
  return {
    description: normalizeAuthKeyDescription(request.description, runtimeName, expectedTag),
    ephemeral: request.ephemeral === true,
    expirySeconds: normalizeAuthKeyExpirySeconds(request.expirySeconds),
    preauthorized: request.preauthorized !== false,
    reusable: request.reusable === true,
    tags,
  };
}

function normalizeAuthKeyExpirySeconds(value: number | undefined): number {
  const expirySeconds = value ?? defaultAuthKeyExpirySeconds;
  if (!Number.isInteger(expirySeconds) || expirySeconds < 60 || expirySeconds > 90 * 24 * 60 * 60) {
    throw new Error("expirySeconds must be an integer between 60 seconds and 90 days");
  }
  return expirySeconds;
}

function normalizeAuthKeyDescription(
  value: string | undefined,
  runtimeName: string,
  expectedTag: string,
): string {
  const description = value?.trim();
  if (description) {
    requireNoControlCharacters(description, "description");
    return description;
  }
  return `Setta runtime ${runtimeName} (${expectedTag})`;
}

function normalizeTags(tags: string[], expectedTag: string): string[] {
  if (tags.length === 0) {
    throw new Error("tags must include the expected runtime tag");
  }
  for (const tag of tags) {
    if (normalizeExpectedTag(tag) !== expectedTag) {
      throw new Error(`Tailscale auth keys for Setta runtimes must use ${expectedTag}`);
    }
  }
  return [...tags];
}

function normalizeExpectedTag(value: string | undefined): string {
  const tag = value?.trim() || defaultExpectedRuntimeTag;
  requireNoControlCharacters(tag, "expectedTag");
  if (!tag.startsWith("tag:")) {
    throw new Error("expectedTag must be a Tailscale tag");
  }
  return tag;
}

function normalizeTailnet(value: string | undefined): string {
  const tailnet = value?.trim() || defaultTailnet;
  requireNoControlCharacters(tailnet, "tailnet");
  return tailnet;
}

function requiredPlainString(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error(`${label} is required`);
  }
  requireNoControlCharacters(trimmed, label);
  return trimmed;
}

function requireNoControlCharacters(value: string, label: string): void {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      throw new Error(`${label} must not contain control characters`);
    }
  }
}

function decodeStoredTailscaleOAuthMetadata(value: unknown): StoredTailscaleOAuthMetadata {
  const record = assertRecord(value, "TailscaleOAuthMetadata");
  if (record.schema_version !== tailscaleOAuthMetadataSchemaVersion) {
    throw new Error(
      `TailscaleOAuthMetadata.schema_version is unsupported: ${String(record.schema_version)}`,
    );
  }
  const lastValidationStatus = optionalStringField(
    record,
    "last_validation_status",
    "TailscaleOAuthMetadata",
  );
  if (
    lastValidationStatus !== null &&
    lastValidationStatus !== "valid" &&
    lastValidationStatus !== "failed"
  ) {
    throw new Error("TailscaleOAuthMetadata.last_validation_status is unsupported");
  }
  return {
    client_id: stringField(record, "client_id", "TailscaleOAuthMetadata"),
    client_secret_ref: stringField(record, "client_secret_ref", "TailscaleOAuthMetadata"),
    expected_tag: stringField(record, "expected_tag", "TailscaleOAuthMetadata"),
    last_validated_at: optionalStringField(record, "last_validated_at", "TailscaleOAuthMetadata"),
    last_validation_error: optionalStringField(
      record,
      "last_validation_error",
      "TailscaleOAuthMetadata",
    ),
    last_validation_status: lastValidationStatus,
    schema_version: tailscaleOAuthMetadataSchemaVersion,
    tailnet: stringField(record, "tailnet", "TailscaleOAuthMetadata"),
  };
}

function decodeCreatedAuthKey(value: unknown): TailscaleCreatedAuthKey {
  const record = assertRecord(value, "TailscaleCreateAuthKeyResponse");
  return {
    expiresAt:
      optionalStringField(record, "expires", "TailscaleCreateAuthKeyResponse") ??
      optionalStringField(record, "expiresAt", "TailscaleCreateAuthKeyResponse"),
    id: optionalStringField(record, "id", "TailscaleCreateAuthKeyResponse"),
    key: stringField(record, "key", "TailscaleCreateAuthKeyResponse"),
  };
}

function stringField(record: Record<string, unknown>, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label}.${field} must be a non-empty string`);
  }
  return value;
}

function optionalStringField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): string | null {
  const value = record[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${label}.${field} must be a string when present`);
  }
  return value;
}

function optionalRecordField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): Record<string, unknown> | null {
  const value = record[field];
  if (value === undefined || value === null) {
    return null;
  }
  return assertRecord(value, `${label}.${field}`);
}

function previewClientID(clientID: string): string {
  if (clientID.length <= 10) {
    return clientID;
  }
  return `${clientID.slice(0, 6)}...${clientID.slice(-4)}`;
}

function authKeysURLForTailnet(tailnet: string): URL {
  return new URL(`/api/v2/tailnet/${encodeURIComponent(tailnet)}/keys`, tailscaleAPIBaseURL);
}

function authKeyURLForTailnet(tailnet: string, keyId: string): URL {
  return new URL(
    `/api/v2/tailnet/${encodeURIComponent(tailnet)}/keys/${encodeURIComponent(keyId)}`,
    tailscaleAPIBaseURL,
  );
}

function classifyAuthKeyCreateFailure(status: number): TailscaleOAuthValidationResult["code"] {
  if (status === 400 || status === 403) {
    return "tailscale_oauth_permission_denied";
  }
  if (status === 401) {
    return "tailscale_oauth_invalid_credentials";
  }
  return "tailscale_oauth_api_error";
}

function authKeyCreateFailureMessage(tags: string[], tailscaleMessage: string): string {
  return `Tailscale OAuth client cannot mint auth keys for ${tags.join(", ")}. Confirm the client has auth_keys scope and owns the runtime tag, or use manual auth-key paste. Tailscale said: ${tailscaleMessage}`;
}

async function tailscaleErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (text.trim() === "") {
    return `HTTP ${response.status}`;
  }
  try {
    const record = assertRecord(JSON.parse(text), "TailscaleErrorResponse");
    const message = optionalStringField(record, "message", "TailscaleErrorResponse");
    if (message) {
      return message;
    }
    const error = optionalStringField(record, "error", "TailscaleErrorResponse");
    if (error) {
      return error;
    }
  } catch {
    return text.trim();
  }
  return text.trim();
}

function tailscaleTagOwnersSnippet(expectedTag: string): string {
  return JSON.stringify(
    {
      tagOwners: {
        [expectedTag]: ["autogroup:admin"],
      },
    },
    null,
    2,
  );
}

function tailscaleRuntimeIsolationSnippet(expectedTag: string): string {
  return JSON.stringify(
    {
      acls: [
        {
          action: "accept",
          dst: [`${expectedTag}:7345`, `${expectedTag}:443`],
          src: ["autogroup:member"],
        },
      ],
      tests: [
        {
          accept: [`${expectedTag}:7345`, `${expectedTag}:443`],
          src: "autogroup:member",
        },
        {
          deny: ["*:*"],
          src: expectedTag,
        },
      ],
    },
    null,
    2,
  );
}

function isENOENT(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isExecNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
