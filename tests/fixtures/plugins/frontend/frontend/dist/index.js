export const apiVersion = 1;

const CARD_THEME_NAMES = ["sunrise", "ocean", "forest"];
const PANE_NOTE_STORAGE_KEY = "setta-fixture-frontend:pane-note";
const cardStateBySectionId = new Map();

function getCardText(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "fixture-default";
  }
  if (typeof data.text === "string" && data.text.trim() !== "") {
    return data.text.trim();
  }
  return "fixture-default";
}

function getCardTags(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return [];
  }
  if (!Array.isArray(data.tags)) {
    return [];
  }
  const normalizedTags = [];
  for (const rawTag of data.tags) {
    if (typeof rawTag !== "string") {
      continue;
    }
    const trimmedTag = rawTag.trim();
    if (trimmedTag === "") {
      continue;
    }
    normalizedTags.push(trimmedTag);
    if (normalizedTags.length >= 4) {
      break;
    }
  }
  return normalizedTags;
}

function incrementRenderMetrics(sectionId) {
  const scope = window;
  const total = Number(scope.__settaFixtureRenderCount || 0);
  scope.__settaFixtureRenderCount = total + 1;

  const bySection = scope.__settaFixtureRenderBySectionId || {};
  const current = Number(bySection[sectionId] || 0);
  bySection[sectionId] = current + 1;
  scope.__settaFixtureRenderBySectionId = bySection;
}

function getRenderCountForSection(sectionId) {
  const scope = window;
  if (!scope.__settaFixtureRenderBySectionId) {
    return 0;
  }
  return Number(scope.__settaFixtureRenderBySectionId[sectionId] || 0);
}

function getCardState(sectionId) {
  let state = cardStateBySectionId.get(sectionId);
  if (!state) {
    state = {
      signalScore: 0,
      themeIndex: 0,
      showDetails: true,
    };
    cardStateBySectionId.set(sectionId, state);
  }
  return state;
}

function createStatItem(label, value, testId) {
  const item = document.createElement("li");
  item.className = "fixture-plugin-card__stat";

  const key = document.createElement("span");
  key.className = "fixture-plugin-card__stat-key";
  key.textContent = label;

  const val = document.createElement("strong");
  val.className = "fixture-plugin-card__stat-value";
  val.textContent = String(value);
  if (typeof testId === "string" && testId !== "") {
    val.setAttribute("data-testid", testId);
  }

  item.appendChild(key);
  item.appendChild(val);
  return item;
}

function createChip(label) {
  const chip = document.createElement("li");
  chip.className = "fixture-plugin-card__chip";
  chip.textContent = label;
  return chip;
}

function normalizeWords(text) {
  const trimmed = text.trim();
  if (trimmed === "") {
    return [];
  }
  return trimmed.split(/\s+/);
}

