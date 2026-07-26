import type { WorkstreamArtifact } from "@generated/backend";
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
        void documents.load(neighbour).catch(() => {});
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
  const available = enabled && documents !== null && artifact.status === "available";
  let cached: ArtifactDocumentEntry | undefined;
  let cacheFailed = false;
  if (available) {
    try {
      cached = documents.peek(artifact);
    } catch {
      cacheFailed = true;
    }
  }
  const [requestState, setRequestState] = useState<{
    readonly artifactId: string;
    readonly documents: ArtifactDocumentCache;
    readonly value: ArtifactDocumentState;
  } | null>(null);

  useEffect(() => {
    if (!enabled || documents === null || artifact.status !== "available") {
      return;
    }
    let ready: ArtifactDocumentEntry | undefined;
    try {
      ready = documents.peek(artifact);
    } catch {
      setRequestState({
        artifactId: artifact.id,
        documents,
        value: { status: "failed" },
      });
      return;
    }
    if (ready !== undefined) {
      setRequestState({
        artifactId: artifact.id,
        documents,
        value: { entry: ready, status: "ready" },
      });
      return;
    }
    let current = true;
    setRequestState({
      artifactId: artifact.id,
      documents,
      value: { status: "loading" },
    });
    documents
      .load(artifact)
      .then((entry) => {
        if (current) {
          setRequestState({
            artifactId: artifact.id,
            documents,
            value: { entry, status: "ready" },
          });
        }
      })
      .catch(() => {
        if (current) {
          setRequestState({
            artifactId: artifact.id,
            documents,
            value: { status: "failed" },
          });
        }
      });
    return () => {
      current = false;
    };
  }, [artifact, documents, enabled]);

  if (!available) {
    return null;
  }
  if (cacheFailed) {
    return { status: "failed" };
  }
  // A cache hit always outranks local request state. In particular, moving the
  // persistent Dialog to a prefetched neighbour must never render the prior
  // artifact for one commit while the effect catches up.
  if (cached !== undefined) {
    return { entry: cached, status: "ready" };
  }
  if (
    requestState !== null &&
    requestState.artifactId === artifact.id &&
    requestState.documents === documents
  ) {
    return requestState.value;
  }
  return { status: "loading" };
}
