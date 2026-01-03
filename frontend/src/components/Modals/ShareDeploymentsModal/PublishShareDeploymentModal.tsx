import * as Dialog from "@radix-ui/react-dialog";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { closeModal } from "state/actions/modal";
import { addTemporaryNotification } from "state/actions/notifications";
import { NULL_PROJECT_CONFIG_ID, useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_list_share_deployments,
  route_publish_share_deployment,
} from "utils/generatedEndpoints";
import type {
  PublishShareDeploymentRequestInput,
  ShareDeploymentMetadata,
  SharePolicy,
} from "utils/generatedTypes";

type SharePolicyOverridesInput = NonNullable<
  PublishShareDeploymentRequestInput["sharePolicyOverrides"]
>;
type RunSnapshotMode = SharePolicy["runSnapshotMode"];
type ListenerIsolationMode = SharePolicy["listenerIsolation"];

const DEFAULT_RUN_SNAPSHOT_MODE: RunSnapshotMode = "ephemeral";
const DEFAULT_LISTENER_ISOLATION: ListenerIsolationMode = "per_viewer";

function createDefaultPolicyOverrides(): SharePolicyOverridesInput {
  return {
    allowParamChanges: true,
    allowVariantChanges: true,
    allowLayoutChanges: true,
    allowStructuralChanges: true,
    allowRun: false,
    allowLLM: false,
    allowMCP: false,
    runSnapshotMode: DEFAULT_RUN_SNAPSHOT_MODE,
    listenerIsolation: null,
    allowedSections: null,
  };
}

