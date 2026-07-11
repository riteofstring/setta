/* global CSSTransition, HTMLElement, document, getComputedStyle, window */

// Pixel-match probe for docs/plans/easy-button-pixel-match-20260709.md.
//
// The same script runs against two surfaces: the production Easy Button pane and
// docs/mockups/easy_button_pane_mockup.html. Both spellings of every component
// live in one table below, so the mapping cannot drift into two files.
//
// Nothing here needs a hook in the product. Component identity comes from the
// class names the pane already ships, and animations are frozen through the Web
// Animations API, which owns every CSS animation whether or not anyone asked.

(() => {
  const version = "setta-easy-button-pixel-match-probe-v1";

  // `rect` names which box dimensions are worth comparing. The pane, its rails,
  // and every text block are sized by their container or their content, and the
  // mockup is a fixed 1180x660 card while the real pane fills a workspace column
  // — so only intrinsically-sized components claim a size.
  const components = [
    { key: "paneBody", mockup: ".pane-body", production: ".easy-button-surface", rect: "none" },
    { key: "railLeft", mockup: ".rail-left", production: ".easy-button-rail-left", rect: "width" },
    {
      key: "railLabelLeft",
      mockup: ".rail-left .rail-label",
      production: ".easy-button-rail-left .easy-button-rail-label",
      rect: "size",
    },
    {
      key: "highlightList",
      mockup: "#highlights",
      production: ".easy-button-highlight-list",
      rect: "width",
    },
    {
      key: "highlightItem",
      mockup: ".hl:last-child",
      production: ".easy-button-highlight-item:last-child",
      rect: "width",
    },
    {
      key: "highlightDot",
      mockup: ".hl:last-child .hl-dot",
      production: ".easy-button-highlight-item:last-child .easy-button-highlight-dot",
      rect: "size",
    },
    {
      key: "highlightText",
      mockup: ".hl:last-child .hl-text",
      production: ".easy-button-highlight-item:last-child .easy-button-highlight-text",
      rect: "none",
    },
    {
      key: "highlightTime",
      mockup: ".hl:last-child .hl-time",
      production: ".easy-button-highlight-item:last-child .easy-button-highlight-time",
      rect: "none",
    },
    { key: "stage", mockup: ".stage", production: ".easy-button-stage", rect: "none" },
    {
      // Height only: the chip's width is the width of its own copy, and the two
      // surfaces run different agent counts.
      key: "agentChip",
      mockup: ".agent-chip",
      production: ".easy-button-agent-chip",
      rect: "height",
    },
    {
      key: "buttonWell",
      mockup: ".button-well",
      production: ".easy-button-button-well",
      rect: "size",
    },
    { key: "swirl", mockup: ".swirl", production: ".easy-button-swirl", rect: "size" },
    {
      key: "swirlInner",
      mockup: ".swirl-inner",
      production: ".easy-button-swirl-inner",
      rect: "none",
    },
    {
      key: "swirlLayer1",
      mockup: ".swirl-layer-1",
      production: ".easy-button-swirl-layer-1",
      rect: "size",
    },
    {
      key: "swirlLayer2",
      mockup: ".swirl-layer-2",
      production: ".easy-button-swirl-layer-2",
      rect: "none",
    },
    {
      key: "swirlLayer3",
      mockup: ".swirl-layer-3",
      production: ".easy-button-swirl-layer-3",
      rect: "none",
    },
    { key: "control", mockup: ".easy-button", production: ".easy-button-control", rect: "size" },
    {
      key: "controlGlow",
      mockup: ".easy-button",
      production: ".easy-button-control",
      pseudo: "::after",
      rect: "none",
    },
    {
      key: "captionSlot",
      mockup: ".caption-slot",
      production: ".easy-button-caption-slot",
      rect: "width",
    },
    {
      key: "requestText",
      mockup: ".transcript",
      production: ".easy-button-request-text",
      rect: "none",
    },
    { key: "helper", mockup: ".helper", production: ".easy-button-helper", rect: "none" },
    { key: "summary", mockup: ".summary", production: ".easy-button-summary", rect: "none" },
    {
      key: "railRight",
      mockup: ".rail-right",
      production: ".easy-button-rail-right",
      rect: "width",
    },
    {
      key: "railLabelRight",
      mockup: ".rail-right .rail-label",
      production: ".easy-button-rail-right .easy-button-rail-label",
      rect: "size",
    },
    {
      key: "artifactStack",
      mockup: "#artifacts",
      production: ".easy-button-artifact-stack",
      rect: "width",
    },
    {
      key: "artifactCard",
      mockup: ".artifact",
      production: ".easy-button-artifact-card",
      rect: "width",
    },
    {
      key: "artifactKicker",
      mockup: ".artifact-kicker",
      production: ".easy-button-artifact-kicker",
      rect: "none",
    },
    {
      key: "artifactTitle",
      mockup: ".artifact-title",
      production: ".easy-button-artifact-title",
      rect: "none",
    },
    {
      key: "artifactTable",
      mockup: ".a-table",
      production: ".easy-button-artifact-table",
      rect: "width",
    },
    {
      key: "artifactTableTh",
      mockup: ".a-table th",
      production: ".easy-button-artifact-table th",
      rect: "none",
    },
    {
      // The mockup's first row is its `winner` row, which is demo data with no
      // contract field behind it and is deliberately not restored. Comparing
      // against it would report its highlight tint as a production regression.
      key: "artifactTableTd",
      mockup: ".a-table tbody tr:not(.winner) td",
      production: ".easy-button-artifact-table td",
      rect: "none",
    },
    {
      key: "barRow",
      mockup: ".a-bar-row",
      production: ".easy-button-artifact-bar-row",
      rect: "none",
    },
    {
      key: "barLabel",
      mockup: ".a-bar-label",
      production: ".easy-button-artifact-bar-label",
      rect: "none",
    },
    {
      key: "barTrack",
      mockup: ".a-bar-track",
      production: ".easy-button-artifact-bar-track",
      rect: "none",
    },
    { key: "bar", mockup: ".a-bar", production: ".easy-button-artifact-bar", rect: "none" },
    {
      key: "barValue",
      mockup: ".a-bar-value",
      production: ".easy-button-artifact-bar-value",
      rect: "none",
    },
    { key: "footer", mockup: ".pane-footer", production: ".easy-button-footer", rect: "none" },
    {
      key: "inputWrap",
      mockup: ".input-wrap",
      production: ".easy-button-input-wrap",
      rect: "size",
    },
    { key: "input", mockup: ".input-wrap input", production: ".easy-button-input", rect: "size" },
    {
      key: "enterChip",
      mockup: ".enter-chip",
      production: ".easy-button-enter-chip",
      rect: "size",
    },
  ];

  // Curated rather than the whole computed style: a 340-property dump buries the
  // handful of declarations that actually carry the design.
  const comparedProperties = [
    "alignItems",
    "animationDelay",
    "animationDirection",
    "animationDuration",
    "animationFillMode",
    "animationIterationCount",
    "animationName",
    "animationPlayState",
    "animationTimingFunction",
    "backgroundColor",
    "borderTopColor",
    "borderTopLeftRadius",
    "borderTopStyle",
    "borderTopWidth",
    "boxShadow",
    "color",
    "columnGap",
    "display",
    "filter",
    "flexDirection",
    "fontFamily",
    "fontSize",
    "fontVariantNumeric",
    "fontWeight",
    "gridTemplateColumns",
    "gridTemplateRows",
    "justifyContent",
    "letterSpacing",
    "lineHeight",
    "marginBottom",
    "marginTop",
    "maskImage",
    "maxWidth",
    "minHeight",
    "mixBlendMode",
    "opacity",
    "overflowWrap",
    "overflowX",
    "overflowY",
    "paddingBottom",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "position",
    "rowGap",
    "textAlign",
    "textTransform",
    "transitionDuration",
    "transitionProperty",
    "transitionTimingFunction",
    "verticalAlign",
    "whiteSpace",
    "willChange",
    "zIndex",
  ];

  const fontProbeText = "0123456789";

  // The plan's token mapping asserted an exact `oklch()` match for every role but
  // magenta. Resolving both surfaces at runtime is the only way to know whether it
  // survived contact with the app's cascade.
  const tokenRoles = {
    mockup: {
      accentBlue: "--accent-blue",
      accentGreen: "--accent-green",
      accentMagenta: "--accent-magenta",
      accentTeal: "--accent-teal",
      accentViolet: "--accent-violet",
      border: "--border",
      card: "--card",
      faint: "--faint",
      fg: "--fg",
      muted: "--muted",
      panel: "--panel",
      plate: "--surface",
      primary: "--primary",
    },
    production: {
      accentBlue: "--accent-blue",
      accentGreen: "--accent-green",
      accentMagenta: "--accent-magenta",
      accentTeal: "--accent-teal",
      accentViolet: "--accent-violet",
      border: "--easy-button-border",
      card: "--setta-900",
      faint: "--easy-button-faint",
      fg: "--foreground",
      muted: "--easy-button-muted",
      panel: "--easy-button-panel",
      plate: "--easy-button-plate",
      primary: "--easy-button-primary",
    },
  };

  // `--easy-button-*` are declared on the surface, not the pane host, so a probe
  // appended anywhere higher would resolve them to nothing.
  const tokenScopes = { mockup: ".pane-body", production: ".easy-button-surface" };

  function measure(root, surface) {
    const scope = requireRoot(root);
    const entries = components.map((component) => [
      component.key,
      measureComponent(scope, component, surface),
    ]);
    return {
      components: Object.fromEntries(entries),
      fonts: {
        mono: measureFontAdvance(scope, componentSelector("highlightTime", surface)),
        sans: measureFontAdvance(scope, componentSelector("helper", surface)),
      },
      root: pageRect(scope),
      surface,
      tokens: measureTokens(scope, surface),
      version,
    };
  }

  function measureTokens(scope, surface) {
    const tokenScope = scope.querySelector(tokenScopes[surface]) ?? scope;
    return Object.fromEntries(
      Object.entries(tokenRoles[surface]).map(([role, token]) => [
        role,
        resolveTokenColor(tokenScope, token),
      ]),
    );
  }

  function resolveTokenColor(tokenScope, token) {
    const probe = document.createElement("span");
    probe.style.backgroundColor = `var(${token})`;
    probe.style.display = "none";
    tokenScope.appendChild(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }

  function measureComponent(scope, component, surface) {
    const selector = component[surface];
    if (!selector) {
      throw new Error(`easy-button pixel-match component has no ${surface} selector`);
    }
    const element = scope.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      return { exists: false, rect: null, rectMode: component.rect, styles: null };
    }
    const style = getComputedStyle(element, component.pseudo ?? null);
    const styles = Object.fromEntries(
      comparedProperties.map((property) => [property, style[property] ?? ""]),
    );
    return {
      exists: true,
      rect: component.pseudo ? null : pageRect(element),
      rectMode: component.rect,
      styles,
    };
  }

  // `getComputedStyle().fontFamily` reports the requested list, not the face the
  // engine picked. Rendering a fixed string in the element's own font stack and
  // measuring its advance does report the face: two stacks that resolve to the
  // same font measure identically, and two that do not, do not.
  function measureFontAdvance(scope, selector) {
    const source = scope.querySelector(selector);
    if (!(source instanceof HTMLElement)) {
      return null;
    }
    const style = getComputedStyle(source);
    const probe = document.createElement("span");
    probe.textContent = fontProbeText;
    probe.style.fontFamily = style.fontFamily;
    probe.style.fontSize = "11px";
    probe.style.fontWeight = style.fontWeight;
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "pre";
    scope.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return { advancePx: Math.round(width * 100) / 100, fontFamily: style.fontFamily };
  }

  // Freeze the pane at a chosen time, so a screenshot is a function of the
  // stylesheet alone. CSS animations and transitions are both Web Animations, and
  // `subtree: true` reaches ::after pseudo-elements — that is where the button's
  // breathing glow lives.
  //
  // Only perpetual motion is seeked. A transition and a one-shot entrance both
  // have a destination, and freezing one part-way pins the pane to a value that
  // belongs to no state at all: the swirl's 1600ms crossfade lands on neither
  // 0.85 nor 0.2, and an artifact card caught inside its 520ms arrival is still
  // transparent. Those are landed on their endpoints instead, which is also what
  // makes `timeMs = 0` a legal choice.
  function pin(root, timeMs) {
    const scope = requireRoot(root);
    if (!Number.isFinite(timeMs) || timeMs < 0) {
      throw new Error(`easy-button pixel-match pin needs a non-negative time: ${timeMs}`);
    }
    const pinned = [];
    let finishedAnimations = 0;
    let settledTransitions = 0;
    for (const animation of scope.getAnimations({ subtree: true })) {
      if (!isPerpetual(animation)) {
        animation.finish();
        if (isTransition(animation)) {
          settledTransitions += 1;
        } else {
          finishedAnimations += 1;
        }
        continue;
      }
      animation.pause();
      animation.currentTime = timeMs;
      pinned.push({ name: animation.animationName ?? "", target: describeTarget(animation) });
    }
    return { finishedAnimations, pinned, settledTransitions, timeMs };
  }

  function isPerpetual(animation) {
    return animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY;
  }

  function isTransition(animation) {
    return typeof CSSTransition !== "undefined" && animation instanceof CSSTransition;
  }

  function describeTarget(animation) {
    const target = animation.effect?.target;
    if (!(target instanceof HTMLElement)) {
      return "";
    }
    const pseudo = animation.effect?.pseudoElement ?? "";
    return `${target.className || target.tagName.toLowerCase()}${pseudo}`;
  }

  function componentSelector(key, surface) {
    const component = components.find((candidate) => candidate.key === key);
    if (!component) {
      throw new Error(`easy-button pixel-match component is unknown: ${key}`);
    }
    return component[surface];
  }

  function requireRoot(root) {
    if (!(root instanceof HTMLElement)) {
      throw new Error("easy-button pixel-match probe needs a root element");
    }
    return root;
  }

  // Screenshot clips are page coordinates; getBoundingClientRect is viewport
  // coordinates. They only coincide on an unscrolled page, and the mockup is a
  // tall document.
  function pageRect(element) {
    const rect = element.getBoundingClientRect();
    return {
      height: round(rect.height),
      width: round(rect.width),
      x: round(rect.left + window.scrollX),
      y: round(rect.top + window.scrollY),
    };
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  globalThis.__settaEasyButtonPixelMatch = { measure, pin, version };
})();
