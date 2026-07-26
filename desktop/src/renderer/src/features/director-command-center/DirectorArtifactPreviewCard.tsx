import type { ArtifactStatus, WorkstreamArtifact } from "@generated/backend";
import { Maximize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ArtifactPreviewSurface } from "../artifacts/ArtifactPreviewSurface";
import type { ArtifactPreviewBlock } from "../artifacts/artifact-preview-blocks";
import type { ArtifactDocumentCache } from "../artifacts/artifact-document-cache";
import { Button } from "@renderer/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@renderer/components/ui/tooltip";

import { useArtifactDocument, type ArtifactDocumentState } from "./director-artifact-browser";

const artifactStatusLabels = {
  available: "Ready",
  declared: "Declared",
  unresolved: "Pending",
} as const satisfies Record<ArtifactStatus, string>;

/**
 * One artifact's rail preview.
 *
 * The card is a fixed-height surface whatever its artifact contains, so
 * arriving artifacts and finishing reads never move the rail under the reader.
 * A single click does nothing: the card is not a control. Opening the artifact
 * goes through the explicit expand control, or a double-click on the card as a
 * pointer shortcut for the same action.
 */
export function DirectorArtifactPreviewCard({
  artifact,
  documents,
  isActive,
  onOpen,
}: {
  artifact: WorkstreamArtifact;
  documents: ArtifactDocumentCache | null;
  isActive: boolean;
  onOpen: (artifact: WorkstreamArtifact, trigger: HTMLElement) => void;
}) {
  const cardRef = useRef<HTMLElement | null>(null);
  const expandRef = useRef<HTMLButtonElement | null>(null);
  const visible = useRailViewportVisibility(cardRef);
  const document = useArtifactDocument({ artifact, documents, enabled: visible });
  const canOpen = artifact.status === "available" && documents !== null;
  const openLabel = canOpen
    ? `Open artifact: ${artifact.title}`
    : artifact.status === "declared"
      ? `Artifact is still being written: ${artifact.title}`
      : `Artifact is not available: ${artifact.title}`;

  return (
    <article
      className="director-artifact-preview"
      data-artifact-active={isActive ? "true" : "false"}
      data-artifact-id={artifact.id}
      data-artifact-status={artifact.status}
      data-preview-state={document?.status ?? "idle"}
      onDoubleClick={() => {
        if (canOpen && expandRef.current !== null) {
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
          {artifact.status === "available" ? null : (
            <p className="director-artifact-preview-meta">
              {directorArtifactCardMetadata(artifact)}
            </p>
          )}
        </div>
        <ArtifactExpandControl
          artifact={artifact}
          canOpen={canOpen}
          label={openLabel}
          onOpen={onOpen}
          ref={expandRef}
        />
      </header>
      {/* Preview blocks are noninteractive and ignore pointer input, so the
          expand control above remains the only way into the full document.
          Their readable content stays in the accessibility tree. */}
      <div className="director-artifact-preview-viewport">
        <DirectorArtifactPreviewBody artifact={artifact} document={document} />
      </div>
    </article>
  );
}

function ArtifactExpandControl({
  artifact,
  canOpen,
  label,
  onOpen,
  ref,
}: {
  artifact: WorkstreamArtifact;
  canOpen: boolean;
  label: string;
  onOpen: (artifact: WorkstreamArtifact, trigger: HTMLElement) => void;
  ref: React.Ref<HTMLButtonElement>;
}) {
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
      <Maximize2 aria-hidden="true" />
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
          <Maximize2 aria-hidden="true" />
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

function DirectorArtifactPreviewBody({
  artifact,
  document,
}: {
  artifact: WorkstreamArtifact;
  document: ArtifactDocumentState | null;
}) {
  if (artifact.status !== "available") {
    return (
      <p className="director-artifact-preview-status">
        {artifact.status === "declared"
          ? "Setta is still writing this artifact."
          : "This artifact has not arrived yet."}
      </p>
    );
  }
  switch (document?.status) {
    case "ready":
      return <ArtifactPreviewSurface blocks={artifactCardSummary(document.entry.preview)} />;
    case "failed":
      return (
        <p className="director-artifact-preview-status">Setta could not read this artifact.</p>
      );
    default:
      return <p className="director-artifact-preview-status">Loading preview.</p>;
  }
}

export function directorArtifactCardMetadata(artifact: WorkstreamArtifact): string {
  return artifactStatusLabels[artifact.status];
}

/**
 * What a card shows of its artifact.
 *
 * The projection is the document's opening in order, which on a card became a
 * shrunken replay of the first screen: the title again, the first sentence
 * again, then a hard clip mid-word. A card is not a small window onto the
 * document — it is a claim about what the document holds.
 *
 * So the body is chosen: one line of prose to say what it is, and the most
 * telling structural block to say what shape it takes. Headings are dropped
 * throughout, because the card's own title already names it.
 */
export function artifactCardSummary(
  blocks: readonly ArtifactPreviewBlock[],
): readonly ArtifactPreviewBlock[] {
  const prose = blocks.find((block) => block.kind === "text");
  const structure = mostTellingArtifactBlock(blocks);
  const chosen = [prose, ...(structure ?? [])].filter((block) => block !== undefined);
  // An artifact made only of headings still has to show something.
  return chosen.length > 0 ? chosen : blocks.slice(0, 1);
}

/**
 * Ranked by how much a glance gets from it: a chart shows the shape of the
 * data, numbers show the headline, a table shows structure, a file names what
 * was produced. Prose is handled separately and code is last, because a card is
 * too small to read code in.
 */
const artifactCardStructureRank = ["chart", "metric", "table", "file", "code"] as const;

function mostTellingArtifactBlock(
  blocks: readonly ArtifactPreviewBlock[],
): readonly ArtifactPreviewBlock[] | null {
  for (const kind of artifactCardStructureRank) {
    const matching = blocks.filter((block) => block.kind === kind);
    if (matching.length === 0) {
      continue;
    }
    // Numbers are a row and read as a set; everything else stands alone.
    return kind === "metric" ? matching.slice(0, 3) : matching.slice(0, 1);
  }
  return null;
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
