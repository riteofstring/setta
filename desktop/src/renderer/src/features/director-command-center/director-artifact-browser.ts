import type { WorkstreamArtifact } from "@generated/backend";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  ArtifactDocumentCache,
  type ArtifactDocumentEntry,
  type ReadArtifact,
} from "../artifacts/artifact-document-cache";
import { prepareArtifactBrowserUi } from "./artifact-browser-loader";

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

type ArtifactDocumentRequestState = {
  readonly artifactId: string;
  readonly documents: ArtifactDocumentCache;
  readonly value: ArtifactDocumentState;
} | null;

type ArtifactCacheLookup =
  | { readonly status: "failed" }
  | { readonly status: "miss" }
  | { readonly entry: ArtifactDocumentEntry; readonly status: "ready" };

export interface DirectorArtifactBrowser {
  /** The artifact the browser has open, or null when it is closed. */
  readonly activeArtifact: WorkstreamArtifact | null;
  /** The active artifact's 1-based place in the browsable sequence. */
  readonly activePosition: number;
  readonly browsable: readonly WorkstreamArtifact[];
  readonly close: () => void;
  readonly documents: ArtifactDocumentCache | null;
  readonly open: (artifact: WorkstreamArtifact, trigger: HTMLElement) => void;
  /** Warms one document and the heavy renderer before an explicit open. */
  readonly prepare: (artifact: WorkstreamArtifact) => void;
  /** The artifact whose document is currently being prepared. */
  readonly pendingArtifactId: string | null;
  readonly showNext: () => void;
  readonly showPrevious: () => void;
}

function currentArtifactBrowserTrigger(
  trigger: HTMLElement | null,
  artifactId: string | null,
): HTMLElement | null {
  if (trigger === null) {
    return null;
  }
  const ownerDocument = trigger.ownerDocument;
  if (ownerDocument.contains(trigger)) {
    return trigger;
  }
  if (artifactId === null || !trigger.classList.contains("director-artifact-expand")) {
    return null;
  }
  return ownerDocument.querySelector<HTMLElement>(
    `.director-artifact-preview[data-artifact-id="${CSS.escape(artifactId)}"] .director-artifact-expand`,
  );
}

/**
 * The Director's artifact-browser lifecycle.
 *
 * Everything here is local React state owned by the command-center shell: which
 * artifact is active, the bounded document cache the previews and the reading
 * surface share, along with the control the surface returns focus to. Nothing is
 * persisted in Go, SQLite, or Zustand, and a runtime change builds a new cache
 * rather than reusing another runtime's documents.
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
  const [pendingArtifactId, setPendingArtifactId] = useState<string | null>(null);
  const openEpochRef = useRef(0);
  const triggerRef = useRef<HTMLElement | null>(null);
  const triggerArtifactIdRef = useRef<string | null>(null);
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
    openEpochRef.current += 1;
    setPendingArtifactId(null);
    setActiveArtifactId(null);
  }, [documents, runtimeId]);

  // Focus returns to the expand control that opened this application surface.
  const wasOpenRef = useRef(false);
  useLayoutEffect(() => {
    const isOpen = activeArtifactId !== null;
    if (wasOpenRef.current && !isOpen) {
      const trigger = currentArtifactBrowserTrigger(
        triggerRef.current,
        triggerArtifactIdRef.current,
      );
      if (trigger !== null) {
        trigger.focus({ preventScroll: true });
      }
      triggerRef.current = null;
      triggerArtifactIdRef.current = null;
    }
    wasOpenRef.current = isOpen;
  }, [activeArtifactId]);

  const prepareArtifact = useCallback(
    async (artifact: WorkstreamArtifact): Promise<void> => {
      const documentReady =
        documents === null || lookupArtifactDocument(documents, artifact).status !== "miss"
          ? Promise.resolve()
          : documents.load(artifact).then(
              () => undefined,
              () => undefined,
            );
      await Promise.all([documentReady, prepareArtifactBrowserUi()]);
    },
    [documents],
  );
  const prepare = useCallback(
    (artifact: WorkstreamArtifact): void => {
      void prepareArtifact(artifact).catch(() => undefined);
    },
    [prepareArtifact],
  );

  // The latest available artifact is the rail's primary action. Start its one
  // bounded read immediately rather than waiting for IntersectionObserver's
  // first callback; the cache deduplicates the visible card's own request.
  useEffect(() => {
    const latest = browsable[0];
    if (latest !== undefined) {
      prepare(latest);
    }
  }, [browsable, prepare]);

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

  /*
   * The browser shell activates immediately from snapshot metadata. Its title
   * and controls therefore respond in the click frame while the document read
   * and heavyweight renderer finish behind the already-open surface. Loading
   * adds no placeholder surface or copy; the actual document fades in when ready.
   */
  const prepareAndActivate = useCallback(
    (artifact: WorkstreamArtifact): void => {
      openEpochRef.current += 1;
      const epoch = openEpochRef.current;
      setPendingArtifactId(artifact.id);
      const settle = (): void => {
        if (openEpochRef.current !== epoch) {
          return;
        }
        setPendingArtifactId(null);
      };
      setActiveArtifactId(artifact.id);
      void prepareArtifact(artifact).then(settle, settle);
    },
    [prepareArtifact],
  );
  const open = useCallback(
    (artifact: WorkstreamArtifact, trigger: HTMLElement) => {
      triggerRef.current = trigger;
      triggerArtifactIdRef.current = artifact.id;
      prepareAndActivate(artifact);
    },
    [prepareAndActivate],
  );
  const close = useCallback(() => {
    openEpochRef.current += 1;
    setPendingArtifactId(null);
    setActiveArtifactId(null);
  }, []);
  const step = useCallback(
    (offset: number) => {
      const artifact = browsable[activeIndex + offset];
      if (artifact !== undefined) {
        prepareAndActivate(artifact);
      }
    },
    [activeIndex, browsable, prepareAndActivate],
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
    pendingArtifactId,
    prepare,
    showNext,
    showPrevious,
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
  const available = artifactDocumentIsAvailable(enabled, documents, artifact);
  const cached = available
    ? lookupArtifactDocument(documents, artifact)
    : { status: "miss" as const };
  const [requestState, setRequestState] = useState<ArtifactDocumentRequestState>(null);

  useEffect(() => {
    if (!artifactDocumentIsAvailable(enabled, documents, artifact)) {
      return;
    }
    return requestArtifactDocument(artifact, documents, setRequestState);
  }, [artifact, documents, enabled]);

  return resolveArtifactDocumentState(available, cached, requestState, artifact, documents);
}

