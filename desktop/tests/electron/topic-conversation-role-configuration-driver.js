/* global Event, HTMLButtonElement, HTMLSelectElement, document, window */

(() => {
  const version = "setta-topic-conversation-role-configuration-driver-v3";
  const driver = globalThis.__settaE2EDriver;
  if (!driver) {
    throw new Error("base Setta E2E driver is not installed");
  }
  Object.assign(driver, {
    topicConversationRoleConfigurationVersion: version,
    roleConfigurationConfigureConversationAgent,
    roleConfigurationCreateTopic,
    roleConfigurationForkState,
    roleConfigurationGlobalAgent,
    roleConfigurationOpenSettings,
    roleConfigurationOpenTab,
    roleConfigurationResetConversationAgent,
    roleConfigurationResetGlobalAgent,
    roleConfigurationResetWorkspaceAgent,
    roleConfigurationSave,
    roleConfigurationSelectAgentModel,
    roleConfigurationSelectScope,
    roleConfigurationSettingsState,
    roleConfigurationSubmitInput,
    roleConfigurationTurnState,
    roleConfigurationWorkspaceAgent,
  });

  function roleConfigurationOpenSettings() {
    if (document.querySelector("#settings-subtab-roles")) {
      return { opened: false, ready: true };
    }
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === "Open settings",
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { opened: false, ready: false };
    }
    button.click();
    return { opened: true, ready: false };
  }

  function roleConfigurationOpenTab() {
    const button = document.querySelector("#settings-subtab-roles");
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { clicked: false };
    }
    button.click();
    return { clicked: true };
  }

  function roleConfigurationSettingsState() {
    const form = document.querySelector('[data-testid="role-configuration-settings"]');
    if (!form) {
      return unavailableRoleConfigurationSettingsState();
    }
    return populatedRoleConfigurationSettingsState(form);
  }

  function unavailableRoleConfigurationSettingsState() {
    return {
      agentEffort: "",
      agentModel: "",
      catalogStatus: "",
      dirty: false,
      effortControlCount: 0,
      modelControlCount: 0,
      modelOptionCount: 0,
      roles: [],
      scope: "",
    };
  }

  function populatedRoleConfigurationSettingsState(form) {
    const agentModel = form.querySelector('select[aria-label="Agent model"]');
    const agentEffort = form.querySelector('select[aria-label="Agent reasoning effort"]');
    const status = elementText(form.querySelector('[role="status"]'));
    return {
      agentEffort: selectValue(agentEffort),
      agentModel: selectValue(agentModel),
      catalogStatus: status,
      dirty: status === "Unsaved role configuration changes",
      effortControlCount: form.querySelectorAll('select[aria-label$=" reasoning effort"]').length,
      modelControlCount: form.querySelectorAll('select[aria-label$=" model"]').length,
      modelOptionCount: selectOptionCount(agentModel),
      roles: Array.from(form.querySelectorAll("fieldset")).map(roleName),
      scope: form.getAttribute("data-role-configuration-scope") ?? "",
    };
  }

  function selectOptionCount(element) {
    return element instanceof HTMLSelectElement ? element.options.length : 0;
  }

  function roleName(fieldset) {
    const label = fieldset.querySelector("h3")?.textContent?.trim() ?? "";
    return {
      Agent: "agent",
      Master: "master",
      Narrator: "narrator",
      "Side agent": "side_agent",
    }[label];
  }

  function selectValue(element) {
    return element instanceof HTMLSelectElement ? element.value : "";
  }

  function elementText(element) {
    return element?.textContent?.trim() ?? "";
  }

  function roleConfigurationSelectAgentModel({ modelId }) {
    const select = document.querySelector('select[aria-label="Agent model"]');
    if (!(select instanceof HTMLSelectElement)) {
      return { changed: false };
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (!setter) {
      return { changed: false };
    }
    setter.call(select, modelId);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { changed: true };
  }

  function roleConfigurationSelectScope({ scope }) {
    const select = document.querySelector('select[aria-label="AI role configuration scope"]');
    if (!(select instanceof HTMLSelectElement)) {
      return { changed: false };
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (!setter) {
      return { changed: false };
    }
    setter.call(select, scope);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { changed: true };
  }

  function roleConfigurationSave() {
    return clickRoleConfigurationButton("Save", "saved");
  }

  function roleConfigurationResetGlobalAgent() {
    return clickRoleConfigurationButton("Use built-in agent", "reset");
  }

  function roleConfigurationResetWorkspaceAgent() {
    return clickRoleConfigurationButton("Use inherited agent", "reset");
  }

  function clickRoleConfigurationButton(label, resultField) {
    const form = document.querySelector('[data-testid="role-configuration-settings"]');
    const button = Array.from(form?.querySelectorAll("button") ?? []).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { [resultField]: false };
    }
    button.click();
    return { [resultField]: true };
  }

  async function roleConfigurationGlobalAgent() {
    const configuration = await requireRolesAPI().readGlobal();
    return roleAgentSummary(configuration);
  }

  async function roleConfigurationWorkspaceAgent({ workspaceId }) {
    const configuration = await requireRolesAPI().readWorkspace({ workspaceId });
    return roleAgentSummary(configuration);
  }

  async function roleConfigurationCreateTopic({ title, workspaceId }) {
    const snapshot = await window.setta.conversations.create({ title, workspaceId });
    return {
      conversationId: snapshot.conversation.id,
      model: snapshot.threadBinding?.providerMetadata.model ?? "",
      threadId: snapshot.threadBinding?.threadId ?? "",
    };
  }

  async function roleConfigurationConfigureConversationAgent({
    conversationId,
    effort,
    modelId,
    workspaceId,
  }) {
    const roles = requireRolesAPI();
    const request = { conversationId, workspaceId };
    const configuration = await roles.readConversation(request);
    const profile = JSON.parse(JSON.stringify(findAgent(configuration).effective));
    profile.modelSelection = { mode: "exact", modelId };
    profile.reasoningEffort = effort;
    const updated = await roles.updateConversation({
      ...request,
      updates: [{ profile, role: "agent" }],
    });
    return roleAgentSummary(updated);
  }

  async function roleConfigurationSubmitInput({ conversationId, inputId, sourcePaneId, text }) {
    await window.setta.conversations.submitInput({
      input: {
        conversationId,
        id: inputId,
        modality: "text",
        replyToInputId: null,
        sourcePaneId,
        submittedAt: new Date().toISOString(),
        text,
      },
    });
    return { submitted: true };
  }

  async function roleConfigurationTurnState({ conversationId, text, workspaceId }) {
    const snapshot = await window.setta.conversations.read({ conversationId, workspaceId });
    const turn = snapshot.turns.turns.find((candidate) => candidate.authoredInput.text === text);
    return {
      requestedModel: roleConfigurationTurnRequestedModel(turn),
      resolvedModel: roleConfigurationTurnResolvedModel(turn),
      status: turn?.status ?? "",
    };
  }

  async function roleConfigurationForkState({ title, workspaceId }) {
    const page = await window.setta.conversations.list({
      cursor: null,
      limit: 100,
      query: title,
      workspaceId,
    });
    const item = page.items.find((candidate) => candidate.conversation.title === title);
    if (!item) {
      return emptyRoleConfigurationForkState();
    }
    const snapshot = await window.setta.conversations.read({
      conversationId: item.conversation.id,
      workspaceId,
    });
    return populatedRoleConfigurationForkState(item, snapshot, title);
  }

  function populatedRoleConfigurationForkState(item, snapshot, title) {
    const turn = snapshot.turns.turns.find((candidate) => candidate.authoredInput.text === title);
    return {
      conversationId: item.conversation.id,
      parentConversationId: snapshot.branch?.parentConversationId ?? "",
      requestedModel: roleConfigurationTurnRequestedModel(turn),
      resolvedModel: roleConfigurationTurnResolvedModel(turn),
      status: turn?.status ?? "",
      threadModel: snapshot.threadBinding?.providerMetadata.model ?? "",
    };
  }

  function roleConfigurationTurnRequestedModel(turn) {
    return turn?.requestedRoleProfile.modelSelection.modelId ?? "";
  }

  function roleConfigurationTurnResolvedModel(turn) {
    return turn?.resolvedInvocation?.resolved.modelId ?? "";
  }

  function emptyRoleConfigurationForkState() {
    return {
      conversationId: "",
      parentConversationId: "",
      requestedModel: "",
      resolvedModel: "",
      status: "",
      threadModel: "",
    };
  }

  async function roleConfigurationResetConversationAgent({ conversationId, workspaceId }) {
    const updated = await requireRolesAPI().updateConversation({
      conversationId,
      updates: [{ profile: null, role: "agent" }],
      workspaceId,
    });
    return roleAgentSummary(updated);
  }

  function roleAgentSummary(configuration) {
    const agent = findAgent(configuration);
    return {
      effectiveSource: agent.effectiveSource,
      hasOverride: agent.override !== null,
      modelId: agent.resolved.modelId,
    };
  }

  function findAgent(configuration) {
    const agent = configuration.profiles.find((profile) => profile.role === "agent");
    if (!agent) {
      throw new Error("role configuration omitted agent");
    }
    return agent;
  }

  function requireRolesAPI() {
    if (!window.setta.roles) {
      throw new Error("role configuration API is unavailable");
    }
    return window.setta.roles;
  }
})();
