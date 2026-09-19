const splitAttribute = (element, name) =>
  (element.getAttribute(name) || "").split("|").filter(Boolean);

const renderWorkspace = (element) => {
  const region = (name) => element.querySelector(`[data-region="${name}"]`);
  const outline = region("outline");
  const canvas = region("canvas");
  const inspector = region("inspector");
  const icon = (name) =>
    `<svg class="setta-icon"><use href="#icon-${name}"></use></svg>`;
  const chips = splitAttribute(element, "chips")
    .map((chip) => `<span class="workspace-topbar-chip">${chip}</span>`)
    .join("");
  const selectedTab = element.getAttribute("selected-tab");
  const tabs = splitAttribute(element, "tabs")
    .map(
      (tab) =>
        `<span class="setta-workspace-saved-view-tab" role="tab" aria-selected="${tab === selectedTab}">${tab}</span>`,
    )
    .join("");
  const inspectorOpen = element.getAttribute("inspector-open") !== "false";
  const canvasClasses = canvas.className;
  const hasMinimap = Boolean(canvas.querySelector(".react-flow__minimap"));
  const shellClasses = [
    "setta-workspace-shell",
    inspectorOpen ? "" : "setta-workspace-shell--inspector-closed",
    tabs ? "" : "setta-workspace-shell--tabs-hidden",
  ]
    .filter(Boolean)
    .join(" ");
  const inspectorPanel = inspectorOpen
    ? `<div class="setta-workspace-shell-panel">
        <h4 class="setta-workspace-shell-pane-title">${element.getAttribute("inspector-title")}</h4>
        <div class="setta-workspace-shell-pane-body">${inspector.innerHTML}</div>
        <span class="setta-workspace-shell-full-width-button">↔</span>
      </div>`
    : "";
  const savedViews = tabs
    ? `<nav class="setta-workspace-saved-view-tabs" aria-label="Saved views">
        <div class="setta-workspace-saved-view-tabs-list" role="tablist">${tabs}</div>
      </nav>`
    : "";
  const action = element.getAttribute("action");
  const primaryAction = action
    ? `<span class="workspace-primary-action">${icon("spark")}${action}</span>`
    : "";

  element.classList.add("setta-workspace");
  element.innerHTML = `
    <div class="${shellClasses}">
      <div class="setta-workspace-shell-pane-region" data-workspace-shell-pane-region="leading">
        <aside class="setta-workspace-shell-pane" data-pane="leading">
          <div class="setta-workspace-shell-rail" data-workspace-shell-rail="leading">
            <div class="setta-workspace-shell-tablist">
              <span class="setta-workspace-shell-tab" data-active="true">${icon("outline")}</span>
              <span class="setta-workspace-shell-tab">${icon("search")}</span>
              <span class="setta-workspace-shell-tab">${icon("layers")}</span>
            </div>
          </div>
          <div class="setta-workspace-shell-panel">
            <h4 class="setta-workspace-shell-pane-title">Outline</h4>
            <div class="setta-workspace-shell-pane-body">${outline.innerHTML}</div>
            <span class="setta-workspace-shell-full-width-button">↔</span>
          </div>
        </aside>
      </div>
      <section class="setta-workspace-shell-center">
        <div class="workspace-topbar">
          <div class="workspace-topbar-summary"><strong>${element.getAttribute("heading")}</strong><span>${element.getAttribute("meta")}</span></div>
          ${chips}
          ${primaryAction}
        </div>
        <div class="setta-workspace-shell-canvas"><div class="${canvasClasses}">${canvas.innerHTML}</div></div>
      </section>
      <div class="setta-workspace-shell-pane-region" data-workspace-shell-pane-region="trailing">
        <aside class="setta-workspace-shell-pane" data-pane="trailing">
          <div class="setta-workspace-shell-rail" data-workspace-shell-rail="trailing">
            <div class="setta-workspace-shell-tablist">
              <span class="setta-workspace-shell-tab"${inspectorOpen ? ' data-active="true"' : ""}>${icon("panel")}</span>
              <span class="setta-workspace-shell-tab">${icon("sliders")}</span>
            </div>
          </div>
          ${inspectorPanel}
        </aside>
      </div>
      <div class="setta-workspace-shell-controls" aria-hidden="true">
        <span class="react-flow__controls-button">${icon("plus")}</span>
        <span class="react-flow__controls-button">${icon("minus")}</span>
        <span class="react-flow__controls-button">${icon("fit")}</span>
        <span class="react-flow__controls-button"${hasMinimap ? ' data-active="true"' : ""}>${icon("map")}</span>
      </div>
      ${savedViews}
    </div>`;
};