function createButton(label, testId, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "fixture-plugin-card__button";
  button.setAttribute("data-testid", testId);
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderCard(el, props) {
  const sectionId =
    props && typeof props.sectionId === "string" ? props.sectionId : "unknown";
  incrementRenderMetrics(sectionId);
  const state = getCardState(sectionId);
  const cardText = getCardText(props.data);
  const tags = getCardTags(props.data);
  const words = normalizeWords(cardText);
  const estimatedReadingSeconds = Math.max(1, Math.round(words.length / 3));
  const sectionRenderCount = getRenderCountForSection(sectionId);
  const themeName = CARD_THEME_NAMES[state.themeIndex % CARD_THEME_NAMES.length];

  el.innerHTML = "";
  const card = document.createElement("section");
  card.setAttribute("data-testid", "fixture-plugin-card");
  card.className = `fixture-plugin-card fixture-plugin-card--theme-${themeName}`;

  const header = document.createElement("header");
  header.className = "fixture-plugin-card__header";

  const heading = document.createElement("h3");
  heading.className = "fixture-plugin-card__title";
  heading.textContent = "Fixture Plugin Card";

  const subtitle = document.createElement("p");
  subtitle.className = "fixture-plugin-card__subtitle";
  subtitle.setAttribute("data-testid", "fixture-card-theme-label");
  subtitle.textContent = `section:${sectionId} theme:${themeName}`;

  header.appendChild(heading);
  header.appendChild(subtitle);
  card.appendChild(header);

  const body = document.createElement("p");
  body.className = "fixture-plugin-card__body";
  body.textContent = `fixture:${cardText}`;
  card.appendChild(body);

  if (tags.length > 0) {
    const chipList = document.createElement("ul");
    chipList.className = "fixture-plugin-card__chips";
    for (const tag of tags) {
      chipList.appendChild(createChip(tag));
    }
    card.appendChild(chipList);
  }

  if (state.showDetails) {
    const statsList = document.createElement("ul");
    statsList.className = "fixture-plugin-card__stats";
    statsList.appendChild(createStatItem("words", words.length));
    statsList.appendChild(createStatItem("chars", cardText.length));
    statsList.appendChild(createStatItem("read(s)", estimatedReadingSeconds));
    statsList.appendChild(createStatItem("renders", sectionRenderCount));
    statsList.appendChild(
      createStatItem("signal", state.signalScore, "fixture-card-signal-value"),
    );
    card.appendChild(statsList);
  }

  const controls = document.createElement("div");
  controls.className = "fixture-plugin-card__controls";

  const boostButton = createButton(
    "Boost Signal",
    "fixture-card-boost",
    () => {
      state.signalScore += 1;
      renderCard(el, props);
    },
  );
  controls.appendChild(boostButton);

  const themeButton = createButton("Cycle Theme", "fixture-card-theme", () => {
    state.themeIndex = (state.themeIndex + 1) % CARD_THEME_NAMES.length;
    renderCard(el, props);
  });
  controls.appendChild(themeButton);

  const detailsButton = createButton(
    state.showDetails ? "Hide Details" : "Show Details",
    "fixture-card-details",
    () => {
      state.showDetails = !state.showDetails;
      renderCard(el, props);
    },
  );
  controls.appendChild(detailsButton);

  card.appendChild(controls);
  el.appendChild(card);
}

function recordFixtureCommandRun() {
  const current = Number(window.__settaFixtureCommandRuns || 0);
  window.__settaFixtureCommandRuns = current + 1;
}

function readPersistedPaneNote() {
  try {
    const raw = window.localStorage.getItem(PANE_NOTE_STORAGE_KEY);
    if (typeof raw !== "string") {
      return "";
    }
    return raw;
  } catch {
    return "";
  }
}

function writePersistedPaneNote(value) {
  try {
    window.localStorage.setItem(PANE_NOTE_STORAGE_KEY, value);
  } catch {
    return;
  }
}

function clearPersistedPaneNote() {
  try {
    window.localStorage.removeItem(PANE_NOTE_STORAGE_KEY);
  } catch {
    return;
  }
}

function createPaneMetric(label, testId) {
  const metric = document.createElement("div");
  metric.className = "fixture-plugin-pane__metric";

  const metricLabel = document.createElement("span");
  metricLabel.className = "fixture-plugin-pane__metric-label";
  metricLabel.textContent = label;

  const metricValue = document.createElement("strong");
  metricValue.className = "fixture-plugin-pane__metric-value";
  metricValue.setAttribute("data-testid", testId);

  metric.appendChild(metricLabel);
  metric.appendChild(metricValue);
  return {
    metric,
    metricValue,
  };
}

function createPaneButton(label, testId, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "fixture-plugin-pane__button";
  button.setAttribute("data-testid", testId);
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function mountFixturePane(el) {
  el.innerHTML = "";

  const container = document.createElement("section");
  container.className = "fixture-plugin-pane";
  container.setAttribute("data-testid", "fixture-plugin-pane");

  const heading = document.createElement("h3");
  heading.className = "fixture-plugin-pane__title";
  heading.textContent = "Fixture Pane";
  container.appendChild(heading);

  const intro = document.createElement("p");
  intro.className = "fixture-plugin-pane__intro";
  intro.textContent = "Fixture pane mounted.";
  container.appendChild(intro);

  const subIntro = document.createElement("p");
  subIntro.className = "fixture-plugin-pane__sub-intro";
  subIntro.textContent =
    "Live plugin diagnostics for render metrics, command runs, and a persisted scratchpad.";
  container.appendChild(subIntro);

  const metrics = document.createElement("section");
  metrics.className = "fixture-plugin-pane__metrics";

  const commandMetric = createPaneMetric(
    "command runs",
    "fixture-pane-command-runs",
  );
  const renderMetric = createPaneMetric(
    "total section renders",
    "fixture-pane-total-renders",
  );
  const sectionMetric = createPaneMetric(
    "sections touched",
    "fixture-pane-section-count",
  );
  const updatedMetric = createPaneMetric(
    "last refresh",
    "fixture-pane-updated-at",
  );

  metrics.appendChild(commandMetric.metric);
  metrics.appendChild(renderMetric.metric);
  metrics.appendChild(sectionMetric.metric);
  metrics.appendChild(updatedMetric.metric);
  container.appendChild(metrics);

  const controls = document.createElement("div");
  controls.className = "fixture-plugin-pane__controls";

  const status = document.createElement("p");
  status.className = "fixture-plugin-pane__status";
  status.setAttribute("data-testid", "fixture-pane-status");
  status.textContent = "Ready.";

  const refreshMetrics = () => {
    const bySection = window.__settaFixtureRenderBySectionId || {};
    commandMetric.metricValue.textContent = String(
      Number(window.__settaFixtureCommandRuns || 0),
    );
    renderMetric.metricValue.textContent = String(
      Number(window.__settaFixtureRenderCount || 0),
    );
    sectionMetric.metricValue.textContent = String(Object.keys(bySection).length);
    updatedMetric.metricValue.textContent = new Date().toLocaleTimeString();
  };

  controls.appendChild(
    createPaneButton("Refresh Metrics", "fixture-pane-refresh", () => {
      refreshMetrics();
      status.textContent = "Metrics refreshed.";
    }),
  );

  controls.appendChild(
    createPaneButton("Run Demo Command", "fixture-pane-run-command", () => {
      recordFixtureCommandRun();
      refreshMetrics();
      status.textContent = "Fixture command executed from pane.";
    }),
  );

  controls.appendChild(
    createPaneButton("Reset Metrics", "fixture-pane-reset", () => {
      window.__settaFixtureCommandRuns = 0;
      window.__settaFixtureRenderCount = 0;
      window.__settaFixtureRenderBySectionId = {};
      refreshMetrics();
      status.textContent = "Metrics reset.";
    }),
  );

  container.appendChild(controls);

  const notePanel = document.createElement("section");
  notePanel.className = "fixture-plugin-pane__note-panel";

  const noteLabel = document.createElement("h4");
  noteLabel.className = "fixture-plugin-pane__note-title";
  noteLabel.textContent = "Scratchpad";
  notePanel.appendChild(noteLabel);

  const noteInput = document.createElement("textarea");
  noteInput.className = "fixture-plugin-pane__note-input";
  noteInput.setAttribute("data-testid", "fixture-pane-note-input");
  noteInput.rows = 4;
  noteInput.maxLength = 240;
  noteInput.placeholder = "Capture a quick plugin insight...";
  noteInput.value = readPersistedPaneNote();
  notePanel.appendChild(noteInput);

  const noteMetaRow = document.createElement("div");
  noteMetaRow.className = "fixture-plugin-pane__note-meta";

  const noteCount = document.createElement("span");
  noteCount.className = "fixture-plugin-pane__note-count";
  noteCount.setAttribute("data-testid", "fixture-pane-note-count");
  noteMetaRow.appendChild(noteCount);

  const noteActions = document.createElement("div");
  noteActions.className = "fixture-plugin-pane__note-actions";
  noteMetaRow.appendChild(noteActions);

  const notePreview = document.createElement("p");
  notePreview.className = "fixture-plugin-pane__note-preview";
  notePreview.setAttribute("data-testid", "fixture-pane-note-preview");

  const syncNoteMeta = () => {
    const value = noteInput.value;
    noteCount.textContent = `${value.length}/240`;
    notePreview.textContent =
      value.trim() === ""
        ? "No scratchpad note saved yet."
        : `Preview: ${value}`;
  };

  noteInput.addEventListener("input", () => {
    syncNoteMeta();
  });

  noteActions.appendChild(
    createPaneButton("Save Note", "fixture-pane-save-note", () => {
      writePersistedPaneNote(noteInput.value);
      syncNoteMeta();
      status.textContent = "Scratchpad note saved.";
    }),
  );
  noteActions.appendChild(
    createPaneButton("Clear Note", "fixture-pane-clear-note", () => {
      noteInput.value = "";
      clearPersistedPaneNote();
      syncNoteMeta();
      status.textContent = "Scratchpad note cleared.";
    }),
  );

  notePanel.appendChild(noteMetaRow);
  notePanel.appendChild(notePreview);
  container.appendChild(notePanel);

  container.appendChild(status);

  syncNoteMeta();
  refreshMetrics();
  el.appendChild(container);
}

export function register(host) {
  const effectiveCapabilities = new Set(host.effectiveCapabilities || []);

  if (effectiveCapabilities.has("registerSectionKinds")) {
    host.registerSectionKind({
      kind: "fixture-card",
      title: "Fixture Card",
      description: "Interactive fixture section renderer with lightweight metrics.",
      initialData: { text: "fixture-default" },
      renderer: {
        mount(el, props) {
          renderCard(el, props);
        },
        update(el, props) {
          renderCard(el, props);
        },
        unmount(el) {
          el.innerHTML = "";
        },
      },
    });
  }

  if (effectiveCapabilities.has("registerPane")) {
    host.registerPane({
      id: "fixture-overview-pane",
      title: "Fixture Pane",
      description: "Interactive fixture pane with plugin diagnostics and scratchpad.",
      icon: "dashboard",
      renderer: {
        mount(el) {
          mountFixturePane(el);
        },
        unmount(el) {
          el.textContent = "";
        },
      },
    });
  }

  if (effectiveCapabilities.has("registerCommand")) {
    host.registerCommand({
      id: "fixture-command",
      title: "Fixture Command",
      description: "Increment fixture command-run diagnostics.",
      run() {
        recordFixtureCommandRun();
      },
    });
  }
}
