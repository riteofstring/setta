import type { NiriBackgroundVariant, NiriGridMode } from "../prototype-types";

const variantClassNames = {
  "aurora-current": "prototype-niri-background--aurora-current",
  "dust-parallax": "prototype-niri-background--dust-parallax",
  "nebula-fold": "prototype-niri-background--nebula-fold",
  "veil-drift": "prototype-niri-background--veil-drift",
} satisfies Record<NiriBackgroundVariant, string>;

export interface NiriBackgroundPrototypeProps {
  active: boolean;
  gridMode: NiriGridMode;
  variant: NiriBackgroundVariant;
}

export function NiriBackgroundPrototype({
  active,
  gridMode,
  variant,
}: NiriBackgroundPrototypeProps) {
  return (
    <div
      className={`prototype-niri-background ${variantClassNames[variant]}`}
      data-active={active ? "true" : "false"}
      data-grid-mode={gridMode}
      data-variant={variant}
    >
      <span aria-hidden="true" className="prototype-niri-background__wash" />
      <span aria-hidden="true" className="prototype-niri-background__field" />
      <span aria-hidden="true" className="prototype-niri-background__accent" />
      <span aria-hidden="true" className="prototype-niri-background__grain" />

      <article aria-hidden="true" className="prototype-niri-workspace">
        <header className="prototype-niri-workspace__topbar">
          <span aria-hidden="true" className="prototype-niri-workspace__mark">
            S
          </span>
          <h2>Setta workspace</h2>
          <p>prototype-gallery</p>
          <span className="prototype-niri-workspace__connection" role="status">
            Connected
          </span>
        </header>

        <nav aria-label="Workspace panes" className="prototype-niri-workspace__rail">
          <ol>
            <li aria-current="page">
              <span>01</span>
              <strong>Renderer</strong>
            </li>
            <li>
              <span>02</span>
              <strong>Activity</strong>
            </li>
            <li>
              <span>03</span>
              <strong>Preview</strong>
            </li>
          </ol>
        </nav>

        <main className="prototype-niri-workspace__panes">
          <section className="prototype-niri-workspace__pane prototype-niri-workspace__pane--editor">
            <header>
              <hgroup>
                <p>desktop / renderer</p>
                <h3>WorkspaceLayoutArea.tsx</h3>
              </hgroup>
              <span>TypeScript</span>
            </header>
            <pre aria-label="Example source code">
              <code>
                <span>export function WorkspaceLayoutArea() &#123;</span>
                <span>  const layout = useWorkspaceLayout();</span>
                <span>  return layout.render();</span>
                <span>&#125;</span>
              </code>
            </pre>
            <footer>
              <span>Ln 128, Col 14</span>
              <span>UTF-8</span>
            </footer>
          </section>

          <aside className="prototype-niri-workspace__pane prototype-niri-workspace__pane--activity">
            <header>
              <hgroup>
                <p>Current run</p>
                <h3>Activity</h3>
              </hgroup>
              <span role="status">In progress</span>
            </header>
            <ol>
              <li data-state="complete">
                <span aria-hidden="true" />
                <span className="prototype-niri-workspace__activity-copy">
                  <strong>Workspace opened</strong>
                  <small>Layout restored</small>
                </span>
                <time>09:41</time>
              </li>
              <li data-state="complete">
                <span aria-hidden="true" />
                <span className="prototype-niri-workspace__activity-copy">
                  <strong>Context reviewed</strong>
                  <small>Files indexed</small>
                </span>
                <time>09:42</time>
              </li>
              <li data-state="active">
                <span aria-hidden="true" />
                <span className="prototype-niri-workspace__activity-copy">
                  <strong>Preview updating</strong>
                  <small>Rendering workspace</small>
                </span>
                <time>Now</time>
              </li>
            </ol>
          </aside>
        </main>

        <footer className="prototype-niri-workspace__statusbar">
          <p>main</p>
          <p>3 panes</p>
          <p>Ready</p>
        </footer>
      </article>
    </div>
  );
}
