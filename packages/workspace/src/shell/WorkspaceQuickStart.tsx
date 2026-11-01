import { useState } from "react";
import { LuCompass } from "react-icons/lu";
import { fitWorkspaceSections } from "../attention/workspaceSectionAttention.js";
import { isWorkspaceSectionVisible } from "../document/savedViewDisplay.js";
import { getWorkspaceDocumentStore } from "../document/stores.js";
import { useWorkspaceDocumentSnapshot } from "../document/useWorkspaceDocumentSnapshot.js";
import { activateWorkspaceSavedView } from "../saved-views/operations.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import type { WorkspaceShellTabIconProps } from "./workspaceShellTypes.js";

export type WorkspaceQuickStartStep = Readonly<{
  title: string;
  description: string;
  actionLabel: string;
  sectionId: string;
  viewId?: string;
}>;

export type WorkspaceQuickStartProps = Readonly<{
  title: string;
  description: string;
  steps: ReadonlyArray<WorkspaceQuickStartStep>;
  tip: string;
  onNavigate?: () => void;
}>;

export function WorkspaceQuickStartIcon(props: WorkspaceShellTabIconProps) {
  return <LuCompass {...props} />;
}

export function WorkspaceQuickStart({
  title,
  description,
  steps,
  tip,
  onNavigate,
}: WorkspaceQuickStartProps) {
  const host = useWorkspaceHost();
  const document = useWorkspaceDocumentSnapshot();
  const [notice, setNotice] = useState("");
  const navigate = (step: WorkspaceQuickStartStep) => {
    const current = getWorkspaceDocumentStore(host).getState();
    if (step.viewId && current.savedViews?.views[step.viewId]) {
      activateWorkspaceSavedView(host, step.viewId);
    }
    const next = getWorkspaceDocumentStore(host).getState();
    if (
      !next.sections[step.sectionId] ||
      !isWorkspaceSectionVisible(next, step.sectionId)
    ) {
      setNotice(
        "This section is hidden or has been removed. Use Outline or Saved Views to explore your current workspace.",
      );
      return;
    }
    setNotice("");
    onNavigate?.();
    setTimeout(() => void fitWorkspaceSections(host, [step.sectionId]), 0);
  };
  return (
    <section
      aria-label="Playground guide"
      className="setta-workspace-quick-start"
    >
      <span className="setta-workspace-quick-start-eyebrow">
        PLAY · LEARN · MAKE IT YOURS
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      <ol>
        {steps.map((step) => (
          <li key={step.sectionId}>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
            <button
              disabled={!document.sections[step.sectionId]}
              onClick={() => navigate(step)}
              type="button"
            >
              {step.actionLabel} <span aria-hidden="true">↗</span>
            </button>
            {!document.sections[step.sectionId] ? (
              <small>
                This section was removed. Your other experiments are still
                available.
              </small>
            ) : null}
          </li>
        ))}
      </ol>
      {notice ? <p role="status">{notice}</p> : null}
      <aside>{tip}</aside>
      <details>
        <summary>Moving around</summary>
        <p>
          Scroll to pan and pinch to zoom. Outline lists your sections; select
          one to find it. Drag a section header to rearrange it. Reopen this
          guide with Start here in the left sidebar.
        </p>
      </details>
    </section>
  );
}