const setupChoiceStage = (element) => {
  const choiceStage = element.querySelector(".review-choice-stage");
  if (choiceStage) {
    const renderChoice = (choice) => {
      choiceStage.dataset.choice = choice;
      choiceStage.querySelectorAll("[data-choice-option]").forEach((option) => {
        const selected = option.dataset.choiceOption === choice;
        option.toggleAttribute("data-selected", selected);
        option.setAttribute("aria-pressed", String(selected));
      });
      choiceStage.querySelectorAll("[data-choice-row]").forEach((row) => {
        row.toggleAttribute("data-selected", row.dataset.choiceRow === choice);
      });
    };

    choiceStage.querySelectorAll("[data-choice-option]").forEach((option) => {
      option.addEventListener("click", () => {
        renderChoice(option.dataset.choiceOption);
      });
    });
    renderChoice(choiceStage.dataset.choice || "b");

    const renderEvidenceFactor = (factor) => {
      choiceStage.dataset.evidenceFactor = factor;
      choiceStage.querySelectorAll("[data-choice-factor]").forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.choiceFactor === factor),
        );
      });
      choiceStage.querySelectorAll("[data-factor-column]").forEach((column) => {
        column.toggleAttribute(
          "data-evidence-active",
          column.dataset.factorColumn === factor,
        );
      });
      choiceStage
        .querySelectorAll("[data-choice-evidence-edge]")
        .forEach((edge) => {
          edge.toggleAttribute(
            "data-active",
            edge.dataset.choiceEvidenceEdge === factor,
          );
        });
      choiceStage
        .querySelectorAll("[data-choice-factor-port]")
        .forEach((port) => {
          port.toggleAttribute(
            "data-active",
            port.dataset.choiceFactorPort === factor,
          );
        });
      choiceStage
        .querySelectorAll("[data-choice-evidence-port]")
        .forEach((port) => {
          port.toggleAttribute(
            "data-active",
            port.dataset.choiceEvidencePort === factor,
          );
        });
      choiceStage.querySelectorAll("[data-evidence-for]").forEach((section) => {
        const factors = section.dataset.evidenceFor.split(/\s+/);
        section.toggleAttribute(
          "data-evidence-active",
          factors.includes(factor),
        );
      });
      choiceStage.querySelectorAll("[data-citation-factor]").forEach((line) => {
        line.toggleAttribute(
          "data-cited",
          line.dataset.citationFactor === factor,
        );
      });
    };

    choiceStage.querySelectorAll("[data-choice-factor]").forEach((button) => {
      button.addEventListener("click", () => {
        renderEvidenceFactor(button.dataset.choiceFactor);
      });
    });
    renderEvidenceFactor(choiceStage.dataset.evidenceFactor || "mismatch");

    const choiceActions = choiceStage.querySelector("[data-choice-actions]");
    const revisionForm = choiceStage.querySelector(
      "[data-choice-revision-form]",
    );
    const revisionSent = choiceStage.querySelector(
      "[data-choice-revision-sent]",
    );
    const revisionInput = revisionForm.querySelector("input");

    choiceStage
      .querySelector("[data-choice-request-changes]")
      .addEventListener("click", () => {
        choiceActions.hidden = true;
        revisionSent.hidden = true;
        revisionForm.hidden = false;
        revisionInput.focus();
      });
    choiceStage
      .querySelector("[data-choice-revision-cancel]")
      .addEventListener("click", () => {
        revisionForm.reset();
        revisionForm.hidden = true;
        choiceActions.hidden = false;
      });
    revisionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!revisionForm.reportValidity()) return;
      revisionForm.hidden = true;
      revisionSent.hidden = false;
    });
  }
};

