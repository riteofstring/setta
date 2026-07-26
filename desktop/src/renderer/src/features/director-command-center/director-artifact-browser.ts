import type { Artifact, WorkstreamArtifact } from "@generated/backend";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  ArtifactDocumentCache,
  type ArtifactDocumentEntry,
  type ReadArtifact,
} from "../artifacts/artifact-document-cache";

/**
 * How many artifacts the rail shows, and therefore how many the artifact
 * browser moves through.
 *
 * A conversation snapshot bounds artifact history in the backend; this bounds
 * what the command center mounts for it. The rail order is authoritative, so
 * the browser's previous and next traverse exactly the available artifacts of
 * that same bounded list.
 */
const directorRailArtifactLimit = 8;

export function directorRailArtifacts(
  artifacts: readonly WorkstreamArtifact[],
): readonly WorkstreamArtifact[] {
  return artifacts.slice(0, directorRailArtifactLimit);
}

/** The artifact browser's sequence: the rail's order, available artifacts only. */
function directorBrowsableArtifacts(
  artifacts: readonly WorkstreamArtifact[],
): readonly WorkstreamArtifact[] {
  return directorRailArtifacts(artifacts).filter((artifact) => artifact.status === "available");
}

export type ArtifactDocumentState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly entry: ArtifactDocumentEntry }
  | { readonly status: "failed" };

export interface DirectorArtifactBrowser {
  /** The artifact the browser has open, or null when it is closed. */
  readonly activeArtifact: WorkstreamArtifact | null;
  /** The active artifact's 1-based place in the browsable sequence. */
  readonly activePosition: number;
  readonly browsable: readonly WorkstreamArtifact[];
  readonly close: () => void;
  readonly documents: ArtifactDocumentCache | null;
  readonly open: (artifact: WorkstreamArtifact, trigger: HTMLElement) => void;
  readonly showNext: () => void;
  readonly showPrevious: () => void;
  readonly triggerRef: React.RefObject<HTMLElement | null>;
}

/**
 * The Director's artifact-browser lifecycle.
 *
 * Everything here is local React state owned by the command-center shell: which
 * artifact is active, the bounded document cache the previews and the overlay
 * share, and the control the overlay returns focus to. Nothing is persisted in
 * Go, SQLite, or Zustand, and a runtime change builds a new cache rather than
 * reusing another runtime's documents.
 */
export function useDirectorArtifactBrowser({
  artifacts,
  readArtifact,
  runtimeId,
}: {
  artifacts: readonly WorkstreamArtifact[];
  readArtifact: ReadArtifact | undefined;
  runtimeId: string | null;
}): DirectorArtifactBrowser {
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const browsable = useMemo(() => directorBrowsableArtifacts(artifacts), [artifacts]);
  const documents = useMemo(
    () => (readArtifact === undefined ? null : new ArtifactDocumentCache({ readArtifact })),
    // The cache belongs to one connected runtime. Rebuilding it on a runtime
    // change is what clears it; nothing else may outlive that boundary.
    [readArtifact, runtimeId],
  );
  const activeIndex = browsable.findIndex((artifact) => artifact.id === activeArtifactId);
  const activeArtifact = activeIndex === -1 ? null : (browsable[activeIndex] ?? null);

  // The Director snapshot is authoritative: an artifact that leaves it closes
  // the browser rather than holding a document the snapshot no longer has.
  useEffect(() => {
    if (activeArtifactId !== null && activeIndex === -1) {
      setActiveArtifactId(null);
    }
  }, [activeArtifactId, activeIndex]);

  useEffect(() => {
    setActiveArtifactId(null);
  }, [runtimeId]);

  // Focus returns to the expand control that opened the browser. The Dialog
  // aims at the same element through `finalFocus`; this covers the close paths
  // where the popup is already gone by the time focus moves.
  const wasOpenRef = useRef(false);
  useLayoutEffect(() => {
    const isOpen = activeArtifactId !== null;
    if (wasOpenRef.current && !isOpen) {
      const trigger = triggerRef.current;
      if (trigger !== null && document.contains(trigger)) {
        trigger.focus({ preventScroll: true });
      }
      triggerRef.current = null;
    }
    wasOpenRef.current = isOpen;
  }, [activeArtifactId]);

  // Only the artifacts either side of the active one are read ahead, so moving
  // through the browser is instant without mounting an adjacent document.
  useEffect(() => {
    if (documents === null || activeIndex === -1) {
      return;
    }
    for (const neighbour of [browsable[activeIndex - 1], browsable[activeIndex + 1]]) {
      if (neighbour !== undefined) {
        void documents.load(artifactReadRequest(neighbour)).catch(() => {});
      }
    }
  }, [activeIndex, browsable, documents]);

  const open = useCallback((artifact: WorkstreamArtifact, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setActiveArtifactId(artifact.id);
  }, []);
  const close = useCallback(() => {
    setActiveArtifactId(null);
  }, []);
  const step = useCallback(
    (offset: number) => {
      setActiveArtifactId((current) => {
        const index = browsable.findIndex((artifact) => artifact.id === current);
        return index === -1 ? current : (browsable[index + offset]?.id ?? current);
      });
    },
    [browsable],
  );
  const showPrevious = useCallback(() => step(-1), [step]);
  const showNext = useCallback(() => step(1), [step]);

  return {
    activeArtifact,
    activePosition: activeIndex + 1,
    browsable,
    close,
    documents,
    open,
    showNext,
    showPrevious,
    triggerRef,
  };
}

