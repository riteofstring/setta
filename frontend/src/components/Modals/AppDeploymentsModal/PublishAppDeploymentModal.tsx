import * as Dialog from "@radix-ui/react-dialog";
import {
  normalizeActionDefinitions,
  resolveActionBinding,
  resolveActionType,
} from "components/App/appBindings";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import {
  checkIfFileExists,
  listAppDeployments,
  publishAppDeployment,
  type HttpapiDeploymentMetadataResponse,
  type HttpapiPublishAppDeploymentRequest,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { closeModal } from "state/actions/modal";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  NULL_PROJECT_CONFIG_ID,
  useAppDefinition,
  useProjectState,
} from "state/definitions";
import { createDefaultAppPolicy } from "utils/deploymentPolicies";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  RunSnapshotModeUIConfig,
  type Policy,
  type RunSnapshotMode,
} from "utils/generatedTypes";
import { createRandomName } from "utils/idNameCreation";

type DeploymentMetadata = HttpapiDeploymentMetadataResponse;
type AppPolicyOverridesInput = Policy;
type CheckIfFileExistsRouteResponse = ResponseDataAndStatus<boolean>;

function createDefaultDeploymentName(): string {
  const baseName = createRandomName();
  return `app-${baseName.split("_").join("-")}`;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function listActionButtons(appSpec: unknown): Array<Record<string, unknown>> {
  if (!isRecord(appSpec)) {
    return [];
  }
  const elements = appSpec.elements;
  if (!isRecord(elements)) {
    return [];
  }
  const output: Array<Record<string, unknown>> = [];
  for (const raw of Object.values(elements)) {
    if (!isRecord(raw)) {
      continue;
    }
    if (raw.type !== "ActionButton") {
      continue;
    }
    const props = raw.props;
    output.push(isRecord(props) ? props : {});
  }
  return output;
}
type RunActionBindingStatus = "bound" | "missing-section" | "not-run";

function normalizeActionBindingsSource(
  dataBindingsSource: unknown,
): Record<string, unknown> | null {
  return isRecord(dataBindingsSource) ? dataBindingsSource : null;
}

function normalizeActionDefinitionsSource(
  actionsSource: unknown,
): ReturnType<typeof normalizeActionDefinitions> {
  return normalizeActionDefinitions(
    isRecord(actionsSource) ? actionsSource : null,
  );
}

function isRunActionBinding(
  action: string,
  definition: Record<string, unknown> | null,
): boolean {
  return action === "run" || resolveActionType(action, definition) === "run";
}

function resolveDefinitionSectionId(
  definition: Record<string, unknown> | null,
): string | null {
  return definition && typeof definition.sectionId === "string"
    ? definition.sectionId
    : null;
}

function resolveActionButtonRunBindingStatus(
  props: Record<string, unknown>,
  dataBindingsSource: unknown,
  actionsSource: unknown,
): RunActionBindingStatus {
  const dataBindings = normalizeActionBindingsSource(dataBindingsSource);
  const actions = normalizeActionDefinitionsSource(actionsSource);
  const { action, sectionId } = resolveActionBinding(props, dataBindings);
  if (!action) {
    return "not-run";
  }
  const definition = actions[action] ?? null;
  if (!isRunActionBinding(action, definition)) {
    return "not-run";
  }
  const fallbackSectionId = resolveDefinitionSectionId(definition);
  return sectionId ?? fallbackSectionId ? "bound" : "missing-section";
}

function resolveAppSpecRunBindingStatus(
  appSpec: unknown,
  dataBindingsSource: unknown,
  actionsSource: unknown,
): RunActionBindingStatus {
  let sawRun = false;
  for (const props of listActionButtons(appSpec)) {
    const status = resolveActionButtonRunBindingStatus(
      props,
      dataBindingsSource,
      actionsSource,
    );
    if (status === "bound") {
      return "bound";
    }
    if (status === "missing-section") {
      sawRun = true;
    }
  }
  return sawRun ? "missing-section" : "not-run";
}

function getRunBindingWarning(params: {
  allowRun: boolean;
  entryCodeBlockId: string | null | undefined;
  appSpec: unknown;
  actionsSource: unknown;
  dataBindingsSource: unknown;
}): string | null {
  if (!params.allowRun || params.entryCodeBlockId) {
    return null;
  }
  if (!params.appSpec) {
    return "No app spec loaded. Save an app spec before publishing (or disable runs in policy).";
  }
  if (listActionButtons(params.appSpec).length === 0) {
    return "App spec has no ActionButton. Add a Run button (or disable runs in policy).";
  }
  switch (
    resolveAppSpecRunBindingStatus(
      params.appSpec,
      params.dataBindingsSource,
      params.actionsSource,
    )
  ) {
    case "bound":
      return null;
    case "not-run":
      return "App spec has no Run ActionButton.";
    default:
      return "Run ActionButton is missing sectionId and this config has no entry code block.";
  }
}

const LISTENER_ENTRYPOINT_STORAGE_KEY =
  "setta.publishAppDeployment.listenerEntrypoint";
const DEFAULT_LISTENER_ENTRYPOINT = "listener/app.py";
function loadStoredListenerEntrypoint(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(LISTENER_ENTRYPOINT_STORAGE_KEY) ?? "";
}
function storeListenerEntrypoint(value: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LISTENER_ENTRYPOINT_STORAGE_KEY, value);
}
export function PublishAppDeploymentModal({ open }: { open: boolean }) {
  const projectConfig = useProjectState((x) => x.projectConfig);
  const appSpec = useAppDefinition((x) => x.appSpec);
  const appDefinition = useAppDefinition((x) => x.appDefinition);
  const [policyOverrides, setPolicyOverrides] =
    useState<AppPolicyOverridesInput>(createDefaultAppPolicy);
  const [listenerEntrypoint, setListenerEntrypoint] = useState(
    loadStoredListenerEntrypoint,
  );
  const [listenerEnabled, setListenerEnabled] = useState(true);
  const [deploymentName, setDeploymentName] = useState(
    createDefaultDeploymentName,
  );
  const [publishedDeployment, setPublishedDeployment] =
    useState<DeploymentMetadata | null>(null);
  const [recentDeployments, setRecentDeployments] = useState<
    Array<DeploymentMetadata>
  >([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    resetForm();
    void loadRecentDeployments();
    void maybeAutofillListenerEntrypoint();
  }, [open]);
  async function maybeAutofillListenerEntrypoint(): Promise<void> {
    if (loadStoredListenerEntrypoint().trim().length > 0) {
      return;
    }
    const res = (await callOpenAPI(
      checkIfFileExists({
        body: {
          filepath: DEFAULT_LISTENER_ENTRYPOINT,
        },
      } as Parameters<typeof checkIfFileExists>[0]),
    )) as CheckIfFileExistsRouteResponse;
    if (res200(res) && res.data) {
      setListenerEntrypoint((current) => {
        if (current.trim().length > 0) {
          return current;
        }
        storeListenerEntrypoint(DEFAULT_LISTENER_ENTRYPOINT);
        return DEFAULT_LISTENER_ENTRYPOINT;
      });
    }
  }
  async function loadRecentDeployments(): Promise<void> {
    setIsLoadingRecent(true);
    const res = (await callOpenAPI(
      listAppDeployments(),
    )) as ResponseDataAndStatus<Array<DeploymentMetadata>>;
    setIsLoadingRecent(false);
    if (res200(res)) {
      setRecentDeployments(res.data ?? []);
      return;
    }
    setRecentDeployments([]);
  }
  function resetForm(): void {
    setPolicyOverrides(createDefaultAppPolicy());
    setListenerEntrypoint(loadStoredListenerEntrypoint());
    setListenerEnabled(true);
    setDeploymentName(createDefaultDeploymentName());
    setPublishedDeployment(null);
    setErrorMessage(null);
  }
  function setPolicyFlag(key: PolicyFlag, checked: boolean): void {
    setPolicyOverrides((current) => ({ ...current, [key]: checked }));
  }
  function setPolicyRunSnapshotMode(mode: RunSnapshotMode): void {
    setPolicyOverrides((current) => ({ ...current, runSnapshotMode: mode }));
  }
  async function handlePublish(): Promise<void> {
    const trimmedDeploymentName = deploymentName.trim();
    let resolvedDeploymentName = trimmedDeploymentName;
    if (!resolvedDeploymentName) {
      resolvedDeploymentName = createDefaultDeploymentName();
      setDeploymentName(resolvedDeploymentName);
    }
    if (projectConfig.id === NULL_PROJECT_CONFIG_ID) {
      setErrorMessage("Select a project config before publishing.");
      return;
    }
    setIsPublishing(true);
    setErrorMessage(null);
    const trimmedEntrypoint = listenerEntrypoint.trim();
    const payload: HttpapiPublishAppDeploymentRequest = {
      deploymentName: resolvedDeploymentName,
      projectConfigId: projectConfig.id,
      appPolicyOverrides: policyOverrides,
      listenerEntrypoint: trimmedEntrypoint,
      listenerEnabled: trimmedEntrypoint.length > 0 ? listenerEnabled : false,
    };
    const res = (await callOpenAPI(
      publishAppDeployment({
        body: payload,
      } as Parameters<typeof publishAppDeployment>[0]),
    )) as ResponseDataAndStatus<DeploymentMetadata>;
    setIsPublishing(false);
    if (res200(res)) {
      setPublishedDeployment(res.data);
      addTemporaryNotification("App deployment published.");
      void loadRecentDeployments();
      return;
    }
    setErrorMessage(extractErrorMessage(res.status, res.data));
  }
  function handleCopy(text: string): void {
    void navigator.clipboard.writeText(text);
    addTemporaryNotification("Copied to clipboard.");
  }
  const publishLabel = publishedDeployment
    ? "Publish New Deployment"
    : "Publish Deployment";
  const publishDisabled =
    isPublishing || projectConfig.id === NULL_PROJECT_CONFIG_ID;
  const runBindingWarning = useMemo(() => {
    return getRunBindingWarning({
      allowRun: policyOverrides.allowRun,
      entryCodeBlockId: projectConfig.entryCodeBlockId,
      appSpec,
      actionsSource: appDefinition?.actions,
      dataBindingsSource: appDefinition?.dataBindings,
    });
  }, [
    appDefinition?.actions,
    appDefinition?.dataBindings,
    appSpec,
    policyOverrides.allowRun,
    projectConfig.entryCodeBlockId,
  ]);
  const appCommand = useMemo(
    () =>
      `setta --port 8001 app --deployment-name ${
        publishedDeployment
          ? publishedDeployment.deploymentName
          : "<deployment-name>"
      } --version ${
        publishedDeployment
          ? publishedDeployment.deploymentVersion
          : "<version>"
      }`,
    [publishedDeployment],
  );
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <header className="flex flex-col gap-2">
        <Dialog.Title className="text-xl font-semibold text-setta-800 dark:text-setta-200">
          Publish App Deployment
        </Dialog.Title>
        <Dialog.Description className="text-sm text-setta-600 dark:text-setta-300">
          Create a user-facing snapshot for app mode. Re-publish to ship
          updates.
        </Dialog.Description>
        <div className="text-xs text-setta-500 dark:text-setta-400">
          Current config:{" "}
          <span className="font-semibold text-setta-700 dark:text-setta-200">
            {projectConfig.name}
          </span>{" "}
          <span className="font-mono text-[11px] text-setta-400 dark:text-setta-500">
            ({projectConfig.id})
          </span>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/60 dark:bg-red-900/40 dark:text-red-200">
          {errorMessage}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pr-1 lg:grid-cols-2">
        <SectionCard title="App Policy" subtitle="Control app capabilities.">
          <ToggleRow
            label="Parameter changes"
            description="Allow per-viewer param edits."
            checked={policyOverrides.allowParamChanges}
            onChange={(checked) => setPolicyFlag("allowParamChanges", checked)}
          />
          <ToggleRow
            label="Run access"
            description="Allow code execution from the app."
            checked={policyOverrides.allowRun}
            onChange={(checked) => setPolicyFlag("allowRun", checked)}
          />
          <ToggleRow
            label="Multiple runs"
            description="Allow multiple runs per session."
            checked={policyOverrides.allowMultipleRuns}
            onChange={(checked) => setPolicyFlag("allowMultipleRuns", checked)}
            disabled={!policyOverrides.allowRun}
          />
          <ToggleRow
            label="External links"
            description="Allow outbound links from the app UI."
            checked={policyOverrides.allowExternalLinks}
            onChange={(checked) => setPolicyFlag("allowExternalLinks", checked)}
          />
          <ToggleRow
            label="File downloads"
            description="Allow file downloads from the app."
            checked={policyOverrides.allowFileDownloads}
            onChange={(checked) => setPolicyFlag("allowFileDownloads", checked)}
          />
          <ToggleRow
            label="LLM access"
            description="Enable chat + AI features."
            checked={policyOverrides.allowLLM}
            onChange={(checked) => setPolicyFlag("allowLLM", checked)}
          />
          <SelectRow
            label="Run snapshot mode"
            description="How run output should be stored."
            value={policyOverrides.runSnapshotMode}
            options={RunSnapshotModeUIConfig.deploymentOptions}
            onChange={setPolicyRunSnapshotMode}
            disabled={!policyOverrides.allowRun}
          />
        </SectionCard>

        <SectionCard
          title="Listener"
          subtitle="Wire a listener entrypoint into the app snapshot."
        >
          {runBindingWarning && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
              {runBindingWarning}
            </div>
          )}
          <label className="flex flex-col gap-2 text-xs text-setta-500 dark:text-setta-400">
            Entrypoint path
            <input
              className="w-full rounded-md border border-setta-200 bg-white/80 px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
              placeholder="listener/app.py"
              value={listenerEntrypoint}
              onChange={(event) => {
                const value = event.target.value;
                setListenerEntrypoint(value);
                storeListenerEntrypoint(value);
              }}
            />
            <span className="text-[11px] text-setta-500 dark:text-setta-400">
              Optional. The file must define <code>build_listener</code> or{" "}
              <code>build_callbacks</code>.
            </span>
          </label>
          <ToggleRow
            label="Enable listener"
            description="Only used when an entrypoint is set."
            checked={listenerEnabled}
            onChange={setListenerEnabled}
          />
        </SectionCard>

        <SectionCard title="Deployment" subtitle="App deployment details.">
          <label className="flex flex-col gap-2 text-xs text-setta-500 dark:text-setta-400">
            Deployment name
            <input
              className="w-full rounded-md border border-setta-200 bg-white/80 px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
              placeholder="my-app-deployment"
              value={deploymentName}
              onChange={(event) => setDeploymentName(event.target.value)}
            />
          </label>
          {!publishedDeployment ? (
            <div className="rounded-md border border-dashed border-setta-200 bg-white/70 px-3 py-2 text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-900/60 dark:text-setta-400">
              Publish to generate a deployment version.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-xs text-setta-500 dark:text-setta-400">
                Deployment name
              </div>
              <ValueRow
                value={publishedDeployment.deploymentName}
                onCopy={() => handleCopy(publishedDeployment.deploymentName)}
              />
              <div className="text-xs text-setta-500 dark:text-setta-400">
                Default config
              </div>
              <ValueRow
                value={publishedDeployment.defaultProjectConfigName}
                onCopy={() =>
                  handleCopy(publishedDeployment.defaultProjectConfigName)
                }
              />
              <div className="text-xs text-setta-500 dark:text-setta-400">
                Deployment version
              </div>
              <ValueRow
                value={publishedDeployment.deploymentVersion}
                onCopy={() => handleCopy(publishedDeployment.deploymentVersion)}
              />
            </div>
          )}

          <div className="rounded-lg border border-setta-200 bg-setta-50/70 px-3 py-2 text-[11px] text-setta-500 dark:border-setta-700 dark:bg-setta-900/40 dark:text-setta-400">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              App backend
            </div>
            <div className="mb-1">
              Start an app backend to serve this deployment:
            </div>
            <code className="block whitespace-pre-wrap rounded-md bg-white/80 px-2 py-1 font-mono text-[11px] text-setta-600 dark:bg-setta-950 dark:text-setta-300">
              {appCommand}
            </code>
          </div>

          <RecentDeploymentList
            deployments={recentDeployments}
            isLoading={isLoadingRecent}
            onCopy={handleCopy}
          />
        </SectionCard>
      </div>

      <div className="flex justify-end gap-2 border-t border-setta-200 pt-3 dark:border-setta-700">
        <Dialog.Close asChild>
          <button
            className="cursor-pointer rounded-full border border-setta-300 px-4 py-2 text-sm font-semibold text-setta-600 transition-colors hover:bg-setta-50 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={closeModal}
          >
            Close
          </button>
        </Dialog.Close>
        <button
          className="cursor-pointer rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={publishDisabled}
          onClick={() => void handlePublish()}
        >
          {isPublishing ? "Publishing..." : publishLabel}
        </button>
      </div>
    </div>
  );
}
type PolicyFlag =
  | "allowParamChanges"
  | "allowVariantChanges"
  | "allowLayoutChanges"
  | "allowRun"
  | "allowLLM"
  | "allowExternalLinks"
  | "allowFileDownloads"
  | "allowMultipleRuns";
