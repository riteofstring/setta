export const apiVersion = 1;

const CARD_THEME_NAMES = ["sunrise", "ocean", "forest"];
const PANE_NOTE_STORAGE_KEY = "setta-fixture-frontend:pane-note";
const BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY = "setta.backendOriginOverride";
const cardStateBySectionId = new Map();
const mountedCardContextBySectionId = new Map();
const paneCleanupByElement = new WeakMap();
let fixtureRuntimeStore = null;
let disposeProjectStateSubscriptions = null;

function createInitialFixtureRuntimeState() {
  return {
    commandRunCount: 0,
    renderCount: 0,
    renderCountBySectionId: {},
    lastCommandSummary: "No command run yet.",
    lastBackendCommandResult: null,
    activeSectionIds: [],
    projectConfigId: "unknown",
    projectStateUpdateCount: 0,
  };
}

function syncWindowMetricsFromStore() {
  const state = getFixtureRuntimeStore().getState();
  window.__settaFixtureCommandRuns = state.commandRunCount;
  window.__settaFixtureRenderCount = state.renderCount;
  window.__settaFixtureRenderBySectionId = { ...state.renderCountBySectionId };
  window.__settaFixtureLastCommandSummary = state.lastCommandSummary;
  window.__settaFixtureBackendCommandLastResult =
    state.lastBackendCommandResult;
  window.__settaFixtureProjectConfigId = state.projectConfigId;
  window.__settaFixtureActiveSectionIds = [...state.activeSectionIds];
}

function initFixtureRuntimeStore(host) {
  if (fixtureRuntimeStore) {
    return fixtureRuntimeStore;
  }
  if (host && typeof host.createStore === "function") {
    fixtureRuntimeStore = host.createStore(() =>
      createInitialFixtureRuntimeState(),
    );
  } else {
    let fallbackState = createInitialFixtureRuntimeState();
    const fallbackListeners = new Set();
    fixtureRuntimeStore = {
      getState() {
        return fallbackState;
      },
      setState(partialOrUpdater) {
        const nextPartial =
          typeof partialOrUpdater === "function"
            ? partialOrUpdater(fallbackState)
            : partialOrUpdater;
        if (!nextPartial || typeof nextPartial !== "object") {
          return;
        }
        const previousState = fallbackState;
        fallbackState = { ...fallbackState, ...nextPartial };
        for (const listener of fallbackListeners) {
          listener(fallbackState, previousState);
        }
      },
      subscribe(listener) {
        fallbackListeners.add(listener);
        return () => {
          fallbackListeners.delete(listener);
        };
      },
    };
  }
  syncWindowMetricsFromStore();
  return fixtureRuntimeStore;
}

function getFixtureRuntimeStore() {
  return initFixtureRuntimeStore(null);
}

function setFixtureRuntimeState(partialOrUpdater) {
  const store = getFixtureRuntimeStore();
  if (typeof partialOrUpdater === "function") {
    store.setState((state) => partialOrUpdater(state));
  } else {
    store.setState(partialOrUpdater);
  }
  syncWindowMetricsFromStore();
}

function readFixtureRuntimeState() {
  return getFixtureRuntimeStore().getState();
}

function subscribeFixtureRuntimeState(listener) {
  const store = getFixtureRuntimeStore();
  if (!store || typeof store.subscribe !== "function") {
    return () => {};
  }
  return store.subscribe(() => {
    listener();
  });
}

function hostHasCapability(host, capability) {
  if (!host || !Array.isArray(host.effectiveCapabilities)) {
    return false;
  }
  return host.effectiveCapabilities.includes(capability);
}

function readActiveSectionIdsFromSnapshot(snapshot) {
  if (!Array.isArray(snapshot)) {
    return [];
  }
  const activeSectionIds = [];
  for (const rawSectionId of snapshot) {
    if (typeof rawSectionId !== "string") {
      continue;
    }
    const normalized = rawSectionId.trim();
    if (normalized === "") {
      continue;
    }
    activeSectionIds.push(normalized);
  }
  return activeSectionIds;
}

