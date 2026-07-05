import type {
  CloudRuntimeProvisionAuthInput,
  CloudRuntimeProvisionOptions,
  CloudRuntimeProvisionProvider,
  CloudRuntimeProvisionReleaseInput,
  CloudRuntimeProvisionResolveRequest,
  CloudRuntimeProvisionResolveResult,
  CloudRuntimeProvisionShape,
  TailscaleOAuthSetupGuide,
} from "@shared/types";
import { AlertTriangle, ExternalLink, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";

import { CloudRuntimeResolutionCard } from "./runtime-cloud-resolution-card";
import { cloudRuntimeExistingRecordMessage } from "./runtime-cloud-existing-record";
import {
  RuntimeCloudAWSPlacementInputs,
  RuntimeCloudReleaseInputs,
  runtimeCloudAWSPlacementInput,
} from "./runtime-cloud-form-inputs";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

interface RuntimeCloudWizardProps {
  busy: boolean;
}

interface CloudRuntimeWizardForm {
  awsSecurityGroupId: string;
  awsSubnetId: string;
  awsVpcId: string;
  clientId: string;
  clientSecret: string;
  diskGB: string;
  intent: string;
  installerSha256: string;
  manualTailscaleAuthKey: string;
  minisignPublicKey: string;
  provider: string;
  region: string;
  releaseBaseUrl: string;
  runtimeName: string;
  settaVersion: string;
  shape: string;
}

type CloudRuntimeWizardStatus =
  | "idle"
  | "loading"
  | "resolving"
  | "saving-oauth"
  | "validating-oauth"
  | "approving"
  | "creating"
  | "approved"
  | "error";

interface CloudRuntimeApprovalState {
  authSource: "manual" | "oauth";
  message: string;
  runtimeName: string;
}

interface RuntimeCloudWizardController {
  approval: CloudRuntimeApprovalState | null;
  busy: boolean;
  controlsDisabled: boolean;
  error: string | null;
  form: CloudRuntimeWizardForm;
  guide: TailscaleOAuthSetupGuide | null;
  manualKeyRequired: boolean;
  oauthConfigured: boolean;
  options: CloudRuntimeProvisionOptions | null;
  resolution: CloudRuntimeProvisionResolveResult | null;
  resolveProvision: (event: FormEvent<HTMLFormElement>) => void;
  saveOAuthCredentials: () => void;
  selectedProvider: CloudRuntimeProvisionProvider | null;
  selectedShape: CloudRuntimeProvisionShape | null;
  selectProvider: (providerID: string) => void;
  setFormField: (field: keyof CloudRuntimeWizardForm, value: string) => void;
  status: CloudRuntimeWizardStatus;
  supportedShapes: CloudRuntimeProvisionShape[];
  validateOAuthCredentials: () => void;
  approveResolution: () => void;
}

type CloudRuntimeWizardFormSetter = Dispatch<SetStateAction<CloudRuntimeWizardForm>>;

const defaultRuntimeName = "setta-cloud-runtime";
const resolutionInputFields = new Set<keyof CloudRuntimeWizardForm>([
  "awsSecurityGroupId",
  "awsSubnetId",
  "awsVpcId",
  "diskGB",
  "intent",
  "provider",
  "region",
  "shape",
]);
const cloudRuntimeStatusMessages: Partial<Record<CloudRuntimeWizardStatus, string>> = {
  approved: "Cloud runtime created",
  creating: "Creating cloud runtime",
  loading: "Loading cloud options",
  resolving: "Resolving cloud runtime",
  "saving-oauth": "Saving Tailscale OAuth",
  "validating-oauth": "Validating Tailscale OAuth",
};

export function RuntimeCloudWizard({ busy }: RuntimeCloudWizardProps) {
  const controller = useRuntimeCloudWizardController(busy);
  return <RuntimeCloudWizardContent controller={controller} />;
}

function useRuntimeCloudWizardController(busy: boolean): RuntimeCloudWizardController {
  const [approval, setApproval] = useState<CloudRuntimeApprovalState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CloudRuntimeWizardForm>({
    awsSecurityGroupId: "",
    awsSubnetId: "",
    awsVpcId: "",
    clientId: "",
    clientSecret: "",
    diskGB: "",
    intent: "",
    installerSha256: "",
    manualTailscaleAuthKey: "",
    minisignPublicKey: "",
    provider: "",
    region: "",
    releaseBaseUrl: "",
    runtimeName: defaultRuntimeName,
    settaVersion: "",
    shape: "",
  });
  const [guide, setGuide] = useState<TailscaleOAuthSetupGuide | null>(null);
  const [options, setOptions] = useState<CloudRuntimeProvisionOptions | null>(null);
  const [resolution, setResolution] = useState<CloudRuntimeProvisionResolveResult | null>(null);
  const [status, setStatus] = useState<CloudRuntimeWizardStatus>("loading");

  useEffect(() => {
    let canceled = false;
    async function load() {
      if (!window.setta.runtimes.cloudProvisionOptions) {
        setError("Cloud runtime setup is unavailable in this build.");
        setStatus("error");
        return;
      }
      try {
        const [loadedOptions, loadedGuide] = await Promise.all([
          window.setta.runtimes.cloudProvisionOptions(),
          window.setta.runtimes.tailscaleOAuthSetupGuide?.() ?? Promise.resolve(null),
        ]);
        if (canceled) {
          return;
        }
        setOptions(loadedOptions);
        setGuide(loadedGuide);
        setForm((current) => formWithDefaults(current, loadedOptions));
        setStatus("idle");
      } catch (loadError) {
        if (!canceled) {
          setError(errorMessage(loadError));
          setStatus("error");
        }
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, []);

  const selectedProvider = useMemo(
    () => selectedCloudProvider(options, form.provider),
    [form.provider, options],
  );
  const selectedShape = useMemo(
    () => selectedCloudShape(options, form.shape),
    [form.shape, options],
  );
  const supportedShapes = useMemo(
    () => shapesForProvider(options, selectedProvider),
    [options, selectedProvider],
  );
  const oauthConfigured = Boolean(guide?.oauth.configured);
  const manualKeyRequired = !oauthConfigured;
  const controlsDisabled =
    busy || status === "loading" || status === "resolving" || status === "creating";

  function resolveProvision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runResolveProvision({
      controlsDisabled,
      form,
      setApproval,
      setError,
      setForm,
      setResolution,
      setStatus,
    });
  }

  function saveOAuthCredentials() {
    void runSaveOAuthCredentials({ form, guide, setError, setForm, setGuide, setStatus });
  }

  function validateOAuthCredentials() {
    void runValidateOAuthCredentials({ setError, setGuide, setStatus });
  }

  function approveResolution() {
    void approveCloudResolution({
      form,
      manualKeyRequired,
      oauthConfigured,
      resolution,
      setApproval,
      setError,
      setStatus,
    });
  }

  function selectProvider(providerID: string) {
    const provider = selectedCloudProvider(options, providerID);
    const shape = firstSupportedShapeID(options, provider) ?? form.shape;
    const region = provider?.regionPreferences[0] ?? "";
    setForm((current) => ({
      ...current,
      awsSecurityGroupId: provider?.id === "aws" ? current.awsSecurityGroupId : "",
      awsSubnetId: provider?.id === "aws" ? current.awsSubnetId : "",
      awsVpcId: provider?.id === "aws" ? current.awsVpcId : "",
      provider: providerID,
      region,
      shape,
    }));
    clearResolvedState(setApproval, setResolution);
  }

  function setFormField(field: keyof CloudRuntimeWizardForm, value: string) {
    updateForm(setForm, field, value);
    if (resolutionInputFields.has(field)) {
      clearResolvedState(setApproval, setResolution);
    }
  }

  return {
    approval,
    approveResolution,
    busy,
    controlsDisabled,
    error,
    form,
    guide,
    manualKeyRequired,
    oauthConfigured,
    options,
    resolution,
    resolveProvision,
    saveOAuthCredentials,
    selectedProvider,
    selectedShape,
    selectProvider,
    setFormField,
    status,
    supportedShapes,
    validateOAuthCredentials,
  };
}

function RuntimeCloudWizardContent({ controller }: { controller: RuntimeCloudWizardController }) {
  return (
    <div className="grid gap-2" data-testid="runtime-cloud-wizard">
      <RuntimeCloudWizardStatusLine guide={controller.guide} status={controller.status} />
      <RuntimeCloudResolveForm controller={controller} />
      <RuntimeCloudOAuthBlock controller={controller} />
      <RuntimeCloudManualKeyInput controller={controller} />
      <RuntimeCloudResolutionPanel controller={controller} />
      <RuntimeCloudWizardError error={controller.error} />
    </div>
  );
}

function RuntimeCloudResolveForm({ controller }: { controller: RuntimeCloudWizardController }) {
  const providerOptions = providerSelectOptions(controller.options);
  const shapeOptions = shapeSelectOptions(controller.supportedShapes);
  const regionOptions = regionSelectOptions(controller.selectedProvider);
  return (
    <form className="grid gap-2" onSubmit={controller.resolveProvision}>
      <Textarea
        aria-label="Cloud runtime intent"
        disabled={controller.controlsDisabled}
        onChange={(event) => controller.setFormField("intent", event.target.value)}
        placeholder="cheap box for agents"
        value={controller.form.intent}
      />
      <div className="grid grid-cols-2 gap-1">
        <RuntimeCloudSelect
          disabled={!controller.options || controller.controlsDisabled}
          label="Cloud provider"
          onChange={controller.selectProvider}
          options={providerOptions}
          value={controller.form.provider}
        />
        <RuntimeCloudSelect
          disabled={controller.controlsDisabled || shapeOptions.length === 0}
          label="Machine shape"
          onChange={(value) => controller.setFormField("shape", value)}
          options={shapeOptions}
          value={controller.form.shape}
        />
      </div>
      <div className="grid grid-cols-2 gap-1">
        <RuntimeCloudSelect
          disabled={!controller.selectedProvider || controller.controlsDisabled}
          label="Cloud region"
          onChange={(value) => controller.setFormField("region", value)}
          options={regionOptions}
          value={controller.form.region}
        />
        <Input
          aria-label="Cloud disk size"
          disabled={controller.controlsDisabled}
          min={controller.selectedShape?.diskFloorGb ?? 0}
          onChange={(event) => controller.setFormField("diskGB", event.target.value)}
          placeholder="Disk GB"
          type="number"
          value={controller.form.diskGB}
        />
      </div>
      <RuntimeCloudAWSPlacementInputs
        controlsDisabled={controller.controlsDisabled}
        onUpdate={controller.setFormField}
        providerId={controller.selectedProvider?.id ?? null}
        values={controller.form}
      />
      <Input
        aria-label="Cloud runtime name"
        autoComplete="off"
        disabled={controller.controlsDisabled}
        onChange={(event) => controller.setFormField("runtimeName", event.target.value)}
        placeholder={defaultRuntimeName}
        value={controller.form.runtimeName}
      />
      <RuntimeCloudReleaseInputs
        controlsDisabled={controller.controlsDisabled}
        onUpdate={controller.setFormField}
        values={controller.form}
      />
      <Button className="w-fit" disabled={resolveButtonDisabled(controller)} type="submit">
        {controller.status === "resolving" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : null}
        Resolve
      </Button>
    </form>
  );
}

function RuntimeCloudOAuthBlock({ controller }: { controller: RuntimeCloudWizardController }) {
  return (
    <RuntimeCloudOAuthSetup
      disabled={oauthSetupDisabled(controller)}
      form={controller.form}
      guide={controller.guide}
      onOpenConsole={(url) => void window.setta.app.openExternalUrl(url)}
      onSave={controller.saveOAuthCredentials}
      onUpdate={controller.setFormField}
      onValidate={controller.validateOAuthCredentials}
      status={controller.status}
    />
  );
}

function RuntimeCloudManualKeyInput({ controller }: { controller: RuntimeCloudWizardController }) {
  if (!controller.manualKeyRequired) {
    return null;
  }
  return (
    <Input
      aria-label="Manual cloud Tailscale auth key"
      autoComplete="off"
      disabled={controller.busy || controller.status === "creating"}
      onChange={(event) => controller.setFormField("manualTailscaleAuthKey", event.target.value)}
      placeholder="tskey-auth-..."
      type="password"
      value={controller.form.manualTailscaleAuthKey}
    />
  );
}

function RuntimeCloudResolutionPanel({ controller }: { controller: RuntimeCloudWizardController }) {
  if (!controller.resolution) {
    return null;
  }
  return (
    <CloudRuntimeResolutionCard
      approval={controller.approval}
      authSource={controller.oauthConfigured ? "oauth" : "manual"}
      busy={controller.busy || controller.status === "approving"}
      onApprove={controller.approveResolution}
      resolution={controller.resolution.resolution}
      warnings={controller.resolution.warnings}
    />
  );
}

async function runResolveProvision({
  controlsDisabled,
  form,
  setApproval,
  setError,
  setForm,
  setResolution,
  setStatus,
}: {
  controlsDisabled: boolean;
  form: CloudRuntimeWizardForm;
  setApproval: Dispatch<SetStateAction<CloudRuntimeApprovalState | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setForm: CloudRuntimeWizardFormSetter;
  setResolution: Dispatch<SetStateAction<CloudRuntimeProvisionResolveResult | null>>;
  setStatus: Dispatch<SetStateAction<CloudRuntimeWizardStatus>>;
}) {
  if (controlsDisabled || !window.setta.runtimes.cloudProvisionResolve) {
    return;
  }
  clearResolvedState(setApproval, setResolution);
  setError(null);
  setStatus("resolving");
  try {
    const result = await window.setta.runtimes.cloudProvisionResolve(resolveRequest(form));
    setResolution(result);
    setForm((current) => ({
      ...current,
      diskGB: String(result.resolution.diskGB),
      provider: result.provider,
      region: result.resolution.region,
      shape: result.shape,
    }));
    setStatus("idle");
  } catch (resolveError) {
    setError(errorMessage(resolveError));
    setStatus("error");
  }
}

async function runSaveOAuthCredentials({
  form,
  guide,
  setError,
  setForm,
  setGuide,
  setStatus,
}: {
  form: CloudRuntimeWizardForm;
  guide: TailscaleOAuthSetupGuide | null;
  setError: Dispatch<SetStateAction<string | null>>;
  setForm: CloudRuntimeWizardFormSetter;
  setGuide: Dispatch<SetStateAction<TailscaleOAuthSetupGuide | null>>;
  setStatus: Dispatch<SetStateAction<CloudRuntimeWizardStatus>>;
}) {
  if (!guide || !window.setta.runtimes.tailscaleOAuthSaveCredentials) {
    return;
  }
  setError(null);
  setStatus("saving-oauth");
  try {
    const oauth = await window.setta.runtimes.tailscaleOAuthSaveCredentials({
      clientId: form.clientId,
      clientSecret: form.clientSecret,
      expectedTag: guide.requiredTag,
      tailnet: guide.oauth.tailnet,
    });
    setGuide({ ...guide, oauth });
    setForm((current) => ({ ...current, clientSecret: "" }));
    setStatus("idle");
  } catch (saveError) {
    setError(errorMessage(saveError));
    setStatus("error");
  }
}

async function runValidateOAuthCredentials({
  setError,
  setGuide,
  setStatus,
}: {
  setError: Dispatch<SetStateAction<string | null>>;
  setGuide: Dispatch<SetStateAction<TailscaleOAuthSetupGuide | null>>;
  setStatus: Dispatch<SetStateAction<CloudRuntimeWizardStatus>>;
}) {
  if (!window.setta.runtimes.tailscaleOAuthValidate) {
    return;
  }
  setError(null);
  setStatus("validating-oauth");
  try {
    const validation = await window.setta.runtimes.tailscaleOAuthValidate();
    if (!validation.ok) {
      setError(validation.message);
      setStatus("error");
      return;
    }
    const refreshedGuide = await window.setta.runtimes.tailscaleOAuthSetupGuide?.();
    if (refreshedGuide) {
      setGuide(refreshedGuide);
    }
    setStatus("idle");
  } catch (validationError) {
    setError(errorMessage(validationError));
    setStatus("error");
  }
}

async function approveCloudResolution({
  form,
  manualKeyRequired,
  oauthConfigured,
  resolution,
  setApproval,
  setError,
  setStatus,
}: {
  form: CloudRuntimeWizardForm;
  manualKeyRequired: boolean;
  oauthConfigured: boolean;
  resolution: CloudRuntimeProvisionResolveResult | null;
  setApproval: Dispatch<SetStateAction<CloudRuntimeApprovalState | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setStatus: Dispatch<SetStateAction<CloudRuntimeWizardStatus>>;
}) {
  if (!resolution) {
    return;
  }
  const cloudProvisionExecute = window.setta.runtimes.cloudProvisionExecute;
  const runtimeName = normalizeRuntimeName(form.runtimeName);
  const validationError = cloudProvisionApprovalError({
    executeAvailable: Boolean(cloudProvisionExecute),
    form,
    manualKeyRequired,
    runtimeName,
  });
  if (validationError) {
    setError(validationError);
    setStatus("error");
    return;
  }
  const authSource = oauthConfigured ? "oauth" : "manual";
  setError(null);
  setStatus("creating");
  try {
    const result = await cloudProvisionExecute!({
      auth: cloudProvisionAuthInput(form, oauthConfigured),
      release: releaseInput(form),
      resolution: resolution.resolution,
      runtimeName,
    });
    if (result.mode === "existing_record") {
      setApproval(null);
      setError(cloudRuntimeExistingRecordMessage(result));
      setStatus("error");
      return;
    }
    setApproval({
      authSource,
      message: approvalMessage(authSource, result.creationRecord.recordId),
      runtimeName,
    });
    setStatus("approved");
  } catch (approvalError) {
    setError(errorMessage(approvalError));
    setStatus("error");
  }
}

function cloudProvisionApprovalError({
  executeAvailable,
  form,
  manualKeyRequired,
  runtimeName,
}: {
  executeAvailable: boolean;
  form: CloudRuntimeWizardForm;
  manualKeyRequired: boolean;
  runtimeName: string;
}): string | null {
  if (!executeAvailable) {
    return "Cloud runtime execution is unavailable in this build.";
  }
  if (manualKeyRequired && form.manualTailscaleAuthKey.trim() === "") {
    return "Manual Tailscale auth key is required when OAuth is not configured.";
  }
  if (!releaseInputComplete(form)) {
    return "Runtime release fields are required before cloud execution.";
  }
  if (runtimeName === "") {
    return "Runtime name is required.";
  }
  return null;
}

function cloudProvisionAuthInput(
  form: CloudRuntimeWizardForm,
  oauthConfigured: boolean,
): CloudRuntimeProvisionAuthInput {
  return oauthConfigured
    ? { kind: "oauth" }
    : { kind: "manual", tailscaleAuthKey: form.manualTailscaleAuthKey };
}

function approvalMessage(
  authSource: CloudRuntimeApprovalState["authSource"],
  recordID: string,
): string {
  return authSource === "oauth"
    ? `Created ${recordID} with OAuth as the auth-key source.`
    : `Created ${recordID} with a manually supplied auth key.`;
}

function clearResolvedState(
  setApproval: Dispatch<SetStateAction<CloudRuntimeApprovalState | null>>,
  setResolution: Dispatch<SetStateAction<CloudRuntimeProvisionResolveResult | null>>,
) {
  setApproval(null);
  setResolution(null);
}

function providerSelectOptions(options: CloudRuntimeProvisionOptions | null) {
  return (options?.providers ?? []).map((provider) => ({
    label: provider.displayName,
    value: provider.id,
  }));
}

function shapeSelectOptions(shapes: CloudRuntimeProvisionShape[]) {
  return shapes.map((shape) => ({
    label: `${shape.label} · ${shape.guide}`,
    value: shape.id,
  }));
}

function regionSelectOptions(provider: CloudRuntimeProvisionProvider | null) {
  return (provider?.regionPreferences ?? []).map((region) => ({
    label: region,
    value: region,
  }));
}

function resolveButtonDisabled(controller: RuntimeCloudWizardController): boolean {
  return (
    controller.controlsDisabled ||
    !controller.options ||
    controller.form.provider === "" ||
    controller.form.shape === ""
  );
}

function oauthSetupDisabled(controller: RuntimeCloudWizardController): boolean {
  return (
    controller.busy ||
    controller.status === "saving-oauth" ||
    controller.status === "validating-oauth" ||
    controller.status === "creating"
  );
}

function RuntimeCloudWizardStatusLine({
  guide,
  status,
}: {
  guide: TailscaleOAuthSetupGuide | null;
  status: CloudRuntimeWizardStatus;
}) {
  const oauthConfigured = Boolean(guide?.oauth.configured);
  const statusMessage = cloudRuntimeStatusMessage(status, oauthConfigured, guide);
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-sm border border-border/70 bg-card px-2 py-1.5 text-xs text-muted-foreground">
      {status === "loading" ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : oauthConfigured ? (
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
      ) : (
        <KeyRound className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{statusMessage}</span>
    </div>
  );
}

function cloudRuntimeStatusMessage(
  status: CloudRuntimeWizardStatus,
  oauthConfigured: boolean,
  guide: TailscaleOAuthSetupGuide | null,
): string {
  return (
    cloudRuntimeStatusMessages[status] ?? cloudRuntimeAuthStatusMessage(oauthConfigured, guide)
  );
}

function cloudRuntimeAuthStatusMessage(
  oauthConfigured: boolean,
  guide: TailscaleOAuthSetupGuide | null,
): string {
  return oauthConfigured
    ? `OAuth ready for ${guide?.oauth.expectedTag ?? "tag:setta-runtime"}`
    : "Manual key fallback active";
}

function RuntimeCloudOAuthSetup({
  disabled,
  form,
  guide,
  onOpenConsole,
  onSave,
  onUpdate,
  onValidate,
  status,
}: {
  disabled: boolean;
  form: CloudRuntimeWizardForm;
  guide: TailscaleOAuthSetupGuide | null;
  onOpenConsole: (url: string) => void;
  onSave: () => void;
  onUpdate: (field: keyof CloudRuntimeWizardForm, value: string) => void;
  onValidate: () => void;
  status: CloudRuntimeWizardStatus;
}) {
  if (!guide) {
    return null;
  }
  const saveDisabled = disabled || form.clientId.trim() === "" || form.clientSecret.trim() === "";
  return (
    <details className="rounded-sm border border-border/70 bg-card px-2 py-1.5 text-xs text-muted-foreground">
      <summary className="cursor-pointer text-foreground">Tailscale OAuth</summary>
      <div className="mt-2 grid gap-1.5">
        <div className="grid grid-cols-[1fr_auto] gap-1">
          <Input
            aria-label="Tailscale OAuth client ID"
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => onUpdate("clientId", event.target.value)}
            placeholder={guide.credentialFields.clientIdLabel}
            value={form.clientId}
          />
          <Button disabled={disabled} onClick={() => onOpenConsole(guide.adminConsoleUrl)}>
            <ExternalLink className="h-3.5 w-3.5" />
            Console
          </Button>
        </div>
        <Input
          aria-label="Tailscale OAuth client secret"
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => onUpdate("clientSecret", event.target.value)}
          placeholder={guide.credentialFields.clientSecretLabel}
          type="password"
          value={form.clientSecret}
        />
        <div className="flex min-w-0 flex-wrap gap-1">
          <Button disabled={saveDisabled} onClick={onSave}>
            {status === "saving-oauth" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
          <Button disabled={disabled || !guide.oauth.configured} onClick={onValidate}>
            {status === "validating-oauth" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            Validate
          </Button>
        </div>
        <RuntimeCloudOAuthSnippet label="tagOwners" value={guide.aclSnippet} />
        <RuntimeCloudOAuthSnippet label="runtime ACL" value={guide.runtimeIsolationPolicySnippet} />
      </div>
    </details>
  );
}

function RuntimeCloudOAuthSnippet({ label, value }: { label: string; value: string }) {
  return (
    <details className="rounded-sm border border-border/60 bg-background/55 px-2 py-1">
      <summary className="cursor-pointer text-[11px] uppercase text-muted-foreground">
        {label}
      </summary>
      <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-4 text-muted-foreground">
        {value}
      </pre>
    </details>
  );
}

function RuntimeCloudSelect({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <select
      aria-label={label}
      className="h-7 min-w-0 rounded-sm border border-input bg-card px-2 py-1 text-xs text-foreground shadow-sm outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function RuntimeCloudWizardError({ error }: { error: string | null }) {
  if (!error) {
    return null;
  }
  return (
    <p className="flex min-w-0 items-start gap-1.5 rounded-sm border border-destructive/35 bg-destructive/10 px-2 py-1.5 text-xs leading-4 text-destructive">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{error}</span>
    </p>
  );
}

function formWithDefaults(
  form: CloudRuntimeWizardForm,
  options: CloudRuntimeProvisionOptions,
): CloudRuntimeWizardForm {
  const provider = cloudProviderWithFallback(options, form.provider);
  const shape = cloudShapeWithFallback(options, form.shape);
  return {
    ...form,
    diskGB: defaultDiskGBValue(form.diskGB, shape),
    provider: provider?.id ?? "",
    region: defaultRegionValue(form.region, provider),
    runtimeName: defaultTextValue(form.runtimeName, defaultRuntimeName),
    shape: shape?.id ?? "",
  };
}

function cloudProviderWithFallback(
  options: CloudRuntimeProvisionOptions,
  providerID: string,
): CloudRuntimeProvisionProvider | null {
  return (
    selectedCloudProvider(options, providerID) ?? providerByID(options, options.defaultProvider)
  );
}

function cloudShapeWithFallback(
  options: CloudRuntimeProvisionOptions,
  shapeID: string,
): CloudRuntimeProvisionShape | null {
  return (
    selectedCloudShape(options, shapeID) ??
    shapeByID(options, options.defaultShape) ??
    options.shapes[0] ??
    null
  );
}

function defaultDiskGBValue(value: string, shape: CloudRuntimeProvisionShape | null): string {
  return defaultTextValue(value, shape ? String(shape.diskFloorGb) : "");
}

function defaultRegionValue(value: string, provider: CloudRuntimeProvisionProvider | null): string {
  return defaultTextValue(value, provider?.regionPreferences[0] ?? "");
}

function defaultTextValue(value: string, fallback: string): string {
  return value.trim() === "" ? fallback : value;
}

function resolveRequest(form: CloudRuntimeWizardForm): CloudRuntimeProvisionResolveRequest {
  const request: CloudRuntimeProvisionResolveRequest = {
    diskGB: positiveIntegerOrUndefined(form.diskGB),
    intent: form.intent,
    provider: form.provider,
    region: form.region,
    shape: form.shape,
  };
  const awsPlacement = runtimeCloudAWSPlacementInput(form.provider, form);
  if (awsPlacement) {
    request.awsPlacement = awsPlacement;
  }
  return request;
}

function releaseInput(form: CloudRuntimeWizardForm): CloudRuntimeProvisionReleaseInput {
  return {
    installerSha256: form.installerSha256,
    minisignPublicKey: form.minisignPublicKey,
    releaseBaseUrl: form.releaseBaseUrl,
    settaVersion: form.settaVersion,
  };
}

function releaseInputComplete(form: CloudRuntimeWizardForm): boolean {
  return Object.values(releaseInput(form)).every((value) => value.trim() !== "");
}

function selectedCloudProvider(
  options: CloudRuntimeProvisionOptions | null,
  providerID: string,
): CloudRuntimeProvisionProvider | null {
  if (!options) {
    return null;
  }
  return providerByID(options, providerID) ?? providerByID(options, options.defaultProvider);
}

function selectedCloudShape(
  options: CloudRuntimeProvisionOptions | null,
  shapeID: string,
): CloudRuntimeProvisionShape | null {
  if (!options) {
    return null;
  }
  return shapeByID(options, shapeID) ?? shapeByID(options, options.defaultShape);
}

function providerByID(
  options: CloudRuntimeProvisionOptions,
  providerID: string,
): CloudRuntimeProvisionProvider | null {
  return options.providers.find((provider) => provider.id === providerID) ?? null;
}

function shapeByID(
  options: CloudRuntimeProvisionOptions,
  shapeID: string,
): CloudRuntimeProvisionShape | null {
  return options.shapes.find((shape) => shape.id === shapeID) ?? null;
}

function shapesForProvider(
  options: CloudRuntimeProvisionOptions | null,
  provider: CloudRuntimeProvisionProvider | null,
): CloudRuntimeProvisionShape[] {
  if (!options || !provider) {
    return [];
  }
  return options.shapes.filter((shape) => provider.shapeIds.includes(shape.id));
}

function firstSupportedShapeID(
  options: CloudRuntimeProvisionOptions | null,
  provider: CloudRuntimeProvisionProvider | null,
): string | null {
  return shapesForProvider(options, provider)[0]?.id ?? null;
}

function positiveIntegerOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  const numberValue = Number(trimmed);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function normalizeRuntimeName(value: string): string {
  return value.trim().toLowerCase();
}

function updateForm(
  setForm: (updater: (current: CloudRuntimeWizardForm) => CloudRuntimeWizardForm) => void,
  field: keyof CloudRuntimeWizardForm,
  value: string,
) {
  setForm((current) => ({ ...current, [field]: value }));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
