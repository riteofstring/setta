import { AdapterProofPage } from "./AdapterProofPage.js";
import { CanvasShellPage } from "./CanvasShellPage.js";
import { DefaultPlaygroundPage } from "./DefaultPlaygroundPage.js";
import { NestedFreeformRepresentationProofPage } from "./NestedFreeformRepresentationProofPage.js";
import { StateContractPage } from "./StateContractPage.js";

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

  return (
    <DefaultPlaygroundPage
      readOnly={search.has("read-only")}
      rejectViewportChanges={search.has("reject-viewport")}
    />
  );
}