function syncRuntimeProjectStateSnapshot(host) {
  if (!hostHasCapability(host, "readProjectState")) {
    return;
  }
  if (typeof host.readProjectState !== "function") {
    return;
  }
  const projectConfigSnapshot = host.readProjectState({
    kind: "projectConfig",
  });
  const activeSectionIdsSnapshot = host.readProjectState({
    kind: "activeSectionIds",
  });

  const nextProjectConfigId =
    projectConfigSnapshot &&
    typeof projectConfigSnapshot === "object" &&
    typeof projectConfigSnapshot.id === "string"
      ? projectConfigSnapshot.id
      : "unknown";
  const activeSectionIds = readActiveSectionIdsFromSnapshot(
    activeSectionIdsSnapshot,
  );

  setFixtureRuntimeState((state) => ({
    projectConfigId: nextProjectConfigId,
    activeSectionIds,
    projectStateUpdateCount: Number(state.projectStateUpdateCount || 0) + 1,
  }));
}

function startRuntimeProjectStateSubscriptions(host) {
  if (disposeProjectStateSubscriptions) {
    disposeProjectStateSubscriptions();
    disposeProjectStateSubscriptions = null;
  }
  if (!hostHasCapability(host, "subscribeProjectState")) {
    return;
  }
  if (typeof host.subscribeProjectState !== "function") {
    return;
  }

  const unsubscribers = [];
  unsubscribers.push(
    host.subscribeProjectState(
      {
        kind: "activeSectionIds",
      },
      (nextValue) => {
        const activeSectionIds = readActiveSectionIdsFromSnapshot(nextValue);
        setFixtureRuntimeState((state) => ({
          activeSectionIds,
          projectStateUpdateCount:
            Number(state.projectStateUpdateCount || 0) + 1,
        }));
      },
      {
        fireImmediately: true,
      },
    ),
  );
  unsubscribers.push(
    host.subscribeProjectState(
      {
        kind: "projectConfig",
      },
      (nextValue) => {
        const nextProjectConfigId =
          nextValue &&
          typeof nextValue === "object" &&
          typeof nextValue.id === "string"
            ? nextValue.id
            : "unknown";
        setFixtureRuntimeState((state) => ({
          projectConfigId: nextProjectConfigId,
          projectStateUpdateCount:
            Number(state.projectStateUpdateCount || 0) + 1,
        }));
      },
      {
        fireImmediately: true,
      },
    ),
  );

  disposeProjectStateSubscriptions = () => {
    for (const unsubscribe of unsubscribers) {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    }
    disposeProjectStateSubscriptions = null;
  };
}

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
  setFixtureRuntimeState((state) => {
    const nextBySection = {
      ...state.renderCountBySectionId,
    };
    const current = Number(nextBySection[sectionId] || 0);
    nextBySection[sectionId] = current + 1;
    return {
      renderCount: Number(state.renderCount || 0) + 1,
      renderCountBySectionId: nextBySection,
    };
  });
}

