import * as Dialog from "@radix-ui/react-dialog";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import {
  checkIfFileExists,
  listShareDeployments,
  publishShareDeployment,
  type HttpapiDeploymentMetadataResponse,
  type HttpapiPublishShareDeploymentRequest,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { closeModal } from "state/actions/modal";
import { addTemporaryNotification } from "state/actions/notifications";
import { NULL_PROJECT_CONFIG_ID, useProjectState } from "state/definitions";
import { buildSharePath } from "utils/constants";
import { createDefaultSharePolicy } from "utils/deploymentPolicies";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  RunSnapshotModeUIConfig,
  type Policy,
  type RunSnapshotMode,
} from "utils/generatedTypes";
import { createRandomName } from "utils/idNameCreation";

type DeploymentMetadata = HttpapiDeploymentMetadataResponse;
type SharePolicyOverridesInput = Policy;
type CheckIfFileExistsRouteResponse = ResponseDataAndStatus<boolean>;
const DEPLOYMENT_RUN_SNAPSHOT_MODE_OPTIONS: Array<{
  value: RunSnapshotMode;
  label: string;
}> = RunSnapshotModeUIConfig.deploymentOptions;

function createDefaultDeploymentName(): string {
  const baseName = createRandomName();
  return `share-${baseName.split("_").join("-")}`;
}
const LISTENER_ENTRYPOINT_STORAGE_KEY =
  "setta.publishShareDeployment.listenerEntrypoint";
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
export function PublishShareDeploymentModal({ open }: { open: boolean }) {
  const projectConfig = useProjectState((x) => x.projectConfig);
  const [policyOverrides, setPolicyOverrides] =
    useState<SharePolicyOverridesInput>(createDefaultSharePolicy);
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
  const shareUrl = useMemo(() => {
    if (!publishedDeployment) {
      return null;
    }
    return buildShareUrl();
  }, [publishedDeployment]);
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
      listShareDeployments(),
    )) as ResponseDataAndStatus<Array<DeploymentMetadata>>;
    setIsLoadingRecent(false);
    if (res200(res)) {
      setRecentDeployments(res.data ?? []);
      return;
    }
    setRecentDeployments([]);
  }
  function resetForm(): void {
    setPolicyOverrides(createDefaultSharePolicy());
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
    const payload: HttpapiPublishShareDeploymentRequest = {
      deploymentName: resolvedDeploymentName,
      projectConfigId: projectConfig.id,
      sharePolicyOverrides: policyOverrides,
      listenerEntrypoint: trimmedEntrypoint,
      listenerEnabled: trimmedEntrypoint.length > 0 ? listenerEnabled : false,
    };
    const res = (await callOpenAPI(
      publishShareDeployment({
        body: payload,
      } as Parameters<typeof publishShareDeployment>[0]),
    )) as ResponseDataAndStatus<DeploymentMetadata>;
    setIsPublishing(false);
    if (res200(res)) {
      setPublishedDeployment(res.data);
      addTemporaryNotification("Share deployment published.");
      void loadRecentDeployments();
      return;
    }
    setErrorMessage(extractErrorMessage(res.status, res.data));
  }
  function handleCopy(text: string): void {
    void navigator.clipboard.writeText(text);
    addTemporaryNotification("Copied to clipboard.");
  }
  function handleOpenShare(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  const publishLabel = publishedDeployment
    ? "Publish New Deployment"
    : "Publish Deployment";
  const publishDisabled =
    isPublishing || projectConfig.id === NULL_PROJECT_CONFIG_ID;
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <header className="flex flex-col gap-2">
        <Dialog.Title className="text-xl font-semibold text-setta-800 dark:text-setta-200">
          Publish Share Deployment
        </Dialog.Title>
        <Dialog.Description className="text-sm text-setta-600 dark:text-setta-300">
          Create a read-only snapshot for sharing. Re-publish any time to ship
          updated state.
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
        <SectionCard
          title="Share Policy"
          subtitle="Control what viewers can change."
        >
          <ToggleRow
            label="Parameter changes"
            description="Allow per-viewer param edits."
            checked={policyOverrides.allowParamChanges}
            onChange={(checked) => setPolicyFlag("allowParamChanges", checked)}
          />
          <ToggleRow
            label="Variant changes"
            description="Allow variant changes + view mode switching."
            checked={policyOverrides.allowVariantChanges}
            onChange={(checked) =>
              setPolicyFlag("allowVariantChanges", checked)
            }
          />
          <ToggleRow
            label="Layout changes"
            description="Allow move + resize adjustments."
            checked={policyOverrides.allowLayoutChanges}
            onChange={(checked) => setPolicyFlag("allowLayoutChanges", checked)}
          />
          <ToggleRow
            label="Run & terminals"
            description="Allow code execution in share mode."
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
            description="Allow outbound links from the share UI."
            checked={policyOverrides.allowExternalLinks}
            onChange={(checked) => setPolicyFlag("allowExternalLinks", checked)}
          />
          <ToggleRow
            label="File downloads"
            description="Allow file downloads from the share UI."
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
            options={DEPLOYMENT_RUN_SNAPSHOT_MODE_OPTIONS}
            onChange={setPolicyRunSnapshotMode}
            disabled={!policyOverrides.allowRun}
          />
        </SectionCard>

        <SectionCard
          title="Listener"
          subtitle="Wire a listener entrypoint into the share snapshot."
        >
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
          </label>
          <ToggleRow
            label="Enable listener"
            description="Only used when an entrypoint is set."
            checked={listenerEnabled}
            onChange={setListenerEnabled}
          />
        </SectionCard>

        <SectionCard title="Deployment" subtitle="Share link + instructions.">
          <label className="flex flex-col gap-2 text-xs text-setta-500 dark:text-setta-400">
            Deployment name
            <input
              className="w-full rounded-md border border-setta-200 bg-white/80 px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
              placeholder="my-share-deployment"
              value={deploymentName}
              onChange={(event) => setDeploymentName(event.target.value)}
            />
          </label>
          {!publishedDeployment ? (
            <div className="rounded-md border border-dashed border-setta-200 bg-white/70 px-3 py-2 text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-900/60 dark:text-setta-400">
              Publish to generate a deployment version. Share URL comes from the
              share backend.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-xs text-setta-500 dark:text-setta-400">
                Deployment name
              </div>
              <ShareValueRow
                value={publishedDeployment.deploymentName}
                onCopy={() => handleCopy(publishedDeployment.deploymentName)}
              />
              <div className="text-xs text-setta-500 dark:text-setta-400">
                Default config
              </div>
              <ShareValueRow
                value={publishedDeployment.defaultProjectConfigName}
                onCopy={() =>
                  handleCopy(publishedDeployment.defaultProjectConfigName)
                }
              />
              <div className="text-xs text-setta-500 dark:text-setta-400">
                Deployment version
              </div>
              <ShareValueRow
                value={publishedDeployment.deploymentVersion}
                onCopy={() => handleCopy(publishedDeployment.deploymentVersion)}
              />
              {shareUrl && (
                <>
                  <div className="text-xs text-setta-500 dark:text-setta-400">
                    Share URL
                  </div>
                  <ShareValueRow
                    value={shareUrl}
                    onCopy={() => handleCopy(shareUrl)}
                    onOpen={() => handleOpenShare(shareUrl)}
                  />
                </>
              )}
            </div>
          )}

          <div className="rounded-lg border border-setta-200 bg-setta-50/70 px-3 py-2 text-[11px] text-setta-500 dark:border-setta-700 dark:bg-setta-900/40 dark:text-setta-400">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              Share backend
            </div>
            <div className="mb-1">
              If the share URL is blank or errors, start a share backend:
            </div>
            <code className="block whitespace-pre-wrap rounded-md bg-white/80 px-2 py-1 font-mono text-[11px] text-setta-600 dark:bg-setta-950 dark:text-setta-300">
              setta --port 8001 share --deployment-name{" "}
              {publishedDeployment
                ? publishedDeployment.deploymentName
                : "<deployment-name>"}{" "}
              --version{" "}
              {publishedDeployment
                ? publishedDeployment.deploymentVersion
                : "<version>"}
            </code>
          </div>

          <RecentDeploymentList
            deployments={recentDeployments}
            isLoading={isLoadingRecent}
            onCopy={handleCopy}
            onOpen={handleOpenShare}
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
function ShareValueRow({
  value,
  onCopy,
  onOpen,
}: {
  value: string;
  onCopy: () => void;
  onOpen?: () => void;
}) {
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
      {onOpen && (
        <button
          className="cursor-pointer rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          onClick={onOpen}
        >
          Open
        </button>
      )}
    </div>
  );
}
function RecentDeploymentList({
  deployments,
  isLoading,
  onCopy,
  onOpen,
}: {
  deployments: Array<DeploymentMetadata>;
  isLoading: boolean;
  onCopy: (value: string) => void;
  onOpen: (value: string) => void;
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
        {deployments.slice(0, 5).map((deployment) => {
          const url = buildShareUrl();
          return (
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
                <button
                  className="cursor-pointer rounded-full border border-setta-200 px-2 py-1 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                  onClick={() => onCopy(url)}
                >
                  Copy URL
                </button>
                <button
                  className="cursor-pointer rounded-full border border-setta-200 px-2 py-1 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                  onClick={() => onOpen(url)}
                >
                  Open
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function buildShareUrl(): string {
  const sharePath = buildSharePath(null);
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${sharePath}`;
  }
  return sharePath;
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