const setupCandidateStage = (element) => {
  const candidateStage = element.querySelector(".review-candidate-stage");
  if (candidateStage) {
    const candidateNames = {
      a: "Orbital",
      b: "Signal",
      c: "Quiet orbit",
    };
    const candidateActions = candidateStage.querySelector(
      "[data-candidate-actions]",
    );
    const candidateRevisionForm = candidateStage.querySelector(
      "[data-candidate-revision-form]",
    );
    const candidateSent = candidateStage.querySelector(
      "[data-candidate-decision-sent]",
    );
    const candidateSentLabel = candidateSent.querySelector("span");
    const candidateSelection = candidateStage.querySelector(
      "[data-candidate-selection]",
    );

    const renderCandidate = (candidate) => {
      candidateStage.dataset.candidate = candidate;
      candidateStage
        .querySelectorAll("[data-candidate-option]")
        .forEach((button) => {
          button.setAttribute(
            "aria-pressed",
            String(button.dataset.candidateOption === candidate),
          );
        });
      candidateStage
        .querySelectorAll("[data-candidate-card]")
        .forEach((card) => {
          card.toggleAttribute(
            "data-selected",
            card.dataset.candidateCard === candidate,
          );
        });
      element.querySelectorAll("[data-candidate-outline]").forEach((item) => {
        const selected = item.dataset.candidateOutline === candidate;
        item.toggleAttribute("aria-selected", selected);
        const check = item.querySelector("[data-candidate-outline-check]");
        if (check) check.hidden = !selected;
      });
      candidateSelection.textContent = candidateNames[candidate];
    };

    candidateStage
      .querySelectorAll("[data-candidate-option]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          renderCandidate(button.dataset.candidateOption);
          candidateSent.hidden = true;
          candidateRevisionForm.hidden = true;
          candidateActions.hidden = false;
        });
      });
    renderCandidate(candidateStage.dataset.candidate || "b");

    candidateStage
      .querySelector("[data-candidate-confirm]")
      .addEventListener("click", () => {
        candidateActions.hidden = true;
        candidateSentLabel.textContent = `${candidateNames[candidateStage.dataset.candidate]} selected`;
        candidateSent.hidden = false;
      });
    candidateStage
      .querySelector("[data-candidate-request-changes]")
      .addEventListener("click", () => {
        candidateActions.hidden = true;
        candidateSent.hidden = true;
        candidateRevisionForm.hidden = false;
        candidateRevisionForm.querySelector("input").focus();
      });
    candidateStage
      .querySelector("[data-candidate-revision-cancel]")
      .addEventListener("click", () => {
        candidateRevisionForm.reset();
        candidateRevisionForm.hidden = true;
        candidateActions.hidden = false;
      });
    candidateRevisionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!candidateRevisionForm.reportValidity()) return;
      candidateRevisionForm.hidden = true;
      candidateSentLabel.textContent = "Revision requested";
      candidateSent.hidden = false;
    });
  }
};

const setupPermissionStage = (element) => {
  const permissionStage = element.querySelector(".review-permission-stage");
  if (permissionStage) {
    const permissionEditor = permissionStage.querySelector(
      "[data-permission-editor]",
    );
    const permissionRevisionForm = permissionStage.querySelector(
      "[data-permission-revision-form]",
    );
    const permissionSent = permissionStage.querySelector(
      "[data-permission-sent]",
    );
    const permissionSentLabel = permissionSent.querySelector("span");

    const renderPermissionEvidence = () => {
      const factor = permissionStage.dataset.permissionFactorActive;
      const tool = permissionStage.dataset.permissionTool;
      permissionStage
        .querySelectorAll("[data-permission-factor]")
        .forEach((button) => {
          button.setAttribute(
            "aria-pressed",
            String(button.dataset.permissionFactor === factor),
          );
        });
      permissionStage
        .querySelectorAll("[data-permission-factor-column]")
        .forEach((column) => {
          column.toggleAttribute(
            "data-evidence-active",
            column.dataset.permissionFactorColumn === factor,
          );
        });
      permissionStage
        .querySelectorAll("[data-permission-evidence-edge]")
        .forEach((edge) => {
          edge.toggleAttribute(
            "data-active",
            edge.dataset.permissionEvidenceEdge === factor,
          );
        });
      permissionStage
        .querySelectorAll("[data-permission-factor-port]")
        .forEach((port) => {
          port.toggleAttribute(
            "data-active",
            port.dataset.permissionFactorPort === factor,
          );
        });
      permissionStage
        .querySelectorAll("[data-permission-evidence-port]")
        .forEach((port) => {
          port.toggleAttribute(
            "data-active",
            port.dataset.permissionEvidencePort === factor,
          );
        });
      permissionStage
        .querySelectorAll("[data-permission-evidence-for]")
        .forEach((section) => {
          section.toggleAttribute(
            "data-evidence-active",
            section.dataset.permissionEvidenceFor === factor,
          );
        });
      permissionStage
        .querySelectorAll("[data-permission-citation]")
        .forEach((line) => {
          line.toggleAttribute(
            "data-cited",
            line.dataset.permissionCitation === `${factor}:${tool}`,
          );
        });
    };

    const renderPermissionTool = (tool) => {
      permissionStage.dataset.permissionTool = tool;
      permissionStage
        .querySelectorAll("[data-permission-row]")
        .forEach((row) => {
          row.toggleAttribute(
            "data-selected",
            row.dataset.permissionRow === tool,
          );
        });
      permissionStage
        .querySelectorAll("[data-permission-tool-option]")
        .forEach((button) => {
          button.setAttribute(
            "aria-pressed",
            String(button.dataset.permissionToolOption === tool),
          );
        });
      const row = permissionStage.querySelector(
        `[data-permission-row="${tool}"]`,
      );
      const label = row
        .querySelector("[data-permission-tool-option]")
        .textContent.trim();
      permissionStage.querySelector(
        "[data-permission-current-tool]",
      ).textContent = label;
      permissionStage.querySelector("[data-permission-current-scope]").value =
        row.dataset.permissionScope;
      permissionStage
        .querySelectorAll("[data-permission-decision-option]")
        .forEach((button) => {
          button.setAttribute(
            "aria-pressed",
            String(
              button.dataset.permissionDecisionOption ===
                row.dataset.permissionDecision,
            ),
          );
        });
      renderPermissionEvidence();
    };

    permissionStage
      .querySelectorAll("[data-permission-factor]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          permissionStage.dataset.permissionFactorActive =
            button.dataset.permissionFactor;
          renderPermissionEvidence();
        });
      });
    permissionStage
      .querySelectorAll("[data-permission-tool-option]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          renderPermissionTool(button.dataset.permissionToolOption);
          permissionSent.hidden = true;
          permissionRevisionForm.hidden = true;
          permissionEditor.hidden = false;
        });
      });
    permissionStage
      .querySelectorAll("[data-permission-decision-option]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const row = permissionStage.querySelector(
            `[data-permission-row="${permissionStage.dataset.permissionTool}"]`,
          );
          const decision = button.dataset.permissionDecisionOption;
          row.dataset.permissionDecision = decision;
          row.querySelector("[data-permission-response]").textContent =
            decision[0].toUpperCase() + decision.slice(1);
          renderPermissionTool(permissionStage.dataset.permissionTool);
        });
      });
    permissionStage
      .querySelector("[data-permission-current-scope]")
      .addEventListener("change", (event) => {
        const row = permissionStage.querySelector(
          `[data-permission-row="${permissionStage.dataset.permissionTool}"]`,
        );
        row.dataset.permissionScope = event.currentTarget.value;
      });
    renderPermissionTool(permissionStage.dataset.permissionTool || "deploy");

    permissionStage
      .querySelector("[data-permission-confirm]")
      .addEventListener("click", () => {
        permissionEditor.hidden = true;
        permissionSentLabel.textContent = "Permission response confirmed";
        permissionSent.hidden = false;
      });
    permissionStage
      .querySelector("[data-permission-request-changes]")
      .addEventListener("click", () => {
        permissionEditor.hidden = true;
        permissionSent.hidden = true;
        permissionRevisionForm.hidden = false;
        permissionRevisionForm.querySelector("input").focus();
      });
    permissionStage
      .querySelector("[data-permission-revision-cancel]")
      .addEventListener("click", () => {
        permissionRevisionForm.reset();
        permissionRevisionForm.hidden = true;
        permissionEditor.hidden = false;
      });
    permissionRevisionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!permissionRevisionForm.reportValidity()) return;
      permissionRevisionForm.hidden = true;
      permissionSentLabel.textContent = "Revision requested";
      permissionSent.hidden = false;
    });
  }
};

