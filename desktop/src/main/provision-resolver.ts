import type {
  CloudRuntimeProvisionApproval,
  CloudRuntimeProvisionCost,
  CloudRuntimeProvisionImageSelector,
  CloudRuntimeProvisionMachine,
  CloudRuntimeProvisionOptions,
  CloudRuntimeProvisionProvider,
  CloudRuntimeProvisionResolvedConstraints,
  CloudRuntimeProvisionResolution,
  CloudRuntimeProvisionResolveRequest,
  CloudRuntimeProvisionResolveResult,
  CloudRuntimeProvisionShape,
} from "@shared/types";
import {
  defaultExecFileRunner,
  type ExecFileRunner,
  runSettaCLI,
  settaCLIInvocation,
} from "./setta-cli";

const provisionResolverMaxBufferBytes = 10 * 1024 * 1024;

export interface ProvisionResolverOptions {
  env: NodeJS.ProcessEnv;
  execFileRunner?: ExecFileRunner;
  repoRoot: string;
}

export async function listCloudRuntimeProvisionOptions(
  options: ProvisionResolverOptions,
): Promise<CloudRuntimeProvisionOptions> {
  const stdout = await runProvisionCLI(options, ["provision", "shapes", "--json"]);
  return parseProvisionOptions(stdout);
}

export async function resolveCloudRuntimeProvision(
  request: CloudRuntimeProvisionResolveRequest,
  options: ProvisionResolverOptions,
): Promise<CloudRuntimeProvisionResolveResult> {
  const args = ["provision", "resolve", "--json", ...resolveRequestArgs(request)];
  const stdout = await runProvisionCLI(options, args);
  return parseProvisionResolveResult(stdout);
}

async function runProvisionCLI(options: ProvisionResolverOptions, args: string[]): Promise<string> {
  const invocation = settaCLIInvocation(options.repoRoot, options.env);
  const runner = options.execFileRunner ?? defaultExecFileRunner;
  const { stdout } = await runSettaCLI(
    runner,
    invocation,
    [...invocation.args, ...args],
    options.env,
    provisionResolverMaxBufferBytes,
  );
  return stdout;
}

function resolveRequestArgs(request: CloudRuntimeProvisionResolveRequest): string[] {
  const args: string[] = [];
  pushStringFlag(args, "--provider", request.provider);
  pushStringFlag(args, "--shape", request.shape);
  pushStringFlag(args, "--region", request.region);
  pushIntegerFlag(args, "--disk-gb", request.diskGB);
  pushStringFlag(args, "--intent", request.intent);
  pushStringFlag(args, "--workload-note", request.workloadNote);
  pushIntegerFlag(args, "--cpu-min", request.cpuMin);
  pushIntegerFlag(args, "--memory-gb-min", request.memoryGBMin);
  pushStringFlag(args, "--gpu-class", request.gpuClass);
  pushStringFlag(args, "--budget", request.budgetPreference);
  pushStringFlag(args, "--exact-instance-type", request.exactInstanceType);
  return args;
}

function pushStringFlag(args: string[], flag: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) {
    args.push(flag, trimmed);
  }
}

