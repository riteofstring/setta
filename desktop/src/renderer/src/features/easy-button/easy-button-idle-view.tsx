const idleHelperText = "Easy Button";

export function EasyButtonIdleView() {
  return (
    <section
      aria-label="Easy Button"
      className="easy-button-surface"
      data-easy-button-state="idle"
      data-testid="easy-button-surface"
    >
      <aside className="easy-button-rail easy-button-rail-left" data-empty="true">
        <div className="easy-button-rail-label" aria-hidden="true">
          Now
        </div>
      </aside>
      <div className="easy-button-stage">
        <div className="easy-button-button-well">
          <div
            aria-hidden="true"
            className="easy-button-idle-button"
            data-testid="easy-button-idle-button"
          >
            <span className="easy-button-idle-mark" />
          </div>
        </div>
        <div className="easy-button-caption-slot">
          <div className="easy-button-helper">{idleHelperText}</div>
        </div>
      </div>
      <aside className="easy-button-rail easy-button-rail-right" data-empty="true">
        <div className="easy-button-rail-label" aria-hidden="true">
          Artifacts
        </div>
      </aside>
    </section>
  );
}
