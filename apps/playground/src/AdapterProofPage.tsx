import { UpstreamAdapterProof } from "@setta/workspace/testing";

export function AdapterProofPage() {
  return (
    <>
      <a className="skip-link" href="#adapter-proof-content">
        Skip to adapter proof
      </a>
      <header className="site-header site-header--compact">
        <p className="eyebrow" translate="no">
          Phase 0 evidence
        </p>
        <h1>Upstream adapter proof</h1>
        <p className="lede">
          Exact-pinned XYFlow and dnd-kit operate behind package-owned geometry, command, and
          interaction boundaries.
        </p>
      </header>
      <main id="adapter-proof-content" tabIndex={-1}>
        <UpstreamAdapterProof />
      </main>
    </>
  );
}