function getRenderCountForSection(sectionId) {
  const state = readFixtureRuntimeState();
  return Number(state.renderCountBySectionId[sectionId] || 0);
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

function getLastCommandSummary() {
  const state = readFixtureRuntimeState();
  if (typeof state.lastCommandSummary === "string") {
    return state.lastCommandSummary;
  }
  return "No command run yet.";
}

function formatFixtureError(error) {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

function appendCommandSummaryToNote(summary) {
  const normalizedSummary = typeof summary === "string" ? summary.trim() : "";
  if (normalizedSummary === "") {
    return;
  }
  const existing = readPersistedPaneNote();
  const lines = existing
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  lines.push(normalizedSummary);
  const nextValue = lines.slice(-6).join("\n").slice(0, 240);
  writePersistedPaneNote(nextValue);
}

function pulseMountedFixtureCards() {
  let boostedCardCount = 0;
  for (const [sectionId, context] of mountedCardContextBySectionId.entries()) {
    if (
      !context ||
      !context.el ||
      !(context.el instanceof HTMLElement) ||
      !context.el.isConnected
    ) {
      mountedCardContextBySectionId.delete(sectionId);
      continue;
    }
    const state = getCardState(sectionId);
    state.signalScore += 1;
    state.themeIndex = (state.themeIndex + 1) % CARD_THEME_NAMES.length;
    state.showDetails = true;
    boostedCardCount += 1;
    renderCard(context.el, context.props);
  }
  return boostedCardCount;
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
  mountedCardContextBySectionId.set(sectionId, { el, props });
  el.setAttribute("data-fixture-section-id", sectionId);
  incrementRenderMetrics(sectionId);
  const state = getCardState(sectionId);
  const cardText = getCardText(props.data);
  const tags = getCardTags(props.data);
  const words = normalizeWords(cardText);
  const estimatedReadingSeconds = Math.max(1, Math.round(words.length / 3));
  const sectionRenderCount = getRenderCountForSection(sectionId);
  const themeName =
    CARD_THEME_NAMES[state.themeIndex % CARD_THEME_NAMES.length];

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

  const boostButton = createButton("Boost Signal", "fixture-card-boost", () => {
    state.signalScore += 1;
    renderCard(el, props);
  });
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
  const current = Number(readFixtureRuntimeState().commandRunCount || 0);
  const next = current + 1;
  setFixtureRuntimeState({ commandRunCount: next });
  return next;
}

function normalizeOrigin(rawOrigin) {
  if (typeof rawOrigin !== "string") {
    return null;
  }
  const trimmedOrigin = rawOrigin.trim();
  if (trimmedOrigin === "") {
    return null;
  }
  try {
    const parsed = new URL(trimmedOrigin);
    return parsed.origin;
  } catch {
    return null;
  }
}

function readBackendOriginFromSessionStorage() {
  try {
    const stored = window.sessionStorage.getItem(
      BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
    );
    return normalizeOrigin(stored);
  } catch {
    return null;
  }
}

function readBackendOriginFromModuleUrl() {
  try {
    return normalizeOrigin(import.meta.url);
  } catch {
    return null;
  }
}

function resolveBackendOrigin() {
  let backendOrigin = readBackendOriginFromModuleUrl();
  if (!backendOrigin) {
    backendOrigin = readBackendOriginFromSessionStorage();
  }
  if (!backendOrigin) {
    backendOrigin = window.location.origin;
  }
  return backendOrigin;
}

function resolveBackendApiBase() {
  const backendOrigin = resolveBackendOrigin();
  return `${backendOrigin}/api`;
}

async function runBackendRoundtripForFixtureCommand(_host) {
  const backendOrigin = resolveBackendOrigin();
  const backendApiBase = resolveBackendApiBase();
  const fetchBackendApi = (path, init) => {
    return fetch(`${backendApiBase}${path}`, {
      ...init,
      credentials: "include",
      headers: init?.headers,
    });
  };
  const fetchBackendRoot = (path, init) => {
    return fetch(`${backendOrigin}${path}`, {
      ...init,
      credentials: "include",
      headers: init?.headers,
    });
  };
  const runtimeResponse = await fetchBackendApi("/plugins/runtime", {
    headers: {
      "X-Fixture-Command": "runtime",
    },
  });

  let listedPluginCount = 0;
  let activePluginCount = 0;
  let backendFixtureState = "missing";
  let backendFixtureHealthPath = null;
  if (runtimeResponse.ok) {
    const runtimePayload = await runtimeResponse.json();
    const listPayload =
      runtimePayload && typeof runtimePayload === "object"
        ? runtimePayload.list
        : null;
    const statusPayload =
      runtimePayload && typeof runtimePayload === "object"
        ? runtimePayload.status
        : null;
    if (
      listPayload &&
      typeof listPayload === "object" &&
      Array.isArray(listPayload.plugins)
    ) {
      listedPluginCount = listPayload.plugins.length;
    }
    if (
      statusPayload &&
      typeof statusPayload === "object" &&
      Array.isArray(statusPayload.plugins)
    ) {
      for (const pluginEntry of statusPayload.plugins) {
        if (!pluginEntry || typeof pluginEntry !== "object") {
          continue;
        }
        const pluginState = pluginEntry.state;
        if (pluginState === "active") {
          activePluginCount += 1;
        }
        if (
          pluginEntry.pluginId === "setta-fixture-backend" &&
          typeof pluginState === "string"
        ) {
          backendFixtureState = pluginState;
          if (Array.isArray(pluginEntry.registeredBackendRoutes)) {
            const healthRoute = pluginEntry.registeredBackendRoutes.find(
              (routeEntry) =>
                routeEntry &&
                typeof routeEntry === "object" &&
                routeEntry.path === "/health" &&
                Array.isArray(routeEntry.methods) &&
                routeEntry.methods.includes("GET"),
            );
            if (
              healthRoute &&
              typeof healthRoute.path === "string" &&
              healthRoute.path !== ""
            ) {
              backendFixtureHealthPath = healthRoute.path;
            }
          }
        }
      }
    }
  }

  let backendFixtureHealthStatus =
    backendFixtureState === "active" ? "not-registered" : "skipped";
  if (backendFixtureState === "active" && backendFixtureHealthPath) {
    const backendHealthResponse = await fetchBackendRoot(
      backendFixtureHealthPath,
      {
        headers: {
          "X-Fixture-Command": "fixture-backend-health",
        },
      },
    );
    backendFixtureHealthStatus = String(backendHealthResponse.status);
  }

  const backendSummary =
    "backend " +
    `list:${runtimeResponse.status} ` +
    `status:${runtimeResponse.status} ` +
    `plugins:${listedPluginCount}/${activePluginCount} ` +
    `fixture-backend:${backendFixtureState} ` +
    `health:${backendFixtureHealthStatus}`;
  setFixtureRuntimeState({
    lastBackendCommandResult: {
      listStatus: runtimeResponse.status,
      statusStatus: runtimeResponse.status,
      runtimeStatus: runtimeResponse.status,
      listedPluginCount,
      activePluginCount,
      backendFixtureState,
      backendFixtureHealthStatus,
    },
  });
  return backendSummary;
}

function emitFixtureRealtimeSignals(host) {
  if (!hostHasCapability(host, "emitListenerEvents")) {
    return 0;
  }
  if (typeof host.emitSectionRealtimeValue !== "function") {
    return 0;
  }
  let emittedCount = 0;
  for (const [sectionId] of mountedCardContextBySectionId.entries()) {
    if (typeof sectionId !== "string" || sectionId.trim() === "") {
      continue;
    }
    const cardState = getCardState(sectionId);
    host.emitSectionRealtimeValue(sectionId, {
      fixtureSignalScore: Number(cardState.signalScore || 0),
      emittedAtMs: Date.now(),
    });
    emittedCount += 1;
  }
  return emittedCount;
}

async function executeFixtureCommand(host) {
  const runCount = recordFixtureCommandRun();
  let boostedCardCount = 0;
  let realtimeEmitCount = 0;
  const diagnostics = [];
  try {
    boostedCardCount = pulseMountedFixtureCards();
  } catch (error) {
    diagnostics.push(`pulse:${formatFixtureError(error)}`);
  }
  try {
    realtimeEmitCount = emitFixtureRealtimeSignals(host);
  } catch (error) {
    diagnostics.push(`emit:${formatFixtureError(error)}`);
  }
  let summary = `run ${runCount}: pulsed ${boostedCardCount} card(s), emitted ${realtimeEmitCount} realtime update(s)`;
  if (host && typeof host.getProjectContext === "function") {
    const context = host.getProjectContext();
    if (context && typeof context.serverMode === "string") {
      summary = `${summary} in ${context.serverMode} mode`;
    }
  }
  if (hostHasCapability(host, "readProjectState")) {
    try {
      syncRuntimeProjectStateSnapshot(host);
      const state = readFixtureRuntimeState();
      summary =
        `${summary}; active sections:${state.activeSectionIds.length} ` +
        `project:${state.projectConfigId}`;
    } catch (error) {
      diagnostics.push(`project-state:${formatFixtureError(error)}`);
    }
  }
  if (diagnostics.length > 0) {
    summary = `${summary}; diagnostics:${diagnostics.join(" | ")}`;
  }
  let backendSummary = "backend unavailable";
  try {
    backendSummary = await runBackendRoundtripForFixtureCommand(host);
  } catch (error) {
    backendSummary = `backend error:${formatFixtureError(error)}`;
  }
  summary = `${summary}; ${backendSummary}`;
  setFixtureRuntimeState({ lastCommandSummary: summary });
  appendCommandSummaryToNote(summary);
  return summary;
}

function unmountCard(el) {
  const sectionId = el.getAttribute("data-fixture-section-id");
  if (typeof sectionId === "string" && sectionId !== "") {
    mountedCardContextBySectionId.delete(sectionId);
  }
  el.removeAttribute("data-fixture-section-id");
  el.innerHTML = "";
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

function createPaneButton(label, testId, onClick, variant = "default") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `fixture-plugin-pane__button fixture-plugin-pane__button--${variant}`;
  button.setAttribute("data-testid", testId);
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function mountFixturePane(el, host) {
  const existingCleanup = paneCleanupByElement.get(el);
  if (typeof existingCleanup === "function") {
    existingCleanup();
    paneCleanupByElement.delete(el);
  }
  el.innerHTML = "";

  const container = document.createElement("section");
  container.className = "fixture-plugin-pane";
  container.setAttribute("data-testid", "fixture-plugin-pane");

  const heading = document.createElement("h3");
  heading.className = "fixture-plugin-pane__title";
  heading.textContent = "Fixture Pane";

  const intro = document.createElement("p");
  intro.className = "fixture-plugin-pane__intro";
  intro.textContent = "Fixture pane mounted.";

  const subIntro = document.createElement("p");
  subIntro.className = "fixture-plugin-pane__sub-intro";
  subIntro.textContent =
    "Live plugin diagnostics for render metrics, command runs, and a persisted scratchpad.";

  const header = document.createElement("header");
  header.className = "fixture-plugin-pane__header";
  header.appendChild(heading);
  header.appendChild(intro);
  header.appendChild(subIntro);
  container.appendChild(header);

  const runtimePanel = document.createElement("section");
  runtimePanel.className =
    "fixture-plugin-pane__panel fixture-plugin-pane__panel--runtime";

  const runtimeLabel = document.createElement("h4");
  runtimeLabel.className = "fixture-plugin-pane__panel-title";
  runtimeLabel.textContent = "Runtime Metrics";
  runtimePanel.appendChild(runtimeLabel);

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
  const activeSectionMetric = createPaneMetric(
    "active sections",
    "fixture-pane-active-section-count",
  );
  const projectConfigMetric = createPaneMetric(
    "project config",
    "fixture-pane-project-config-id",
  );
  const updatedMetric = createPaneMetric(
    "last refresh",
    "fixture-pane-updated-at",
  );
  const commandSummaryMetric = createPaneMetric(
    "last command",
    "fixture-pane-last-command",
  );
  const projectStateUpdateMetric = createPaneMetric(
    "project state updates",
    "fixture-pane-project-state-updates",
  );

  metrics.appendChild(commandMetric.metric);
  metrics.appendChild(renderMetric.metric);
  metrics.appendChild(sectionMetric.metric);
  metrics.appendChild(activeSectionMetric.metric);
  metrics.appendChild(projectConfigMetric.metric);
  metrics.appendChild(updatedMetric.metric);
  metrics.appendChild(commandSummaryMetric.metric);
  metrics.appendChild(projectStateUpdateMetric.metric);
  runtimePanel.appendChild(metrics);

  const controls = document.createElement("div");
  controls.className = "fixture-plugin-pane__controls";

  const status = document.createElement("p");
  status.className = "fixture-plugin-pane__status";
  status.setAttribute("data-testid", "fixture-pane-status");
  status.textContent = "Ready.";

  const refreshMetrics = () => {
    const state = readFixtureRuntimeState();
    const bySection = state.renderCountBySectionId || {};
    commandMetric.metricValue.textContent = String(
      Number(state.commandRunCount || 0),
    );
    renderMetric.metricValue.textContent = String(
      Number(state.renderCount || 0),
    );
    sectionMetric.metricValue.textContent = String(
      Object.keys(bySection).length,
    );
    activeSectionMetric.metricValue.textContent = String(
      Array.isArray(state.activeSectionIds) ? state.activeSectionIds.length : 0,
    );
    projectConfigMetric.metricValue.textContent =
      typeof state.projectConfigId === "string"
        ? state.projectConfigId
        : "unknown";
    updatedMetric.metricValue.textContent = new Date().toLocaleTimeString();
    commandSummaryMetric.metricValue.textContent = getLastCommandSummary();
    projectStateUpdateMetric.metricValue.textContent = String(
      Number(state.projectStateUpdateCount || 0),
    );
  };
  let refreshAnimationFrameId = null;
  const scheduleMetricsRefresh = () => {
    if (refreshAnimationFrameId !== null) {
      return;
    }
    refreshAnimationFrameId = window.requestAnimationFrame(() => {
      refreshAnimationFrameId = null;
      refreshMetrics();
    });
  };
  const unsubscribeRuntimeState = subscribeFixtureRuntimeState(() => {
    scheduleMetricsRefresh();
  });

  controls.appendChild(
    createPaneButton("Refresh Metrics", "fixture-pane-refresh", () => {
      refreshMetrics();
      status.textContent = "Metrics refreshed.";
    }),
  );

  controls.appendChild(
    createPaneButton(
      "Run Demo Command",
      "fixture-pane-run-command",
      async () => {
        const summary = await executeFixtureCommand(host);
        refreshMetrics();
        status.textContent = summary;
      },
    ),
  );

  controls.appendChild(
    createPaneButton(
      "Reset Metrics",
      "fixture-pane-reset",
      () => {
        setFixtureRuntimeState({
          commandRunCount: 0,
          renderCount: 0,
          renderCountBySectionId: {},
          lastCommandSummary: "No command run yet.",
          lastBackendCommandResult: null,
          activeSectionIds: [],
          projectConfigId: "unknown",
          projectStateUpdateCount: 0,
        });
        syncRuntimeProjectStateSnapshot(host);
        refreshMetrics();
        status.textContent = "Metrics reset.";
      },
      "danger",
    ),
  );

  runtimePanel.appendChild(controls);
  runtimePanel.appendChild(status);
  container.appendChild(runtimePanel);

  const notePanel = document.createElement("section");
  notePanel.className =
    "fixture-plugin-pane__panel fixture-plugin-pane__note-panel";

  const noteLabel = document.createElement("h4");
  noteLabel.className = "fixture-plugin-pane__note-title";
  noteLabel.textContent = "Scratchpad";
  notePanel.appendChild(noteLabel);

  const noteHint = document.createElement("p");
  noteHint.className = "fixture-plugin-pane__note-hint";
  noteHint.textContent = "Saved to browser localStorage for this workspace.";
  notePanel.appendChild(noteHint);

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
    createPaneButton(
      "Clear Note",
      "fixture-pane-clear-note",
      () => {
        noteInput.value = "";
        clearPersistedPaneNote();
        syncNoteMeta();
        status.textContent = "Scratchpad note cleared.";
      },
      "danger",
    ),
  );

  notePanel.appendChild(noteMetaRow);
  notePanel.appendChild(notePreview);
  container.appendChild(notePanel);

  syncNoteMeta();
  refreshMetrics();
  paneCleanupByElement.set(el, () => {
    unsubscribeRuntimeState();
    if (refreshAnimationFrameId !== null) {
      window.cancelAnimationFrame(refreshAnimationFrameId);
      refreshAnimationFrameId = null;
    }
  });
  el.appendChild(container);
}

function unmountFixturePane(el) {
  const cleanup = paneCleanupByElement.get(el);
  if (typeof cleanup === "function") {
    cleanup();
  }
  paneCleanupByElement.delete(el);
  el.textContent = "";
}

export function register(host) {
  initFixtureRuntimeStore(host);
  const effectiveCapabilities = new Set(host.effectiveCapabilities || []);

  syncRuntimeProjectStateSnapshot(host);
  startRuntimeProjectStateSubscriptions(host);

  if (effectiveCapabilities.has("registerSectionKinds")) {
    host.registerSectionKind({
      kind: "fixture-card",
      title: "Fixture Card",
      description:
        "Interactive fixture section renderer with lightweight metrics.",
      initialData: { text: "fixture-default" },
      renderer: {
        mount(el, props) {
          renderCard(el, props);
        },
        update(el, props) {
          renderCard(el, props);
        },
        unmount(el) {
          unmountCard(el);
        },
      },
    });
  }

  if (effectiveCapabilities.has("registerPane")) {
    host.registerPane({
      id: "fixture-overview-pane",
      title: "Fixture Pane",
      description:
        "Interactive fixture pane with plugin diagnostics and scratchpad.",
      icon: "dashboard",
      renderer: {
        mount(el) {
          mountFixturePane(el, host);
        },
        unmount(el) {
          unmountFixturePane(el);
        },
      },
    });
  }

  if (effectiveCapabilities.has("registerCommand")) {
    host.registerCommand({
      id: "fixture-command",
      title: "Fixture Command",
      description:
        "Pulse fixture cards and run a multi-call backend roundtrip.",
      run() {
        return executeFixtureCommand(host);
      },
    });
  }
}
