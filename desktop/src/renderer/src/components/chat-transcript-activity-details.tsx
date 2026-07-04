import type { RunActivityDetailsProjection } from "@generated/backend";

import { cn } from "../lib/utils";

export function ActivityCommandExecutionDetails({
  details,
}: {
  details: RunActivityDetailsProjection;
}) {
  const command = details.commandExecution;
  if (command === null) {
    return null;
  }
  return (
    <>
      <ActivityTextBlock title="Result" value={command.result} />
      <ActivityTextBlock title="Error" tone="error" value={command.error} />
    </>
  );
}

export function ActivityCommandStartFailureDetails({
  details,
}: {
  details: RunActivityDetailsProjection;
}) {
  const failure = details.commandStartFailure;
  if (failure === null) {
    return null;
  }
  return (
    <>
      <ActivityTextBlock title="Message" tone="error" value={failure.message} />
      <ActivityTextBlock title="Failure Class" value={failure.failureClass} />
      <ActivityTextBlock title="OS Error" value={failure.osError} />
      <ActivityTextBlock title="Provider Error" value={failure.providerErrorId} />
      <ActivityTextBlock title="Sandbox" value={failure.sandbox} />
      <ActivityTextBlock title="Approval Policy" value={failure.approvalPolicy} />
      <ActivityTextBlock title="Source" value={failure.source ?? ""} />
    </>
  );
}

export function ActivityFileChangeDetails({ details }: { details: RunActivityDetailsProjection }) {
  const fileChange = details.fileChange;
  if (fileChange === null) {
    return null;
  }
  const stats =
    fileChange.additions > 0 || fileChange.deletions > 0
      ? `+${fileChange.additions} -${fileChange.deletions}`
      : "";
  return (
    <>
      <ActivityTextBlock title="Patch Status" value={fileChange.patchStatus} />
      <ActivityTextBlock title="Stats" value={stats} />
      {fileChange.paths.map((path, index) => (
        <ActivityFileChangePathDetails index={index} key={`${path.path}:${index}`} path={path} />
      ))}
    </>
  );
}

function ActivityFileChangePathDetails({
  index,
  path,
}: {
  index: number;
  path: NonNullable<RunActivityDetailsProjection["fileChange"]>["paths"][number];
}) {
  const title = `File ${index + 1}`;
  const operation = path.operation === null ? "" : path.operation;
  const stats =
    path.additions > 0 || path.deletions > 0 ? `+${path.additions} -${path.deletions}` : "";
  const summary = [operation, path.movePath === "" ? "" : `from ${path.movePath}`, path.path, stats]
    .filter((value) => value !== "")
    .join(" ");
  return (
    <>
      <ActivityTextBlock monospace title={title} value={summary} />
      <ActivityPreBlock
        title={path.patchTruncated ? "Patch Snippet" : "Patch"}
        value={path.patch}
      />
    </>
  );
}

export function ActivityTextBlock({
  monospace = false,
  title,
  tone = "normal",
  value,
}: {
  monospace?: boolean;
  title: string;
  tone?: "error" | "normal";
  value: string;
}) {
  if (!value) {
    return null;
  }
  return (
    <section
      className="min-w-0"
      data-activity-detail-section={title}
      data-activity-detail-kind="text"
    >
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase">{title}</h4>
      <div
        className={cn(
          "mt-0.5 max-w-full break-words text-muted-foreground [overflow-wrap:anywhere]",
          monospace && "font-mono break-all",
          tone === "error" && "font-medium text-status-critical",
        )}
      >
        {value}
      </div>
    </section>
  );
}

export function ActivityPreBlock({ title, value }: { title: string; value: string }) {
  if (!value) {
    return null;
  }
  return (
    <section
      className="min-w-0"
      data-activity-detail-section={title}
      data-activity-detail-kind="pre"
    >
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase">{title}</h4>
      <pre className={activityPreBlockClassName}>{value}</pre>
    </section>
  );
}

export const activityPreBlockClassName =
  "mt-1 max-h-32 w-full max-w-full min-w-0 overflow-x-hidden overflow-y-auto rounded-sm border border-border bg-popover p-2 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]";

export function ActivityJSONDetails({ details }: { details: unknown }) {
  return <ActivityJSONBlock details={details} title="Details" />;
}

export function ActivityMCPDetails({ details }: { details: RunActivityDetailsProjection }) {
  const mcp = details.mcpToolCall;
  if (mcp === null) {
    return null;
  }
  return (
    <>
      <ActivityTextBlock title="Progress" value={mcp.progress} />
      <ActivityTextBlock title="Result" value={mcp.resultSummary} />
      <ActivityTextBlock title="Error" tone="error" value={mcp.error} />
      <ActivityTextBlock title="Duration" value={mcp.durationMs > 0 ? `${mcp.durationMs}ms` : ""} />
      <ActivityJSONBlock details={mcp.arguments} title="Arguments" />
      <ActivityJSONBlock details={mcp.appContext} title="App Context" />
      {mcp.result === null ? null : (
        <>
          <ActivityJSONBlock details={mcp.result.content} title="Content" />
          <ActivityJSONBlock details={mcp.result.structuredContent} title="Structured Content" />
          <ActivityJSONBlock details={mcp.result._meta} title="Metadata" />
        </>
      )}
    </>
  );
}