/**
 * Reads one artifact through the production API and its bounded cache.
 *
 * `enabled` is what makes a preview lazy: a card asks for its document only
 * once it enters the rail viewport, and drops the loaded blocks again when it
 * leaves, keeping the parse in the cache and the DOM off the page.
 */
export function useArtifactDocument({
  artifact,
  documents,
  enabled,
}: {
  artifact: WorkstreamArtifact;
  documents: ArtifactDocumentCache | null;
  enabled: boolean;
}): ArtifactDocumentState | null {
  const cached = enabled && documents !== null ? documents.peek(artifact.id) : undefined;
  const [state, setState] = useState<ArtifactDocumentState | null>(null);

  useEffect(() => {
    if (!enabled || documents === null || artifact.status !== "available") {
      setState(null);
      return;
    }
    const ready = documents.peek(artifact.id);
    if (ready !== undefined) {
      setState({ entry: ready, status: "ready" });
      return;
    }
    let current = true;
    setState({ status: "loading" });
    documents
      .load(artifactReadRequest(artifact))
      .then((entry) => {
        verifyDirectorArtifactPayload(artifact, entry.artifact);
        if (current) {
          setState({ entry, status: "ready" });
        }
      })
      .catch(() => {
        if (current) {
          setState({ status: "failed" });
        }
      });
    return () => {
      current = false;
    };
  }, [artifact, documents, enabled]);

  // A cache hit is answered on the first render rather than after the effect,
  // so reopening an artifact or scrolling a preview back into the rail does not
  // flash a loading state over content Setta already holds.
  if (cached !== undefined && state === null) {
    return { entry: cached, status: "ready" };
  }
  return state;
}

function artifactReadRequest(artifact: WorkstreamArtifact) {
  return {
    artifactId: artifact.id,
    conversationId: artifact.conversationId,
    workspaceId: artifact.workspaceId,
  };
}

/**
 * Holds a read artifact to the Director record that announced it.
 *
 * The two come from different endpoints, so a mismatch means the command center
 * is about to show one artifact under another's identity.
 */
function verifyDirectorArtifactPayload(metadata: WorkstreamArtifact, artifact: Artifact): void {
  if (
    artifact.id !== metadata.id ||
    artifact.conversationId !== metadata.conversationId ||
    artifact.turnId !== metadata.runId ||
    artifact.title !== metadata.title ||
    artifact.createdAt !== metadata.createdAt
  ) {
    throw new Error(`Artifact payload ${artifact.id} does not match its Director record.`);
  }
}
