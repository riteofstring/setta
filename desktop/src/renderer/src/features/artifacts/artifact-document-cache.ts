import type {
  Artifact,
  ReadConversationArtifactRequest,
  WorkstreamArtifact,
} from "@generated/backend";

import type { ArtifactCardFigures } from "./artifact-card-figures";
import { artifactFaultText, reportArtifactDocumentFault } from "./artifact-telemetry";

export type ReadArtifact = (request: ReadConversationArtifactRequest) => Promise<Artifact>;

/** One read artifact with the card figures projected from its source. */
export interface ArtifactDocumentEntry {
  readonly artifact: Artifact;
  readonly figures: ArtifactCardFigures;
}

/**
 * The renderer's bounded artifact document cache.
 *
 * A stored artifact is immutable, so its ID is its identity and the entry
 * carries the language, catalog, and source it was read with. The cache exists
 * so a card that scrolls into the rail, the artifact the reader then opens,
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

  /**
   * The cached entry for a Director artifact, without reading or parsing.
   *
   * The metadata is part of the lookup contract, not just the ID. Director
   * snapshots and artifact reads arrive through different endpoints, so even a
   * prefetched cache hit must prove that it belongs under the identity the rail
   * announced.
   */
  peek(metadata: WorkstreamArtifact): ArtifactDocumentEntry | undefined {
    const entry = this.entries.get(metadata.id);
    if (entry !== undefined) {
      verifyArtifactIdentity(metadata, entry.artifact);
    }
    return entry;
  }

  /**
   * Reads and projects one artifact, sharing a read already in flight.
   *
   * Two cards entering the viewport together, or a card and the overlay
   * that opens on top of it, produce one HTTP read.
   */
  load(metadata: WorkstreamArtifact): Promise<ArtifactDocumentEntry> {
    let cached: ArtifactDocumentEntry | undefined;
    try {
      cached = this.peek(metadata);
    } catch (error) {
      return Promise.reject(error);
    }
    if (cached !== undefined) {
      this.touch(metadata.id, cached);
      return Promise.resolve(cached);
    }
    const pending = this.inFlight.get(metadata.id);
    if (pending !== undefined) {
      // A second caller can carry different metadata for the same ID. Sharing
      // the network read must not share the first caller's identity decision.
      return this.accept(metadata, pending);
    }
    const read = this.readAndProject(artifactReadRequest(metadata)).finally(() => {
      this.inFlight.delete(metadata.id);
    });
    this.inFlight.set(metadata.id, read);
    return this.accept(metadata, read);
  }

  /** Drops every entry. The connected runtime owns which artifacts exist. */
  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  private async readAndProject(
    request: ReadConversationArtifactRequest,
  ): Promise<ArtifactDocumentEntry> {
    // Network/IPC and the projection chunk are independent cold work. Starting
    // them together removes a full serial boundary from the first artifact.
    const [artifact, { projectArtifactCardFigures }] = await Promise.all([
      this.readWithRetry(request),
      import("./artifact-card-projection"),
    ]);
    // The backend accepted this source before it was stored, so the parser
    // disagreeing with the compiler here is not something the reader can act
    // on. The cache is where that fault is observed, so it is where it is
    // reported.
    let figures: ArtifactCardFigures;
    try {
      figures = projectArtifactCardFigures(artifact.document.source);
    } catch (error) {
      reportArtifactDocumentFault({
        artifactId: artifact.id,
        catalogId: artifact.document.catalogId,
        errors: [artifactFaultText(error)],
        stage: "parse",
      });
      throw error;
    }
    return { artifact, figures };
  }

  /**
   * One automatic retry keeps a transient artifact-read failure out of the UI.
   *
   * This retry is deliberately local to the idempotent read. Parse and
   * identity failures are deterministic Setta faults and are never retried.
   */
  private async readWithRetry(request: ReadConversationArtifactRequest): Promise<Artifact> {
    try {
      return await this.readArtifact(request);
    } catch {
      return this.readArtifact(request);
    }
  }

  private async accept(
    metadata: WorkstreamArtifact,
    pending: Promise<ArtifactDocumentEntry>,
  ): Promise<ArtifactDocumentEntry> {
    const entry = await pending;
    verifyArtifactIdentity(metadata, entry.artifact);
    this.touch(metadata.id, entry);
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

function artifactReadRequest(artifact: WorkstreamArtifact): ReadConversationArtifactRequest {
  return {
    artifactId: artifact.id,
    conversationId: artifact.conversationId,
    workspaceId: artifact.workspaceId,
  };
}

/**
 * Holds a read artifact to the Director record that announced it.
 *
 * This check lives at the cache boundary so initial reads, shared in-flight
 * reads, rail reuse, and browser neighbour prefetch all enforce it.
 */
function verifyArtifactIdentity(metadata: WorkstreamArtifact, artifact: Artifact): void {
  if (
    artifact.id === metadata.id &&
    artifact.conversationId === metadata.conversationId &&
    artifact.turnId === metadata.runId &&
    artifact.title === metadata.title &&
    artifact.createdAt === metadata.createdAt
  ) {
    return;
  }
  const error = new Error(
    `Artifact payload ${artifact.id} does not match Director record ${metadata.id}.`,
  );
  reportArtifactDocumentFault({
    artifactId: metadata.id,
    catalogId: artifact.document.catalogId,
    errors: [artifactFaultText(error)],
    stage: "identity",
  });
  throw error;
}
