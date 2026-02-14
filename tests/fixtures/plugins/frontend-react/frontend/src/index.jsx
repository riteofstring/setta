import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

export const apiVersion = 1;

const SECTION_KIND = "fixture-react-card";
const rootsByMountEl = new WeakMap();

function normalizeSectionData(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      title: "React Fixture",
      details: "React renderer is active.",
      tags: ["react", "fixture"],
      pinned: false,
      pulses: 0,
    };
  }

  const candidate = raw;
  const title =
    typeof candidate.title === "string" && candidate.title.trim() !== ""
      ? candidate.title.trim()
      : "React Fixture";
  const details =
    typeof candidate.details === "string" && candidate.details.trim() !== ""
      ? candidate.details.trim()
      : "React renderer is active.";
  const pinned = Boolean(candidate.pinned);
  const pulses = Number.isFinite(candidate.pulses)
    ? Math.max(0, Math.floor(candidate.pulses))
    : 0;

  const tags = [];
  if (Array.isArray(candidate.tags)) {
    for (const tag of candidate.tags) {
      if (typeof tag !== "string") {
        continue;
      }
      const trimmed = tag.trim();
      if (trimmed === "") {
        continue;
      }
      tags.push(trimmed);
      if (tags.length >= 4) {
        break;
      }
    }
  }

  if (tags.length === 0) {
    tags.push("react", "section");
  }

  return {
    title,
    details,
    tags,
    pinned,
    pulses,
  };
}

function StatItem({ label, value, testId }) {
  return (
    <li className="fixture-react-card__stat">
      <span className="fixture-react-card__stat-key">{label}</span>
      {testId ? (
        <strong className="fixture-react-card__stat-value" data-testid={testId}>
          {String(value)}
        </strong>
      ) : (
        <strong className="fixture-react-card__stat-value">
          {String(value)}
        </strong>
      )}
    </li>
  );
}

function ReactFixtureCard({ props, host }) {
  const sectionData = normalizeSectionData(props.data);
  const [localClicks, setLocalClicks] = useState(0);

  const wordCount = useMemo(() => {
    const text = `${sectionData.title} ${sectionData.details}`.trim();
    if (text === "") {
      return 0;
    }
    return text.split(/\s+/).length;
  }, [sectionData.details, sectionData.title]);

  const pinLabel = sectionData.pinned ? "Pinned" : "Unpinned";

  function onTogglePinned() {
    host.updateSection(props.sectionId, {
      data: {
        ...sectionData,
        pinned: !sectionData.pinned,
      },
    });
  }

  function onSavePulse() {
    host.updateSection(props.sectionId, {
      data: {
        ...sectionData,
        pulses: sectionData.pulses + 1,
      },
    });
  }

  return (
    <article className="fixture-react-card" data-testid="fixture-react-card">
      <header className="fixture-react-card__header">
        <h3 className="fixture-react-card__title">React Fixture Card</h3>
        <span
          className="fixture-react-card__badge"
          data-testid="fixture-react-mode"
        >
          {`mode:${props.serverMode}`}
        </span>
      </header>

      <p
        className="fixture-react-card__body"
        data-testid="fixture-react-details"
      >
        {sectionData.details}
      </p>

      <ul className="fixture-react-card__stats">
        <StatItem label="words" value={wordCount} />
        <StatItem
          label="local clicks"
          value={localClicks}
          testId="fixture-react-local-clicks"
        />
        <StatItem
          label="saved pulses"
          value={sectionData.pulses}
          testId="fixture-react-saved-pulses"
        />
        <StatItem
          label="state"
          value={pinLabel}
          testId="fixture-react-pinned-state"
        />
      </ul>

      <div className="fixture-react-card__controls">
        <button
          type="button"
          className="fixture-react-card__button"
          data-testid="fixture-react-toggle-pin"
          onClick={onTogglePinned}
        >
          {sectionData.pinned ? "Unpin" : "Pin"}
        </button>
        <button
          type="button"
          className="fixture-react-card__button"
          data-testid="fixture-react-save-pulse"
          onClick={onSavePulse}
        >
          Save Pulse
        </button>
        <button
          type="button"
          className="fixture-react-card__button"
          data-testid="fixture-react-local-click"
          onClick={() => setLocalClicks((count) => count + 1)}
        >
          Local Click
        </button>
      </div>

      <ul className="fixture-react-card__tags">
        {sectionData.tags.map((tag) => (
          <li key={tag} className="fixture-react-card__tag">
            {tag}
          </li>
        ))}
      </ul>
    </article>
  );
}

function mountReactCard(mountEl, props, host) {
  const root = createRoot(mountEl);
  rootsByMountEl.set(mountEl, root);
  root.render(<ReactFixtureCard props={props} host={host} />);
}

function updateReactCard(mountEl, props, host) {
  const existingRoot = rootsByMountEl.get(mountEl);
  if (!existingRoot) {
    mountReactCard(mountEl, props, host);
    return;
  }
  existingRoot.render(<ReactFixtureCard props={props} host={host} />);
}

function unmountReactCard(mountEl) {
  const existingRoot = rootsByMountEl.get(mountEl);
  if (!existingRoot) {
    mountEl.innerHTML = "";
    return;
  }
  existingRoot.unmount();
  rootsByMountEl.delete(mountEl);
}

export function register(host) {
  const capabilities = new Set(host.effectiveCapabilities || []);
  if (!capabilities.has("registerSectionKinds")) {
    return;
  }

  host.registerSectionKind({
    kind: SECTION_KIND,
    title: "React Fixture Card",
    description: "Section kind rendered with React component tree.",
    initialData: {
      title: "React Fixture",
      details: "React renderer is active.",
      tags: ["react", "fixture"],
      pinned: false,
      pulses: 0,
    },
    renderer: {
      mount(mountEl, props) {
        mountReactCard(mountEl, props, host);
      },
      update(mountEl, props) {
        updateReactCard(mountEl, props, host);
      },
      unmount(mountEl) {
        unmountReactCard(mountEl);
      },
    },
  });
}