export function ActivityDynamicToolDetails({ details }: { details: RunActivityDetailsProjection }) {
  const tool = details.dynamicToolCall;
  if (tool === null) {
    return null;
  }
  return (
    <>
      <ActivityTextBlock title="Description" value={tool.description} />
      <ActivityTextBlock title="Result" value={tool.resultSummary} />
      <ActivityTextBlock title="Error" tone="error" value={tool.error} />
      <ActivityTextBlock
        title="Duration"
        value={tool.durationMs > 0 ? `${tool.durationMs}ms` : ""}
      />
      <ActivityJSONBlock details={tool.arguments} title="Arguments" />
      {tool.result === null ? null : (
        <>
          <ActivityTextBlock title="Success" value={dynamicToolSuccessText(tool.result.success)} />
          <ActivityJSONBlock details={tool.result.contentItems} title="Content" />
        </>
      )}
    </>
  );
}

export function ActivityApprovalDetails({ details }: { details: RunActivityDetailsProjection }) {
  const approval = details.approval;
  if (approval === null) {
    return null;
  }
  return (
    <>
      <ActivityTextBlock title="Approval" value={approval.approvalId} />
      <ActivityTextBlock title="Request" value={approval.providerRequestId} />
      <ActivityTextBlock title="Review" value={approval.reviewId} />
      <ActivityTextBlock title="Body" value={approval.body} />
      <ActivityTextBlock title="Kind" value={approval.approvalKind ?? ""} />
      <ActivityTextBlock title="Status" value={approval.approvalStatus ?? approval.reviewStatus} />
      <ActivityTextBlock title="Command" monospace value={approval.command} />
      <ActivityTextBlock title="Cwd" monospace value={approval.cwd} />
      <ActivityTextBlock title="File" monospace value={approval.filePath} />
      <ActivityTextBlock title="Permission" value={approval.permission} />
      <ActivityTextBlock title="Question" value={approval.question} />
      <ActivityPreBlock title="Options" value={approval.options.join("\n")} />
      <ActivityJSONBlock details={approval.questions} title="Questions" />
      {approval.structuredInput === null ? null : (
        <>
          <ActivityTextBlock title="Server" value={approval.structuredInput.serverName} />
          <ActivityTextBlock title="Mode" value={approval.structuredInput.mode} />
          <ActivityTextBlock title="Message" value={approval.structuredInput.message} />
          <ActivityTextBlock title="URL" monospace value={approval.structuredInput.url} />
          <ActivityJSONBlock details={approval.structuredInput.schema} title="Schema" />
          <ActivityJSONBlock details={approval.structuredInput.meta} title="Metadata" />
        </>
      )}
      <ActivityTextBlock title="Action" value={approval.actionType} />
      <ActivityJSONBlock details={approval.review} title="Review" />
      <ActivityJSONBlock details={approval.action} title="Action Details" />
    </>
  );
}

export function ActivityProviderStreamLifecycleDetails({
  details,
}: {
  details: RunActivityDetailsProjection;
}) {
  const lifecycle = details.providerStreamLifecycle;
  if (lifecycle === null) {
    return null;
  }
  return (
    <>
      <ActivityTextBlock
        title="Message"
        tone={lifecycle.willRetry ? "normal" : "error"}
        value={lifecycle.message}
      />
      <ActivityTextBlock title="Additional Details" value={lifecycle.additionalDetails} />
      <ActivityTextBlock title="Codex Error" value={lifecycle.codexErrorKind} />
      <ActivityTextBlock title="Will Retry" value={String(lifecycle.willRetry)} />
      <ActivityTextBlock title="Stream Failure" value={String(lifecycle.streamFailure)} />
      <ActivityTextBlock
        title="Liveness"
        value={`${lifecycle.livenessStatus} / ${lifecycle.livenessReason}`}
      />
      <ActivityTextBlock title="Thread" monospace value={lifecycle.providerThreadId} />
      <ActivityTextBlock title="Turn" monospace value={lifecycle.providerTurnId} />
      <ActivityJSONBlock details={lifecycle.codexErrorInfo} title="Codex Error Info" />
    </>
  );
}

function dynamicToolSuccessText(success: boolean | null) {
  if (success === null) {
    return "";
  }
  return String(success);
}

function ActivityJSONBlock({ details, title }: { details: unknown; title: string }) {
  const text = activityDetailsText(details);
  if (!text) {
    return null;
  }
  return <ActivityPreBlock title={title} value={boundedActivityDetailsText(text)} />;
}

const activityDetailsTextLimit = 4000;

function activityDetailsText(details: unknown) {
  if (details === null || details === undefined) {
    return "";
  }
  if (Array.isArray(details) && details.length === 0) {
    return "";
  }
  if (isRecord(details) && Object.keys(details).length === 0) {
    return "";
  }
  return JSON.stringify(details, null, 2);
}

function boundedActivityDetailsText(text: string) {
  if (text.length <= activityDetailsTextLimit) {
    return text;
  }
  return `${text.slice(0, activityDetailsTextLimit)}...`;
}

export function ActivityExit({ durationMs, exitCode }: { durationMs: number; exitCode: number }) {
  if (exitCode <= 0 && durationMs <= 0) {
    return null;
  }
  return (
    <ActivityTextBlock
      title="Exit"
      value={`${exitCode > 0 ? `exit ${exitCode}` : "exit 0"}${durationMs > 0 ? ` / ${durationMs}ms` : ""}`}
    />
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