function pushIntegerFlag(args: string[], flag: string, value: number | undefined): void {
  if (value === undefined) {
    return;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  if (value > 0) {
    args.push(flag, String(value));
  }
}

function parseProvisionOptions(stdout: string): CloudRuntimeProvisionOptions {
  const root = parseJSONRecord(stdout, "setta provision shapes");
  if (root.ok !== true) {
    throw new Error("setta provision shapes returned ok=false");
  }
  const catalog = requireRecord(root.catalog, "catalog");
  const defaultProvider = requireString(catalog.defaultProvider, "catalog.defaultProvider");
  const defaultShape = requireString(root.defaultShape, "defaultShape");
  return {
    defaultProvider,
    defaultShape,
    providers: requireArray(catalog.providers, "catalog.providers").map((provider, index) =>
      parseProvider(requireRecord(provider, `catalog.providers[${index}]`)),
    ),
    shapes: requireArray(catalog.shapes, "catalog.shapes").map((shape, index) =>
      parseShape(requireRecord(shape, `catalog.shapes[${index}]`)),
    ),
  };
}

function parseProvider(record: Record<string, unknown>): CloudRuntimeProvisionProvider {
  const mappings = requireRecord(record.mappings, "provider.mappings");
  return {
    displayName: requireString(record.displayName, "provider.displayName"),
    id: requireString(record.id, "provider.id"),
    imageSelector: parseImageSelector(
      requireRecord(record.imageSelector, "provider.imageSelector"),
    ),
    pricingUrl: requireString(record.pricingUrl, "provider.pricingUrl"),
    regionPreferences: requireStringArray(record.regionPreferences, "provider.regionPreferences"),
    shapeIds: Object.keys(mappings).sort(),
  };
}

function parseShape(record: Record<string, unknown>): CloudRuntimeProvisionShape {
  return {
    cpuMin: requireNumber(record.cpuMin, "shape.cpuMin"),
    diskFloorGb: requireNumber(record.diskFloorGb, "shape.diskFloorGb"),
    gpuClass: optionalString(record.gpuClass),
    guide: requireString(record.guide, "shape.guide"),
    id: requireString(record.id, "shape.id"),
    label: requireString(record.label, "shape.label"),
    memoryGbMin: requireNumber(record.memoryGbMin, "shape.memoryGbMin"),
  };
}

function parseProvisionResolveResult(stdout: string): CloudRuntimeProvisionResolveResult {
  const root = parseJSONRecord(stdout, "setta provision resolve");
  if (root.ok !== true) {
    throw new Error("setta provision resolve returned ok=false");
  }
  const request = requireRecord(root.request, "request");
  const resolution = parseResolution(requireRecord(root.resolution, "resolution"));
  return {
    candidates: requireArray(root.candidates, "candidates").map((candidate, index) =>
      parseResolution(requireRecord(candidate, `candidates[${index}]`)),
    ),
    constraints: parseConstraints(requireRecord(request.constraints, "request.constraints")),
    ok: true,
    provider: requireString(request.provider, "request.provider"),
    resolution,
    shape: requireString(request.shape, "request.shape"),
    warnings: requireStringArrayOrEmpty(root.warnings, "warnings"),
  };
}

function parseConstraints(
  record: Record<string, unknown>,
): CloudRuntimeProvisionResolvedConstraints {
  return {
    budgetPreference: optionalString(record.budgetPreference),
    cpuMin: optionalNumber(record.cpuMin),
    diskGB: optionalNumber(record.diskGb),
    exactInstanceType: optionalString(record.exactInstance),
    gpuClass: optionalString(record.gpuClass),
    intent: optionalString(record.intent),
    memoryGBMin: optionalNumber(record.memoryGbMin),
    regionPreference: optionalString(record.regionPreference),
    workloadNote: optionalString(record.workloadNote),
  };
}

function parseResolution(record: Record<string, unknown>): CloudRuntimeProvisionResolution {
  return {
    approval: parseApproval(requireRecord(record.approval, "resolution.approval")),
    cost: parseCost(requireRecord(record.cost, "resolution.cost")),
    diskGB: requireNumber(record.diskGb, "resolution.diskGb"),
    displayName: requireString(record.displayName, "resolution.displayName"),
    imageSelector: parseImageSelector(
      requireRecord(record.imageSelector, "resolution.imageSelector"),
    ),
    instanceType: requireString(record.instanceType, "resolution.instanceType"),
    machine: parseMachine(requireRecord(record.machine, "resolution.machine")),
    provider: requireString(record.provider, "resolution.provider"),
    region: requireString(record.region, "resolution.region"),
    regionOptions: requireStringArray(record.regionOptions, "resolution.regionOptions"),
    shape: requireString(record.shape, "resolution.shape"),
    source: requireString(record.source, "resolution.source"),
    warnings: requireStringArrayOrEmpty(record.warnings, "resolution.warnings"),
  };
}

function parseImageSelector(record: Record<string, unknown>): CloudRuntimeProvisionImageSelector {
  return {
    description: requireString(record.description, "imageSelector.description"),
    kind: requireString(record.kind, "imageSelector.kind"),
    value: requireString(record.value, "imageSelector.value"),
  };
}

function parseMachine(record: Record<string, unknown>): CloudRuntimeProvisionMachine {
  return {
    cpus: optionalNumber(record.cpus),
    diskGB: optionalNumber(record.diskGb),
    gpuClass: optionalString(record.gpuClass),
    memoryGB: optionalNumber(record.memoryGb),
  };
}

function parseCost(record: Record<string, unknown>): CloudRuntimeProvisionCost {
  return {
    amount: optionalString(record.amount),
    class: optionalString(record.class),
    currency: optionalString(record.currency),
    description: requireString(record.description, "cost.description"),
    kind: requireString(record.kind, "cost.kind"),
    pricingUrl: requireString(record.pricingUrl, "cost.pricingUrl"),
  };
}

function parseApproval(record: Record<string, unknown>): CloudRuntimeProvisionApproval {
  return {
    commandPreview: requireStringArrayOrEmpty(record.commandPreview, "approval.commandPreview"),
    requiresMutationApproval: requireBoolean(
      record.requiresMutationApproval,
      "approval.requiresMutationApproval",
    ),
    secretFree: requireBoolean(record.secretFree, "approval.secretFree"),
  };
}

function parseJSONRecord(stdout: string, commandLabel: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${commandLabel} did not return valid JSON: ${errorMessage(error)}`, {
      cause: error,
    });
  }
  return requireRecord(parsed, commandLabel);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  return requireArray(value, label).map((item, index) => requireString(item, `${label}[${index}]`));
}

function requireStringArrayOrEmpty(value: unknown, label: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  return requireStringArray(value, label);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }
  return value;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
