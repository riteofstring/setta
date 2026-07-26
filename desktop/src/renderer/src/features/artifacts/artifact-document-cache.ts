import type { Artifact, ReadConversationArtifactRequest } from "@generated/backend";

import type { ArtifactPreviewBlock } from "./artifact-preview-blocks";
import { artifactFaultText, reportArtifactDocumentFault } from "./artifact-telemetry";

export type ReadArtifact = (request: ReadConversationArtifactRequest) => Promise<Artifact>;

/** One read artifact with the bounded preview projected from its source. */
export interface ArtifactDocumentEntry {
  readonly artifact: Artifact;
  readonly preview: readonly ArtifactPreviewBlock[];
}

/**
 * The renderer's bounded artifact document cache.
 *
 * A stored artifact is immutable, so its ID is its identity and the entry
 * carries the language, catalog, and source it was read with. The cache exists
 * so a preview that scrolls into the rail, the artifact the reader then opens,
 * and the neighbours prefetched around it are one read and one projection
 * rather than three. It is not a second artifact representation: it holds no
 * more than `limit` entries, survives no runtime change, and answers nothing
 * the production API was not asked for.
 *
 * The parser and the projection load with the first entry. Keeping the dynamic
 * import here is what keeps OpenUI out of the command center's own chunk while
 * still letting the rail hold this loader.
 */
export class ArtifactDocumentCache {
  private readonly entries = new Map<string, ArtifactDocumentEntry>();
  private readonly inFlight = new Map<string, Promise<ArtifactDocumentEntry>>();
  private readonly limit: number;
  private readonly readArtifact: ReadArtifact;

  constructor({ limit = 12, readArtifact }: { limit?: number; readArtifact: ReadArtifact }) {
    this.limit = limit;
    this.readArtifact = readArtifact;
  }

  /** The cached entry for an artifact, without reading or parsing anything. */
  peek(artifactId: string): ArtifactDocumentEntry | undefined {
    const entry = this.entries.get(artifactId);
    if (entry !== undefined) {
      this.touch(artifactId, entry);
    }
    return entry;
  }

  /**
   * Reads and projects one artifact, sharing a read already in flight.
   *
   * Two previews entering the viewport together, or a preview and the overlay
   * that opens on top of it, produce one HTTP read.
   */
  load(request: ReadConversationArtifactRequest): Promise<ArtifactDocumentEntry> {
    const cached = this.peek(request.artifactId);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    const pending = this.inFlight.get(request.artifactId);
    if (pending !== undefined) {
      return pending;
    }
    const read = this.readAndProject(request).finally(() => {
      this.inFlight.delete(request.artifactId);
    });
    this.inFlight.set(request.artifactId, read);
    return read;
  }

  /** Drops every entry. The connected runtime owns which artifacts exist. */
  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  private async readAndProject(
    request: ReadConversationArtifactRequest,
  ): Promise<ArtifactDocumentEntry> {
    const artifact = await this.readArtifact(request);
    const { projectArtifactPreview } = await import("./artifact-preview-projection");
    // The backend accepted this source before it was stored, so the parser
    // disagreeing with the compiler here is not something the reader can act
    // on. The cache is where that fault is observed, so it is where it is
    // reported.
    let preview: readonly ArtifactPreviewBlock[];
    try {
      preview = projectArtifactPreview(artifact.document.source);
    } catch (error) {
      reportArtifactDocumentFault({
        artifactId: artifact.id,
        catalogId: artifact.document.catalogId,
        errors: [artifactFaultText(error)],
        stage: "parse",
      });
      throw error;
    }
    const entry: ArtifactDocumentEntry = { artifact, preview };
    this.touch(request.artifactId, entry);
    return entry;
  }

  private touch(artifactId: string, entry: ArtifactDocumentEntry): void {
    this.entries.delete(artifactId);
    this.entries.set(artifactId, entry);
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) {
        return;
      }
      this.entries.delete(oldest.value);
    }
  }
}
