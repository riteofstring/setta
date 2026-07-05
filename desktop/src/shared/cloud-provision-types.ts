import type { RuntimeRegistrySnapshot } from "./types";

export interface CloudRuntimeProvisionImageSelector {
  description: string;
  kind: string;
  value: string;
}

export interface CloudRuntimeProvisionShape {
  cpuMin: number;
  diskFloorGb: number;
  gpuClass: string | null;
  guide: string;
  id: string;
  label: string;
  memoryGbMin: number;
}

export interface CloudRuntimeProvisionProvider {
  displayName: string;
  id: string;
  imageSelector: CloudRuntimeProvisionImageSelector;
  pricingUrl: string;
  regionPreferences: string[];
  shapeIds: string[];
}

interface CloudRuntimeProvisionAWSPlacementInput {
  securityGroupId?: string;
  subnetId?: string;
  vpcId?: string;
}

export interface CloudRuntimeProvisionOptions {
  defaultProvider: string;
  defaultShape: string;
  providers: CloudRuntimeProvisionProvider[];
  shapes: CloudRuntimeProvisionShape[];
}

export interface CloudRuntimeProvisionResolveRequest {
  budgetPreference?: string;
  cpuMin?: number;
  diskGB?: number;
  exactInstanceType?: string;
  gpuClass?: string;
  intent?: string;
  memoryGBMin?: number;
  provider?: string;
  region?: string;
  shape?: string;
  workloadNote?: string;
  awsPlacement?: CloudRuntimeProvisionAWSPlacementInput;
}

export interface CloudRuntimeProvisionResolvedConstraints {
  budgetPreference: string | null;
  cpuMin: number | null;
  diskGB: number | null;
  exactInstanceType: string | null;
  gpuClass: string | null;
  intent: string | null;
  memoryGBMin: number | null;
  regionPreference: string | null;
  workloadNote: string | null;
}

export interface CloudRuntimeProvisionMachine {
  cpus: number | null;
  diskGB: number | null;
  gpuClass: string | null;
  memoryGB: number | null;
}

export interface CloudRuntimeProvisionCost {
  amount: string | null;
  class: string | null;
  currency: string | null;
  description: string;
  kind: string;
  pricingUrl: string;
}

export interface CloudRuntimeProvisionApproval {
  commandPreview: string[];
  requiresMutationApproval: boolean;
  secretFree: boolean;
}

export interface CloudRuntimeProvisionAWSPlacement {
  defaultVpcRequired: boolean;
  securityGroupId: string | null;
  securityGroupMode: string;
  source: string;
  subnetId: string | null;
  vpcId: string | null;
}

export interface CloudRuntimeProvisionResolution {
  approval: CloudRuntimeProvisionApproval;
  awsPlacement: CloudRuntimeProvisionAWSPlacement | null;
  cost: CloudRuntimeProvisionCost;
  diskGB: number;
  displayName: string;
  imageSelector: CloudRuntimeProvisionImageSelector;
  instanceType: string;
  machine: CloudRuntimeProvisionMachine;
  provider: string;
  region: string;
  regionOptions: string[];
  shape: string;
  source: "catalog" | "live_cli" | string;
  warnings: string[];
}

export interface CloudRuntimeProvisionResolveResult {
  candidates: CloudRuntimeProvisionResolution[];
  constraints: CloudRuntimeProvisionResolvedConstraints;
  ok: boolean;
  provider: string;
  resolution: CloudRuntimeProvisionResolution;
  shape: string;
  warnings: string[];
}

export interface CloudRuntimeProvisionReleaseInput {
  installerSha256: string;
  minisignPublicKey: string;
  releaseBaseUrl: string;
  settaVersion: string;
}

export type CloudRuntimeProvisionAuthInput =
  | {
      kind: "manual";
      tailscaleAuthKey: string;
    }
  | {
      kind: "oauth";
    };

export interface CloudRuntimeProvisionExecuteRequest {
  auth: CloudRuntimeProvisionAuthInput;
  release: CloudRuntimeProvisionReleaseInput;
  resolution: CloudRuntimeProvisionResolution;
  runtimeName: string;
}

export interface CloudRuntimeProvisionExecutionFileInput {
  name: string;
  path: string;
  purpose: string;
  sensitive: boolean;
  sha256: string;
  sizeBytes: number;
}

export interface CloudRuntimeProvisionExecutionPlan {
  actionId: string;
  argv: string[];
  cliBinary: string;
  fileInputs: CloudRuntimeProvisionExecutionFileInput[];
  lastVerified: string;
  mutating: boolean;
  provider: string;
  requiresApproval: boolean;
  secretFree: boolean;
  teardownActionId: string | null;
  typedAction: string;
}

export interface CloudRuntimeProvisionCreationRecord {
  createdAt: string | null;
  expectedResourceName: string | null;
  lastError: string | null;
  provider: string | null;
  recordId: string;
  resourceId: string | null;
  runtimeName: string;
  status: string;
  teardownReady: boolean | null;
  updatedAt: string | null;
}

export interface CloudRuntimeProvisionExistingRecordAction {
  description: string;
  id: string;
  label: string;
  mutating: boolean;
}

export interface CloudRuntimeProvisionExecutedResult {
  creationRecord: CloudRuntimeProvisionCreationRecord;
  mode: "executed";
  ok: boolean;
  plan: CloudRuntimeProvisionExecutionPlan;
  provider: string;
  provisionId: string;
  runtimeName: string;
  snapshot: RuntimeRegistrySnapshot;
  warnings: string[];
}

export interface CloudRuntimeProvisionExistingRecordResult {
  creationRecord: CloudRuntimeProvisionCreationRecord;
  mode: "existing_record";
  nextActions: CloudRuntimeProvisionExistingRecordAction[];
  ok: false;
  provider: string;
  runtimeName: string;
  warnings: string[];
}

export type CloudRuntimeProvisionExecuteResult =
  | CloudRuntimeProvisionExecutedResult
  | CloudRuntimeProvisionExistingRecordResult;
