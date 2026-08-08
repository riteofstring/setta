import { Workspace } from "@setta/workspace/react";
import { useState } from "react";

import { AdapterProofPage } from "./AdapterProofPage.js";

type PlaygroundSection = {
  id: number;
  title: string;
};

export function App() {
  if (new URLSearchParams(window.location.search).has("adapter-proof")) {
    return <AdapterProofPage />;
  }

  return <DefaultPlaygroundPage />;
}

function DefaultPlaygroundPage() {
  const [sections, setSections] = useState<readonly PlaygroundSection[]>([]);
  const [announcement, setAnnouncement] = useState("");

  const addSection = () => {
    const nextNumber = sections.length + 1;
    const nextSection = { id: nextNumber, title: `Sample section ${nextNumber}` };
    setSections((current) => [...current, nextSection]);
    setAnnouncement(`${nextSection.title} added.`);
  };

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <header className="site-header">
        <p className="eyebrow" translate="no">
          @setta/workspace
        </p>
        <h1>Blank-slate workspace</h1>
        <p className="lede">
          A backend-free consumer proving the package boundary before canvas behavior is added.
        </p>
      </header>
      <main id="main-content" tabIndex={-1}>
        <div className="playground-toolbar" aria-label="Playground actions">
          <button type="button" onClick={addSection}>
            Add sample section
          </button>
          <p className="announcement" role="status" aria-live="polite">
            {announcement}
          </p>
        </div>
        <Workspace ariaLabel="Section workspace">
          {sections.length === 0
            ? undefined
            : sections.map((section) => (
                <article className="sample-section" key={section.id}>
                  <h2>{section.title}</h2>
                  <p>Host-rendered content remains outside the package document model.</p>
                </article>
              ))}
        </Workspace>
      </main>
    </>
  );
}
