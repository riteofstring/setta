import type { ArtifactStatus, WorkstreamArtifact } from "@generated/backend";
import { Circle, Maximize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ArtifactCardFigureView } from "../artifacts/ArtifactCardFigures";
import type { ArtifactDocumentCache } from "../artifacts/artifact-document-cache";
import { Button } from "@renderer/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@renderer/components/ui/tooltip";

import { useArtifactDocument, type ArtifactDocumentState } from "./director-artifact-browser";

const artifactStatusLabels = {
  available: "Ready",
  declared: "Setta is still writing this artifact.",
  unresolved: "This artifact has not arrived yet.",
} as const satisfies Record<ArtifactStatus, string>;

/**
 * One artifact's rail card.
 *
 * A card claims what the document holds: its kind, its title, the one line the
 * author wrote to say what it is, and the single most telling thing inside.
 * It is never a shrunken replay of the document's first screen — that replay
 * is what made the rail a column of boxes each showing the top of something.
 *
 * A single click does nothing: the card is not a control. Opening the artifact
 * goes through the explicit expand control, or a double-click on the card as a
 * pointer shortcut for the same action.
 */
export function DirectorArtifactPreviewCard({
  artifact,
  documents,
  isActive,
  isOpening,
  onOpen,
}: {
  artifact: WorkstreamArtifact;
  documents: ArtifactDocumentCache | null;
  isActive: boolean;
  /** True while the browser prepares this artifact's document before opening. */
  isOpening: boolean;
  onOpen: (artifact: WorkstreamArtifact, trigger: HTMLElement) => void;
}) {
  const cardRef = useRef<HTMLElement | null>(null);
  const expandRef = useRef<HTMLButtonElement | null>(null);
  const visible = useRailViewportVisibility(cardRef);
  const document = useArtifactDocument({ artifact, documents, enabled: visible });
  const canOpen = artifact.status === "available" && documents !== null;
  const openLabel = isOpening
    ? `Opening artifact: ${artifact.title}`
    : canOpen
      ? `Open artifact: ${artifact.title}`
      : artifact.status === "declared"
        ? `Artifact is still being written: ${artifact.title}`
        : `Artifact is not available: ${artifact.title}`;

  return (
    <article
      aria-busy={isOpening || undefined}
      className="director-artifact-preview"
      data-artifact-active={isActive ? "true" : "false"}
      data-artifact-id={artifact.id}
      data-artifact-opening={isOpening ? "true" : "false"}
      data-artifact-status={artifact.status}
      data-preview-state={document?.status ?? "idle"}
      onDoubleClick={() => {
        if (canOpen && !isOpening && expandRef.current !== null) {
          onOpen(artifact, expandRef.current);
        }
      }}
      ref={cardRef}
    >
      <header className="director-artifact-preview-header">
        <div className="director-artifact-preview-identity">
          {/*
           * The kicker names the form of the document. It was in the original
           * mockup on every artifact and in the fidelity checklist's card row;
           * production simply never had a field to put there.
           */}
          <p className="director-artifact-preview-kind">{artifact.kind}</p>
          <h3 className="director-artifact-preview-title">{artifact.title}</h3>
        </div>
        <ArtifactExpandControl
          artifact={artifact}
          canOpen={canOpen && !isOpening}
          isOpening={isOpening}
          label={openLabel}
          onOpen={onOpen}
          ref={expandRef}
        />
      </header>
      {/* The card's body is noninteractive and ignores pointer input, so the
          expand control above remains the only way into the full document. Its
          readable content stays in the accessibility tree. */}
      <div className="director-artifact-preview-viewport">
        <DirectorArtifactCardBody artifact={artifact} document={document} />
      </div>
    </article>
  );
}

function ArtifactExpandControl({
  artifact,
  canOpen,
  isOpening,
  label,
  onOpen,
  ref,
}: {
  artifact: WorkstreamArtifact;
  canOpen: boolean;
  /** Shows the shell's loading pulse in place of the expand glyph. */
  isOpening: boolean;
  label: string;
  onOpen: (artifact: WorkstreamArtifact, trigger: HTMLElement) => void;
  ref: React.Ref<HTMLButtonElement>;
}) {
  // Preparing is a pulse, like every in-progress mark in the shell: the glyph
  // swaps for the breathing dot until the document is ready to morph open.
  const glyph = isOpening ? (
    <Circle aria-hidden="true" className="director-pulse" size={13} />
  ) : (
    <Maximize2 aria-hidden="true" />
  );
  const button = (
    <Button
      aria-label={label}
      className="director-artifact-expand size-10"
      disabled={!canOpen}
      onClick={(event) => {
        onOpen(artifact, event.currentTarget);
      }}
      ref={ref}
      size="icon-sm"
      variant="ghost"
    >
      {glyph}
    </Button>
  );
  return (
    <Tooltip>
      {canOpen ? (
        <TooltipTrigger
          render={
            <Button
              aria-label={label}
              className="director-artifact-expand size-10"
              onClick={(event) => {
                onOpen(artifact, event.currentTarget);
              }}
              ref={ref}
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          {glyph}
        </TooltipTrigger>
      ) : (
        <TooltipTrigger render={<span className="director-artifact-tooltip-anchor" />}>
          {button}
        </TooltipTrigger>
      )}
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The card's line and its figures.
 *
 * The line is the artifact's own summary, so it is there the moment the
 * artifact is, without waiting for a read — which is why an unavailable
 * artifact still says what it will be rather than only that it is not here
 * yet. The figures arrive with the document.
 */
function DirectorArtifactCardBody({
  artifact,
  document,
}: {
  artifact: WorkstreamArtifact;
  document: ArtifactDocumentState | null;
}) {
  return (
    <>
      <p className="director-artifact-preview-line">{artifact.summary}</p>
      {artifact.status === "available" ? (
        <DirectorArtifactCardFigures document={document} />
      ) : (
        <p className="director-artifact-preview-status">{directorArtifactCardMetadata(artifact)}</p>
      )}
    </>
  );
}

function DirectorArtifactCardFigures({ document }: { document: ArtifactDocumentState | null }) {
  switch (document?.status) {
    case "ready":
      return <ArtifactCardFigureView figures={document.entry.figures} />;
    case "failed":
      return (
        <p className="director-artifact-preview-status">Setta could not read this artifact.</p>
      );
    default:
      // A card that has said what the artifact is does not also need to
      // announce that its evidence is still loading.
      return null;
  }
}

export function directorArtifactCardMetadata(artifact: WorkstreamArtifact): string {
  return artifactStatusLabels[artifact.status];
}

/**
 * Whether a card is inside the rail's scroll viewport.
 *
 * Only visible previews are read and parsed, and a card that scrolls away
 * releases its rendered blocks again — the bounded document cache keeps the
 * parse, so scrolling back is a re-render rather than a second read.
 */
function useRailViewportVisibility(cardRef: React.RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const card = cardRef.current;
    if (card === null) {
      return;
    }
    if (typeof globalThis.IntersectionObserver !== "function") {
      // Without an observer there is no viewport signal to wait for, so every
      // card in the mounted rail counts as visible.
      setVisible(true);
      return;
    }
    const observer = new globalThis.IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setVisible(entry.isIntersecting);
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(card);
    return () => {
      observer.disconnect();
    };
  }, [cardRef]);
  return visible;
}