const setupContextStage = (element) => {
  const contextStage = element.querySelector(".context-pack-stage");
  if (contextStage) {
    const renderContextSource = (source) => {
      contextStage.dataset.contextSource = source;
      contextStage
        .querySelectorAll("[data-context-source-option]")
        .forEach((button) => {
          button.setAttribute(
            "aria-pressed",
            String(button.dataset.contextSourceOption === source),
          );
        });
      contextStage
        .querySelectorAll("[data-context-source-row]")
        .forEach((row) => {
          row.toggleAttribute(
            "data-selected",
            row.dataset.contextSourceRow === source,
          );
        });
      contextStage.querySelectorAll("[data-context-edge]").forEach((edge) => {
        edge.toggleAttribute(
          "data-active",
          edge.dataset.contextEdge === source,
        );
      });
      contextStage
        .querySelectorAll("[data-context-target-port]")
        .forEach((port) => {
          port.toggleAttribute(
            "data-active",
            port.dataset.contextTargetPort === source,
          );
        });
      contextStage
        .querySelectorAll("[data-context-evidence-port]")
        .forEach((port) => {
          port.toggleAttribute(
            "data-active",
            port.dataset.contextEvidencePort === source,
          );
        });
      contextStage
        .querySelectorAll("[data-context-evidence-for]")
        .forEach((section) => {
          section.toggleAttribute(
            "data-evidence-active",
            section.dataset.contextEvidenceFor === source,
          );
        });
      contextStage
        .querySelectorAll("[data-context-citation]")
        .forEach((line) => {
          line.toggleAttribute(
            "data-cited",
            line.dataset.contextCitation === source,
          );
        });
    };

    contextStage
      .querySelectorAll("[data-context-source-option]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          renderContextSource(button.dataset.contextSourceOption);
        });
      });
    renderContextSource(contextStage.dataset.contextSource || "implementation");
  }
};

customElements.define(
  "setta-workspace",
  class extends HTMLElement {
    connectedCallback() {
      renderWorkspace(this);
      setupChoiceStage(this);
      setupCandidateStage(this);
      setupPermissionStage(this);
      setupContextStage(this);
    }
  },
);