function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-setta-200 bg-setta-50/70 p-4 dark:border-setta-700 dark:bg-setta-900/40">
      <div className="flex flex-col gap-1">
        <div className="text-xs font-bold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          {title}
        </div>
        {subtitle && (
          <div className="text-xs text-setta-500 dark:text-setta-400">
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  checked: boolean | null;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-setta-200 bg-white/80 px-3 py-2 text-xs text-setta-600 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300">
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-setta-700 dark:text-setta-200">
          {label}
        </span>
        <span className="text-[11px] text-setta-500 dark:text-setta-400">
          {description}
        </span>
      </div>
      <SwitchInput
        value={Boolean(checked)}
        onChange={onChange}
        isDisabled={disabled}
      />
    </div>
  );
}
function SelectRow<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  value: T;
  options: Array<{
    value: T;
    label: string;
  }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-setta-200 bg-white/80 px-3 py-2 text-xs text-setta-600 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300">
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-setta-700 dark:text-setta-200">
          {label}
        </span>
        <span className="text-[11px] text-setta-500 dark:text-setta-400">
          {description}
        </span>
      </div>
      <select
        className="rounded border border-setta-200 bg-transparent px-2 py-1 text-[11px] text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed dark:border-setta-700 dark:text-setta-200"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
function ValueRow({ value, onCopy }: { value: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 truncate rounded-md border border-setta-200 bg-white/80 px-2 py-1 font-mono text-[11px] text-setta-600 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-300">
        {value}
      </div>
      <button
        className="cursor-pointer rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
        onClick={onCopy}
      >
        Copy
      </button>
    </div>
  );
}
function RecentDeploymentList({
  deployments,
  isLoading,
  onCopy,
}: {
  deployments: Array<DeploymentMetadata>;
  isLoading: boolean;
  onCopy: (value: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="text-xs text-setta-500 dark:text-setta-400">
        Loading recent deployments...
      </div>
    );
  }
  if (deployments.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
        Recent deployments
      </div>
      <div className="flex flex-col gap-2">
        {deployments.slice(0, 5).map((deployment) => (
          <div
            key={`${deployment.deploymentName}-${deployment.deploymentVersion}`}
            className="rounded-md border border-setta-200 bg-white/70 px-3 py-2 text-[11px] text-setta-500 dark:border-setta-700 dark:bg-setta-900/50 dark:text-setta-400"
          >
            <div className="font-mono text-[11px] text-setta-600 dark:text-setta-300">
              {deployment.deploymentName}/{deployment.deploymentVersion}
            </div>
            <div className="text-[10px] text-setta-500 dark:text-setta-400">
              Default config: {deployment.defaultProjectConfigName}
            </div>
            <div className="mb-2 truncate text-[10px] text-setta-400 dark:text-setta-500">
              {deployment.deploymentRoot}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="cursor-pointer rounded-full border border-setta-200 px-2 py-1 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                onClick={() => onCopy(deployment.deploymentName)}
              >
                Copy deployment name
              </button>
              <button
                className="cursor-pointer rounded-full border border-setta-200 px-2 py-1 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                onClick={() => onCopy(deployment.deploymentVersion)}
              >
                Copy version
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function extractErrorMessage(
  status: number | undefined,
  data: DeploymentMetadata | undefined,
): string {
  const payload = data as unknown;
  if (payload && typeof payload === "object") {
    const maybeDetail = (
      payload as {
        detail?: unknown;
      }
    ).detail;
    if (typeof maybeDetail === "string") {
      return maybeDetail;
    }
  }
  if (status) {
    return `Publish failed with status ${status}.`;
  }
  return "Publish failed. No response from backend.";
}
