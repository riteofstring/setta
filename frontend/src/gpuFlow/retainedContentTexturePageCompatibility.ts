import { evaluateRetainedRegionCompatibility } from "./retainedCommittedCoverageStore";
import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
import type { RetainedContentTexturePageReplacementDescriptor } from "./retainedContentTexturePageManagerTypes";
import type { CommittedRetainedTexturePage } from "./retainedTexturePages";

export function isCommittedRetainedPageCompatibleWithReplacementTarget({
  committedPage,
  replacementDescriptor,
}: {
  readonly committedPage: CommittedRetainedTexturePage<RetainedContentTextureResources>;
  readonly replacementDescriptor: Pick<
    RetainedContentTexturePageReplacementDescriptor,
    "descriptor" | "replacementRequest"
  >;
}): boolean {
  const compatibility = evaluateRetainedRegionCompatibility({
    candidate: {
      clipRect: committedPage.clipRect,
      contentRect: committedPage.contentRect,
      contentToTexture: committedPage.contentToTextureTransform,
      fidelity: committedPage.fidelityMetadata,
      manifest: committedPage.manifest,
    },
    target: replacementDescriptor.replacementRequest.target,
  });
  return compatibility.kind === "compatible";
}