export function PublishShareDeploymentModal({ open }: { open: boolean }) {
  const projectConfig = useProjectState((x) => x.projectConfig);
  const [policyOverrides, setPolicyOverrides] =
    useState<SharePolicyOverridesInput>(createDefaultPolicyOverrides);
  const [listenerEntrypoint, setListenerEntrypoint] = useState("");
  const [listenerEnabled, setListenerEnabled] = useState(true);
  const [listenerIsolation, setListenerIsolation] =
    useState<ListenerIsolationMode>(DEFAULT_LISTENER_ISOLATION);
  const [publishedDeployment, setPublishedDeployment] =
    useState<ShareDeploymentMetadata | null>(null);
  const [recentDeployments, setRecentDeployments] = useState<
    Array<ShareDeploymentMetadata>
  >([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const shareUrl = useMemo(() => {
    if (!publishedDeployment) {
      return null;
    }
    return buildShareUrl(
      publishedDeployment.projectConfigName,
      publishedDeployment.deploymentVersion,
    );
  }, [publishedDeployment]);

  useEffect(() => {
    if (!open) {
      return;
    }
    resetForm();
    void loadRecentDeployments();
  }, [open]);

  async function loadRecentDeployments(): Promise<void> {
    setIsLoadingRecent(true);
    const res = await route_list_share_deployments();
    setIsLoadingRecent(false);
    if (res200(res)) {
      setRecentDeployments(res.data);
      return;
    }
    setRecentDeployments([]);
  }

  function resetForm(): void {
    setPolicyOverrides(createDefaultPolicyOverrides());
    setListenerEntrypoint("");
    setListenerEnabled(true);
    setListenerIsolation(DEFAULT_LISTENER_ISOLATION);
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
    if (projectConfig.id === NULL_PROJECT_CONFIG_ID) {
      setErrorMessage("Select a project config before publishing.");
      return;
    }

    setIsPublishing(true);
    setErrorMessage(null);
    const trimmedEntrypoint = listenerEntrypoint.trim();
    const entrypointValue =
      trimmedEntrypoint.length > 0 ? trimmedEntrypoint : null;
    const payload: PublishShareDeploymentRequestInput = {
      projectConfigId: projectConfig.id,
      sharePolicyOverrides: policyOverrides,
      listenerEntrypoint: entrypointValue,
      listenerEnabled: entrypointValue ? listenerEnabled : false,
      listenerIsolation,
    };

    const res = await route_publish_share_deployment(payload);
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
            description="Allow variant + view mode edits."
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
            label="Structural changes"
            description="Allow creating + deleting sections."
            checked={policyOverrides.allowStructuralChanges}
            onChange={(checked) =>
              setPolicyFlag("allowStructuralChanges", checked)
            }
          />
          <ToggleRow
            label="Run & terminals"
            description="Allow code execution in share mode."
            checked={policyOverrides.allowRun}
            onChange={(checked) => setPolicyFlag("allowRun", checked)}
          />
          <ToggleRow
            label="LLM access"
            description="Enable chat + AI features."
            checked={policyOverrides.allowLLM}
            onChange={(checked) => setPolicyFlag("allowLLM", checked)}
          />
          <ToggleRow
            label="MCP access"
            description="Enable MCP tools when allowed."
            checked={policyOverrides.allowMCP}
            onChange={(checked) => setPolicyFlag("allowMCP", checked)}
          />
          <SelectRow
            label="Run snapshot mode"
            description="How run output should be stored."
            value={policyOverrides.runSnapshotMode ?? DEFAULT_RUN_SNAPSHOT_MODE}
            options={[
              { value: "ephemeral", label: "ephemeral" },
              { value: "always", label: "always" },
            ]}
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
              onChange={(event) => setListenerEntrypoint(event.target.value)}
            />
          </label>
          <ToggleRow
            label="Enable listener"
            description="Only used when an entrypoint is set."
            checked={listenerEnabled}
            onChange={setListenerEnabled}
            disabled={listenerEntrypoint.trim().length === 0}
          />
          <SelectRow
            label="Listener isolation"
            description="Choose shared vs per-viewer runtime."
            value={listenerIsolation}
            options={[
              { value: "per_viewer", label: "per_viewer" },
              { value: "shared", label: "shared" },
            ]}
            onChange={setListenerIsolation}
          />
        </SectionCard>

        <SectionCard title="Deployment" subtitle="Share link + instructions.">
          {!publishedDeployment ? (
            <div className="rounded-md border border-dashed border-setta-200 bg-white/70 px-3 py-2 text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-900/60 dark:text-setta-400">
              Publish to generate a deployment version and share URL.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-xs text-setta-500 dark:text-setta-400">
                Project config
              </div>
              <ShareValueRow
                value={publishedDeployment.projectConfigName}
                onCopy={() => handleCopy(publishedDeployment.projectConfigName)}
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
              setta --port 8001 share --project-config-name{" "}
              {publishedDeployment
                ? publishedDeployment.projectConfigName
                : "<project-config-name>"}{" "}
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
  | "allowStructuralChanges"
  | "allowRun"
  | "allowLLM"
  | "allowMCP";

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
  options: Array<{ value: T; label: string }>;
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
  deployments: Array<ShareDeploymentMetadata>;
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
          const url = buildShareUrl(
            deployment.projectConfigName,
            deployment.deploymentVersion,
          );
          return (
            <div
              key={`${deployment.projectConfigName}-${deployment.deploymentVersion}`}
              className="rounded-md border border-setta-200 bg-white/70 px-3 py-2 text-[11px] text-setta-500 dark:border-setta-700 dark:bg-setta-900/50 dark:text-setta-400"
            >
              <div className="font-mono text-[11px] text-setta-600 dark:text-setta-300">
                {deployment.projectConfigName}/{deployment.deploymentVersion}
              </div>
              <div className="mb-2 truncate text-[10px] text-setta-400 dark:text-setta-500">
                {deployment.deploymentRoot}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="cursor-pointer rounded-full border border-setta-200 px-2 py-1 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                  onClick={() =>
                    onCopy(
                      `${deployment.projectConfigName}/${deployment.deploymentVersion}`,
                    )
                  }
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

function buildShareUrl(
  projectConfigName: string,
  deploymentVersion: string,
): string {
  const sharePath = `/share/${projectConfigName}/${deploymentVersion}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${sharePath}`;
  }
  return sharePath;
}

function extractErrorMessage(
  status: number | undefined,
  data: ShareDeploymentMetadata | undefined,
): string {
  const payload = data as unknown;
  if (payload && typeof payload === "object") {
    const maybeDetail = (payload as { detail?: unknown }).detail;
    if (typeof maybeDetail === "string") {
      return maybeDetail;
    }
  }
  if (status) {
    return `Publish failed with status ${status}.`;
  }
  return "Publish failed. No response from backend.";
}