function artifactDocumentIsAvailable(
  enabled: boolean,
  documents: ArtifactDocumentCache | null,
  artifact: WorkstreamArtifact,
): documents is ArtifactDocumentCache {
  return enabled && documents !== null && artifact.status === "available";
}

function lookupArtifactDocument(
  documents: ArtifactDocumentCache,
  artifact: WorkstreamArtifact,
): ArtifactCacheLookup {
  try {
    const entry = documents.peek(artifact);
    return entry === undefined ? { status: "miss" } : { entry, status: "ready" };
  } catch {
    return { status: "failed" };
  }
}

function requestArtifactDocument(
  artifact: WorkstreamArtifact,
  documents: ArtifactDocumentCache,
  setRequestState: Dispatch<SetStateAction<ArtifactDocumentRequestState>>,
): () => void {
  const cached = lookupArtifactDocument(documents, artifact);
  if (cached.status === "failed") {
    setArtifactRequestState(setRequestState, artifact, documents, { status: "failed" });
    return () => {};
  }
  if (cached.status === "ready") {
    setArtifactRequestState(setRequestState, artifact, documents, {
      entry: cached.entry,
      status: "ready",
    });
    return () => {};
  }
  let current = true;
  setArtifactRequestState(setRequestState, artifact, documents, { status: "loading" });
  documents
    .load(artifact)
    .then((entry) => {
      if (current) {
        setArtifactRequestState(setRequestState, artifact, documents, { entry, status: "ready" });
      }
    })
    .catch(() => {
      if (current) {
        setArtifactRequestState(setRequestState, artifact, documents, { status: "failed" });
      }
    });
  return () => {
    current = false;
  };
}

function setArtifactRequestState(
  setRequestState: Dispatch<SetStateAction<ArtifactDocumentRequestState>>,
  artifact: WorkstreamArtifact,
  documents: ArtifactDocumentCache,
  value: ArtifactDocumentState,
): void {
  setRequestState({ artifactId: artifact.id, documents, value });
}

function resolveArtifactDocumentState(
  available: boolean,
  cached: ArtifactCacheLookup,
  requestState: ArtifactDocumentRequestState,
  artifact: WorkstreamArtifact,
  documents: ArtifactDocumentCache | null,
): ArtifactDocumentState | null {
  if (!available) {
    return null;
  }
  if (cached.status === "failed") {
    return { status: "failed" };
  }
  // A cache hit always outranks local request state. In particular, moving the
  // persistent reading surface to a prefetched neighbour must never render the prior
  // artifact for one commit while the effect catches up.
  if (cached.status === "ready") {
    return { entry: cached.entry, status: "ready" };
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
