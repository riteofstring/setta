import { AdapterProofPage } from "./AdapterProofPage.js";
import { CanvasShellPage } from "./CanvasShellPage.js";
import { CullingProfilePage } from "./CullingProfilePage.js";
import { DefaultPlaygroundPage } from "./DefaultPlaygroundPage.js";
import { NestedFreeformRepresentationProofPage } from "./NestedFreeformRepresentationProofPage.js";
import { StateContractPage } from "./StateContractPage.js";
import { VisualMatrixPage } from "./VisualMatrixPage.js";

export function App() {
  const search = new URLSearchParams(window.location.search);
  if (search.has("adapter-proof")) {
    return <AdapterProofPage />;
  }
  if (search.has("nested-freeform-proof")) {
    return <NestedFreeformRepresentationProofPage />;
  }
  if (search.has("state-contract")) {
    return <StateContractPage />;
  }
  if (search.has("canvas-shell")) {
    return <CanvasShellPage />;
  }
  if (search.has("visual-matrix")) {
    return <VisualMatrixPage />;
  }
  if (search.has("culling-profile")) {
    return <CullingProfilePage />;
  }

  return (
    <DefaultPlaygroundPage
      proveDetachmentRendererIdentity={search.has("detachment-renderer-proof")}
      readOnly={search.has("read-only")}
      rejectViewportChanges={search.has("reject-viewport")}
    />
  );
}
