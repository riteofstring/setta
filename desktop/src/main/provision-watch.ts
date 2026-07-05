import { execFile } from "node:child_process";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import {
  backendEndpoints,
  backendProtocolVersion,
  decodeErrorResponse,
  decodeSetupAttestationResponse,
  type CompletePairingResponse,
  type RuntimeInfoResponse,
  type SetupAttestationResponse,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import type { PendingProvisionRecord } from "./pending-provision-store";
import { completePairing, fetchRuntimeInfo } from "./runtime-pairing";

export interface TailnetNode {
  dnsName: string;
  hostName: string;
  id: string | null;
  online: boolean;
  publicKey: string | null;
  tags: readonly string[];
  tailscaleIPs: readonly string[];
}

export interface TailnetClient {
  listNodes(): Promise<TailnetNode[]>;
}

type ProvisionWatchProgressStatus =
  | "waiting_for_vm_provider"
  | "joined_tailnet"
  | "verifying_attestation"
  | "pairing_runtime"
  | "paired";

interface ProvisionWatchProgress {
  message: string;
  provisionId: string;
  runtimeName: string;
  status: ProvisionWatchProgressStatus;
}

export interface ProvisionAutoPairResult {
  baseUrl: string;
  info: RuntimeInfoResponse;
  pairing: CompletePairingResponse;
  provisionId: string;
  tailnetNode: TailnetNode;
}

export interface ProvisionVerifiedCandidate {
  baseUrl: string;
  info: RuntimeInfoResponse;
  provisionId: string;
  tailnetNode: TailnetNode;
}

export interface ProvisionVerificationOptions {
  fetchImpl: BackendFetch;
  nonce?: () => string;
  now?: () => Date;
  onProgress?: (progress: ProvisionWatchProgress) => void;
  pending: PendingProvisionRecord;
  sleep?: (durationMs: number) => Promise<void>;
  tailnetClient: TailnetClient;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface ProvisionWatchOptions extends ProvisionVerificationOptions {
  clientDisplayName: string;
}

export interface ProvisionWatchAttempt {
  rejectedCandidates: ProvisionWatchRejectedCandidate[];
  result: ProvisionAutoPairResult | null;
}

interface ProvisionVerificationAttempt {
  rejectedCandidates: ProvisionWatchRejectedCandidate[];
  result: ProvisionVerifiedCandidate | null;
}

interface ProvisionWatchRejectedCandidate {
  node: TailnetNode;
  reason: string;
}

class RuntimeHTTPError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const execFileAsync = promisify(execFile);
const setupAttestationAlgorithm = "hmac-sha256-v1";
const setupAttestationContext = "setta-setup-attestation-v1";
const defaultProvisionWatchTimeoutMs = 10 * 60 * 1000;
const defaultProvisionWatchPollIntervalMs = 5000;

class ProvisionWatchError extends Error {
  constructor(
    readonly code:
      | "provision_expired"
      | "provision_watch_timeout"
      | "runtime_incompatible"
      | "tailscale_status_failed",
    message: string,
  ) {
    super(message);
  }
}

export class TailscaleStatusClient implements TailnetClient {
  constructor(private readonly command = "tailscale") {}

  async listNodes(): Promise<TailnetNode[]> {
    let stdout: string | Buffer;
    try {
      ({ stdout } = await execFileAsync(this.command, ["status", "--json"], {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
      }));
    } catch (error) {
      throw new ProvisionWatchError(
        "tailscale_status_failed",
        `tailscale status --json failed: ${errorMessage(error)}`,
      );
    }
    const payload = String(stdout);
    return decodeTailscaleStatusNodes(JSON.parse(payload));
  }
}

export async function watchProvisionUntilPaired(
  options: ProvisionWatchOptions,
): Promise<ProvisionAutoPairResult> {
  const verified = await watchProvisionUntilVerified(options);
  return completeProvisionPairing(verified, options);
}

export async function watchProvisionUntilVerified(
  options: ProvisionVerificationOptions,
): Promise<ProvisionVerifiedCandidate> {
  const timeoutMs = options.timeoutMs ?? defaultProvisionWatchTimeoutMs;
  const pollIntervalMs = options.pollIntervalMs ?? defaultProvisionWatchPollIntervalMs;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? sleepDuration;
  const startedAt = now().getTime();
  let lastRejectedCandidates: ProvisionWatchRejectedCandidate[] = [];
  for (;;) {
    const attempt = await attemptProvisionVerification(options);
    if (attempt.result) {
      return attempt.result;
    }
    lastRejectedCandidates = latestRejectedCandidates(lastRejectedCandidates, attempt);
    const currentTime = now().getTime();
    assertProvisionWatchStillActive(options, {
      currentTime,
      lastRejectedCandidates,
      startedAt,
      timeoutMs,
    });
    await sleep(pollIntervalMs);
  }
}

function latestRejectedCandidates(
  previous: ProvisionWatchRejectedCandidate[],
  attempt: ProvisionVerificationAttempt,
): ProvisionWatchRejectedCandidate[] {
  return attempt.rejectedCandidates.length > 0 ? attempt.rejectedCandidates : previous;
}

function assertProvisionWatchStillActive(
  options: ProvisionVerificationOptions,
  check: {
    currentTime: number;
    lastRejectedCandidates: ProvisionWatchRejectedCandidate[];
    startedAt: number;
    timeoutMs: number;
  },
): void {
  if (Date.parse(options.pending.expiresAt) <= check.currentTime) {
    throw new ProvisionWatchError(
      "provision_expired",
      `provision ${options.pending.provisionId} expired before pairing completed`,
    );
  }
  if (check.currentTime - check.startedAt >= check.timeoutMs) {
    throw new ProvisionWatchError(
      "provision_watch_timeout",
      provisionWatchTimeoutMessage(options.pending.runtimeName, check.lastRejectedCandidates),
    );
  }
}

function provisionWatchTimeoutMessage(
  runtimeName: string,
  rejectedCandidates: ProvisionWatchRejectedCandidate[],
): string {
  if (rejectedCandidates.length === 0) {
    return `timed out waiting for ${runtimeName} to pair`;
  }
  const reasons = rejectedCandidates
    .map((candidate) => `${tailnetNodeDisplayName(candidate.node)}: ${candidate.reason}`)
    .join("; ");
  return `timed out waiting for ${runtimeName} to pair; last rejected candidates: ${reasons}`;
}

export async function attemptProvisionAutoPair(
  options: ProvisionWatchOptions,
): Promise<ProvisionWatchAttempt> {
  const attempt = await attemptProvisionVerification(options);
  if (!attempt.result) {
    return {
      rejectedCandidates: attempt.rejectedCandidates,
      result: null,
    };
  }
  return {
    rejectedCandidates: attempt.rejectedCandidates,
    result: await completeProvisionPairing(attempt.result, options),
  };
}

async function attemptProvisionVerification(
  options: ProvisionVerificationOptions,
): Promise<ProvisionVerificationAttempt> {
  const rejectedCandidates: ProvisionWatchRejectedCandidate[] = [];
  if (Date.parse(options.pending.expiresAt) <= (options.now ?? (() => new Date()))().getTime()) {
    throw new ProvisionWatchError(
      "provision_expired",
      `provision ${options.pending.provisionId} expired before pairing completed`,
    );
  }
  const nodes = await options.tailnetClient.listNodes();
  const candidates = nodes.filter((node) =>
    tailnetNodeMatchesRuntimeName(node, options.pending.runtimeName),
  );
  if (candidates.length === 0) {
    emitProgress(options, "waiting_for_vm_provider", "waiting for runtime to join the tailnet");
    return { rejectedCandidates, result: null };
  }
  for (const node of candidates) {
    emitProgress(options, "joined_tailnet", `found tailnet node ${tailnetNodeDisplayName(node)}`);
    const verified = await verifyProvisionCandidate(node, options);
    if (verified.reason) {
      rejectedCandidates.push({ node, reason: verified.reason });
      continue;
    }
    return {
      rejectedCandidates,
      result: verified.result,
    };
  }
  return { rejectedCandidates, result: null };
}

async function verifyProvisionCandidate(
  node: TailnetNode,
  options: ProvisionVerificationOptions,
): Promise<
  | { reason: string; result: null }
  | {
      reason: null;
      result: ProvisionVerifiedCandidate;
    }
> {
  const rejectedReason = rejectTailnetCandidate(node, options.pending.expectedTag);
  if (rejectedReason) {
    return { reason: rejectedReason, result: null };
  }
  const nodeFingerprint = tailnetNodeFingerprint(node);
  if (nodeFingerprint === null) {
    return { reason: "candidate is missing a stable Tailscale identity", result: null };
  }
  const baseUrl = runtimeBaseURLFromNode(node, options.pending);
  if (baseUrl === null) {
    return { reason: "candidate is missing a Tailscale address", result: null };
  }
  const info = await fetchCandidateRuntimeInfo(baseUrl, options.fetchImpl);
  if (typeof info === "string") {
    return { reason: info, result: null };
  }
  const attestationRejection = await verifyCandidateAttestation({
    baseUrl,
    info,
    nodeFingerprint,
    options,
  });
  if (attestationRejection) {
    return { reason: attestationRejection, result: null };
  }
  return {
    reason: null,
    result: {
      baseUrl,
      info,
      provisionId: options.pending.provisionId,
      tailnetNode: node,
    },
  };
}

async function fetchCandidateRuntimeInfo(
  baseUrl: string,
  fetchImpl: BackendFetch,
): Promise<RuntimeInfoResponse | string> {
  try {
    return await fetchRuntimeInfo(baseUrl, fetchImpl);
  } catch (error) {
    return errorMessage(error);
  }
}

async function verifyCandidateAttestation(input: {
  baseUrl: string;
  info: RuntimeInfoResponse;
  nodeFingerprint: string;
  options: ProvisionVerificationOptions;
}): Promise<string | null> {
  if (input.info.protocolVersion !== backendProtocolVersion) {
    throw new ProvisionWatchError(
      "runtime_incompatible",
      `runtime protocol ${input.info.protocolVersion} is outside the supported version ${backendProtocolVersion}`,
    );
  }
  emitProgress(input.options, "verifying_attestation", "verifying setup attestation");
  const nonce = (input.options.nonce ?? randomNonce)();
  const attestation = await requestSetupAttestation({
    baseUrl: input.baseUrl,
    fetchImpl: input.options.fetchImpl,
    nodeFingerprint: input.nodeFingerprint,
    nonce,
    provisionId: input.options.pending.provisionId,
  });
  if (
    !attestation ||
    !setupAttestationValid({
      attestation,
      attestationKey: input.options.pending.attestationKey,
      expectedNodeFingerprint: input.nodeFingerprint,
      expectedNonce: nonce,
      expectedProvisionId: input.options.pending.provisionId,
      expectedRuntimeId: input.info.runtimeId,
      now: input.options.now,
    })
  ) {
    return "setup attestation did not match pending provision";
  }
  return null;
}

export async function completeProvisionPairing(
  verified: ProvisionVerifiedCandidate,
  options: Pick<
    ProvisionWatchOptions,
    "clientDisplayName" | "fetchImpl" | "onProgress" | "pending"
  >,
): Promise<ProvisionAutoPairResult> {
  emitProgress(options, "pairing_runtime", "completing runtime pairing");
  const pairing = await completePairing(
    {
      baseUrl: verified.baseUrl,
      pairingToken: options.pending.pairingToken,
      runtimeId: verified.info.runtimeId,
    },
    options.clientDisplayName,
    options.fetchImpl,
  );
  emitProgress(options, "paired", "runtime paired");
  return {
    ...verified,
    pairing,
  };
}

export function tailnetNodeMatchesRuntimeName(node: TailnetNode, runtimeName: string): boolean {
  const expected = normalizeTailnetName(runtimeName);
  if (expected === null) {
    return false;
  }
  for (const candidate of tailnetNodeNameCandidates(node)) {
    if (candidate === expected || tailscaleDedupNameMatches(candidate, expected)) {
      return true;
    }
  }
  return false;
}

export function decodeTailscaleStatusNodes(value: unknown): TailnetNode[] {
  const record = assertRecord(value, "TailscaleStatus");
  const nodes: TailnetNode[] = [];
  if ("Self" in record && record.Self !== null) {
    nodes.push(decodeTailscaleNode(record.Self, "TailscaleStatus.Self"));
  }
  const peerRecord = optionalRecord(record.Peer, "TailscaleStatus.Peer");
  if (peerRecord) {
    for (const [key, rawPeer] of Object.entries(peerRecord)) {
      nodes.push(decodeTailscaleNode(rawPeer, `TailscaleStatus.Peer.${key}`));
    }
  }
  return nodes;
}

function rejectTailnetCandidate(node: TailnetNode, expectedTag: string): string | null {
  if (!node.online) {
    return "candidate is offline";
  }
  if (!node.tags.includes(expectedTag)) {
    return `candidate is missing ${expectedTag}`;
  }
  return null;
}

function setupAttestationValid(options: {
  attestation: SetupAttestationResponse;
  attestationKey: string;
  expectedNodeFingerprint: string;
  expectedNonce: string;
  expectedProvisionId: string;
  expectedRuntimeId: string;
  now?: () => Date;
}): boolean {
  if (options.attestation.algorithm !== setupAttestationAlgorithm) {
    return false;
  }
  if (options.attestation.runtimeId !== options.expectedRuntimeId) {
    return false;
  }
  if (options.attestation.provisionId !== options.expectedProvisionId) {
    return false;
  }
  if (options.attestation.nonce !== options.expectedNonce) {
    return false;
  }
  if (options.attestation.nodeFingerprint !== options.expectedNodeFingerprint) {
    return false;
  }
  if (
    Date.parse(options.attestation.expiresAt) <= (options.now ?? (() => new Date()))().getTime()
  ) {
    return false;
  }
  const expected = computeSetupAttestation({
    attestationKey: options.attestationKey,
    nodeFingerprint: options.expectedNodeFingerprint,
    nonce: options.expectedNonce,
    provisionId: options.expectedProvisionId,
    runtimeId: options.expectedRuntimeId,
  });
  return timingSafeHexEqual(options.attestation.attestation, expected);
}

function computeSetupAttestation(options: {
  attestationKey: string;
  nodeFingerprint: string;
  nonce: string;
  provisionId: string;
  runtimeId: string;
}): string {
  const hmac = createHmac("sha256", options.attestationKey);
  writeHMACField(hmac, setupAttestationContext);
  writeHMACField(hmac, options.runtimeId);
  writeHMACField(hmac, options.provisionId);
  writeHMACField(hmac, options.nonce);
  writeHMACField(hmac, options.nodeFingerprint);
  return hmac.digest("hex");
}

function writeHMACField(hmac: ReturnType<typeof createHmac>, value: string): void {
  hmac.update(value);
  hmac.update("\0");
}

async function requestSetupAttestation(options: {
  baseUrl: string;
  fetchImpl: BackendFetch;
  nodeFingerprint: string;
  nonce: string;
  provisionId: string;
}): Promise<SetupAttestationResponse | null> {
  try {
    return decodeSetupAttestationResponse(
      await requestRuntimeJSON({
        baseUrl: options.baseUrl,
        endpoint: backendEndpoints.SetupAttestation,
        fetchImpl: options.fetchImpl,
        requestPayload: {
          nodeFingerprint: options.nodeFingerprint,
          nonce: options.nonce,
          provisionId: options.provisionId,
        },
      }),
    );
  } catch (error) {
    if (error instanceof RuntimeHTTPError && (error.status === 400 || error.status === 401)) {
      return null;
    }
    throw error;
  }
}

async function requestRuntimeJSON(options: {
  baseUrl: string;
  endpoint: { method: string; path: string };
  fetchImpl: BackendFetch;
  requestPayload: unknown;
}): Promise<unknown> {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  const response = await options.fetchImpl(new URL(options.endpoint.path, options.baseUrl), {
    body: JSON.stringify(options.requestPayload),
    headers,
    method: options.endpoint.method,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const decoded = decodeErrorResponse(payload);
    throw new RuntimeHTTPError(response.status, decoded.error.code, decoded.error.message);
  }
  return payload;
}

function runtimeBaseURLFromNode(
  node: TailnetNode,
  pending: Pick<PendingProvisionRecord, "runtimePort" | "scheme">,
): string | null {
  const host = node.dnsName.trim() !== "" ? normalizeDNSName(node.dnsName) : node.tailscaleIPs[0];
  if (!host) {
    return null;
  }
  const urlHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return new URL(`${pending.scheme}://${urlHost}:${pending.runtimePort}/`).toString();
}

function tailnetNodeFingerprint(node: TailnetNode): string | null {
  if (node.id !== null && node.id !== "") {
    return `tailscale-node-id:${node.id}`;
  }
  if (node.publicKey !== null && node.publicKey !== "") {
    return `tailscale-public-key:${node.publicKey}`;
  }
  return null;
}

function tailnetNodeDisplayName(node: TailnetNode): string {
  if (node.dnsName !== "") {
    return normalizeDNSName(node.dnsName);
  }
  if (node.hostName !== "") {
    return node.hostName;
  }
  return node.id ?? "unknown";
}

function tailnetNodeNameCandidates(node: TailnetNode): string[] {
  const candidates = new Set<string>();
  const hostName = normalizeTailnetName(node.hostName);
  if (hostName !== null) {
    candidates.add(hostName);
  }
  const dnsName = normalizeDNSName(node.dnsName);
  const [firstLabel] = dnsName.split(".");
  const dnsLabel = normalizeTailnetName(firstLabel ?? "");
  if (dnsLabel !== null) {
    candidates.add(dnsLabel);
  }
  return [...candidates];
}

function normalizeTailnetName(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/\.$/, "");
  return normalized === "" ? null : normalized;
}

function normalizeDNSName(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function tailscaleDedupNameMatches(candidate: string, expected: string): boolean {
  if (!candidate.startsWith(`${expected}-`)) {
    return false;
  }
  const suffix = candidate.slice(expected.length + 1);
  return /^[1-9][0-9]*$/.test(suffix);
}

function decodeTailscaleNode(value: unknown, label: string): TailnetNode {
  const record = assertRecord(value, label);
  return {
    dnsName: optionalString(record.DNSName, `${label}.DNSName`) ?? "",
    hostName: optionalString(record.HostName, `${label}.HostName`) ?? "",
    id: optionalString(record.ID, `${label}.ID`),
    online: optionalBoolean(record.Online, `${label}.Online`) ?? true,
    publicKey: optionalString(record.PublicKey, `${label}.PublicKey`),
    tags: optionalStringArray(record.Tags, `${label}.Tags`),
    tailscaleIPs: optionalStringArray(record.TailscaleIPs, `${label}.TailscaleIPs`),
  };
}

function timingSafeHexEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right)) {
    return false;
  }
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function emitProgress(
  options: Pick<ProvisionWatchOptions, "onProgress" | "pending">,
  status: ProvisionWatchProgressStatus,
  message: string,
): void {
  options.onProgress?.({
    message,
    provisionId: options.pending.provisionId,
    runtimeName: options.pending.runtimeName,
    status,
  });
}

function randomNonce(): string {
  return randomBytes(32).toString("base64url");
}

function sleepDuration(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown, label: string): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }
  return assertRecord(value, label);
}

function optionalString(value: unknown, label: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function optionalBoolean(value: unknown, label: string): boolean | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function optionalStringArray(value: unknown, label: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new Error(`${label}[${index}] must be a string`);
    }
    return item;
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
