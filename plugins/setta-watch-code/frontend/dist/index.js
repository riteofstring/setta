const p = "null";
const w = {
  id: p,
  watchCodeEnabled: !1,
  watchCodeFolders: [],
  watchCodeFiles: []
};
function v(r) {
  const t = new C(r);
  return {
    renderer: {
      mount: (e, n) => t.mount(e, n),
      update: (e, n) => t.update(e, n),
      unmount: (e) => t.unmount(e)
    },
    revealSetting: (e) => t.revealSetting(e)
  };
}
class C {
  constructor(t) {
    this.mounts = /* @__PURE__ */ new Map(), this.projectConfig = w, this.localFolders = [], this.localFiles = [], this.unsubscribeProjectState = null, this.portalElement = null, this.portalAnchor = null, this.pendingMutation = !1, this.errorMessage = null, this.removeDocumentListeners = null, this.host = t;
  }
  mount(t, e) {
    this.ensureProjectSubscription();
    const n = document.createElement("button");
    n.type = "button", n.className = "setta-watch-code-control", n.dataset.testid = "rf__watch-code-settings", n.setAttribute("aria-label", e.label), n.innerHTML = b(), n.addEventListener("click", () => {
      if (this.portalElement) {
        this.closePortal();
        return;
      }
      this.openPortal(n);
    }), t.textContent = "", t.append(n), this.mounts.set(t, n), this.renderControlButton(n);
  }
  update(t, e) {
    const n = this.mounts.get(t);
    n && (n.setAttribute("aria-label", e.label), this.renderControlButton(n));
  }
  unmount(t) {
    const e = this.mounts.get(t);
    e && this.portalAnchor === e && this.closePortal(), this.mounts.delete(t), t.textContent = "", this.mounts.size === 0 && (this.unsubscribeProjectState?.(), this.unsubscribeProjectState = null, this.closePortal());
  }
  async revealSetting(t) {
    if (t.abortSignal.aborted)
      return !1;
    const e = this.firstButton();
    if (!e || (this.openPortal(e), await M(), t.abortSignal.aborted))
      return !1;
    const n = this.findSettingAnchor(t.settingId);
    if (!n)
      return !1;
    n.scrollIntoView({
      behavior: A() ? "auto" : "smooth",
      block: "center",
      inline: "nearest"
    }), n.classList.add("setta-watch-code-reveal-highlight");
    const s = window.setTimeout(
      () => {
        n.classList.remove("setta-watch-code-reveal-highlight");
      },
      Math.max(0, t.durationMs)
    );
    return t.abortSignal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(s), n.classList.remove("setta-watch-code-reveal-highlight");
      },
      { once: !0 }
    ), !0;
  }
  ensureProjectSubscription() {
    this.unsubscribeProjectState || (this.applyProjectConfig(
      m(
        this.host.readProjectState({ kind: "projectConfig" })
      )
    ), this.unsubscribeProjectState = this.host.subscribeProjectState(
      { kind: "projectConfig" },
      (t) => {
        this.applyProjectConfig(m(t));
      },
      { fireImmediately: !0 }
    ));
  }
  applyProjectConfig(t) {
    this.projectConfig = t, this.localFolders = f(t.watchCodeFolders), this.localFiles = t.watchCodeFiles.slice(), this.render();
  }
  render() {
    for (const t of this.mounts.values())
      this.renderControlButton(t);
    this.portalElement && (this.renderPortal(), this.updatePortalPosition());
  }
  renderControlButton(t) {
    const e = this.projectConfig.watchCodeEnabled;
    t.classList.toggle("is-active", e), t.setAttribute("aria-pressed", e ? "true" : "false");
  }
  firstButton() {
    for (const t of this.mounts.values())
      return t;
    return null;
  }
  openPortal(t) {
    this.portalAnchor = t, this.portalElement || (this.portalElement = document.createElement("aside"), this.portalElement.className = "setta-watch-code-panel", this.portalElement.dataset.testid = "rf__watch-code-settings-portal", this.portalElement.setAttribute("aria-label", "Watch code settings"), document.body.append(this.portalElement), this.installDocumentListeners()), this.renderPortal(), this.updatePortalPosition();
  }
  closePortal() {
    this.removeDocumentListeners?.(), this.removeDocumentListeners = null, this.portalElement?.remove(), this.portalElement = null, this.portalAnchor = null;
  }
  installDocumentListeners() {
    if (this.removeDocumentListeners)
      return;
    const t = (s) => {
      const o = s.target;
      o && (this.portalElement?.contains(o) || this.portalAnchor?.contains(o) || this.closePortal());
    }, e = (s) => {
      s.key === "Escape" && this.closePortal();
    }, n = () => this.updatePortalPosition();
    document.addEventListener("pointerdown", t, !0), document.addEventListener("keydown", e), window.addEventListener("resize", n), window.addEventListener("scroll", n, !0), this.removeDocumentListeners = () => {
      document.removeEventListener("pointerdown", t, !0), document.removeEventListener("keydown", e), window.removeEventListener("resize", n), window.removeEventListener("scroll", n, !0);
    };
  }
  renderPortal() {
    const t = this.portalElement;
    t && (t.textContent = "", t.append(
      this.renderPanelHeader(),
      this.renderEnabledControl(),
      this.renderError(),
      this.renderInputGroup({
        settingId: "core.watch_code.folders",
        title: "Watch Folders",
        emptyLabel: "No folders yet.",
        addLabel: "Add Folder",
        add: () => {
          this.localFolders = [
            ...this.localFolders,
            { path: "", recursive: !0 }
          ], this.renderPortal();
        },
        rows: this.localFolders.map(
          (e, n) => this.renderFolderRow(e, n)
        )
      }),
      this.renderInputGroup({
        settingId: "core.watch_code.files",
        title: "Watch Files",
        emptyLabel: "No files yet.",
        addLabel: "Add File",
        add: () => {
          this.localFiles = [...this.localFiles, ""], this.renderPortal();
        },
        rows: this.localFiles.map(
          (e, n) => this.renderFileRow(e, n)
        )
      })
    ));
  }
  renderPanelHeader() {
    const t = document.createElement("div");
    t.className = "setta-watch-code-panel-header";
    const e = document.createElement("h2");
    e.textContent = "Watch Code";
    const n = document.createElement("button");
    return n.type = "button", n.className = "setta-watch-code-icon-button", n.setAttribute("aria-label", "Close watch code settings"), n.innerHTML = L(), n.addEventListener("click", () => this.closePortal()), t.append(e, n), t;
  }
  renderEnabledControl() {
    const t = document.createElement("div");
    t.className = "setta-watch-code-enabled-row", t.dataset.settingAnchor = "core.watch_code.enabled";
    const e = document.createElement("button");
    return e.type = "button", e.className = "setta-watch-code-toggle", e.classList.toggle("is-active", this.projectConfig.watchCodeEnabled), e.disabled = this.inputsDisabled(), e.setAttribute(
      "aria-pressed",
      String(this.projectConfig.watchCodeEnabled)
    ), e.setAttribute(
      "aria-label",
      this.projectConfig.watchCodeEnabled ? "Disable Watch Code" : "Enable Watch Code"
    ), e.innerHTML = `${b()}<span>${this.projectConfig.watchCodeEnabled ? "Enabled" : "Disabled"}</span>`, e.addEventListener("click", () => {
      this.setEnabled(!this.projectConfig.watchCodeEnabled);
    }), t.append(e), t;
  }
  renderError() {
    const t = document.createElement("p");
    return t.className = "setta-watch-code-error", t.hidden = !this.errorMessage, t.textContent = this.errorMessage ?? "", t;
  }
  renderInputGroup({
    settingId: t,
    title: e,
    emptyLabel: n,
    addLabel: s,
    add: o,
    rows: i
  }) {
    const a = document.createElement("section");
    a.className = "setta-watch-code-input-group", a.dataset.settingAnchor = t;
    const c = document.createElement("div");
    c.className = "setta-watch-code-input-group-header";
    const d = document.createElement("h3");
    d.textContent = e;
    const l = document.createElement("button");
    if (l.type = "button", l.className = "setta-watch-code-add-button", l.disabled = this.inputsDisabled(), l.innerHTML = `${_()}<span>${s}</span>`, l.addEventListener("click", o), c.append(d, l), a.append(c), i.length === 0) {
      const u = document.createElement("p");
      return u.className = "setta-watch-code-empty", u.textContent = n, a.append(u), a;
    }
    const h = document.createElement("div");
    return h.className = "setta-watch-code-row-list", h.append(...i), a.append(h), a;
  }
  renderFolderRow(t, e) {
    const n = document.createElement("div");
    n.className = "setta-watch-code-input-row";
    const s = this.renderPathInput({
      value: t.path,
      placeholder: "relative/path/to/folder",
      onInput: (c) => {
        this.localFolders[e] = {
          ...this.localFolders[e],
          path: c
        };
      },
      onCommit: () => void this.persistInputs()
    }), o = document.createElement("button");
    o.type = "button", o.className = "setta-watch-code-icon-button", o.classList.toggle("is-active", t.recursive), o.disabled = this.inputsDisabled(), o.setAttribute("aria-label", "Toggle recursive watch"), o.setAttribute("aria-pressed", String(t.recursive)), o.innerHTML = I(), o.addEventListener("click", () => {
      this.localFolders[e] = {
        ...this.localFolders[e],
        recursive: !t.recursive
      }, this.persistInputs(), this.renderPortal();
    });
    const i = this.renderRemoveButton(
      "Remove folder watch path",
      () => {
        this.localFolders = this.localFolders.filter(
          (c, d) => d !== e
        ), this.persistInputs(), this.renderPortal();
      }
    ), a = document.createElement("div");
    return a.className = "setta-watch-code-row-actions", a.append(o, i), n.append(s, a), n;
  }
  renderFileRow(t, e) {
    const n = document.createElement("div");
    n.className = "setta-watch-code-input-row";
    const s = this.renderPathInput({
      value: t,
      placeholder: "relative/path/to/file.py",
      onInput: (a) => {
        this.localFiles[e] = a;
      },
      onCommit: () => void this.persistInputs()
    }), o = this.renderRemoveButton(
      "Remove file watch path",
      () => {
        this.localFiles = this.localFiles.filter(
          (a, c) => c !== e
        ), this.persistInputs(), this.renderPortal();
      }
    ), i = document.createElement("div");
    return i.className = "setta-watch-code-row-actions", i.append(o), n.append(s, i), n;
  }
  renderPathInput({
    value: t,
    placeholder: e,
    onInput: n,
    onCommit: s
  }) {
    const o = document.createElement("input");
    return o.className = "setta-watch-code-path-input", o.disabled = this.inputsDisabled(), o.value = t, o.placeholder = e, o.addEventListener("input", () => n(o.value)), o.addEventListener("blur", s), o.addEventListener("keydown", (i) => {
      i.key === "Enter" && o.blur();
    }), o;
  }
  renderRemoveButton(t, e) {
    const n = document.createElement("button");
    return n.type = "button", n.className = "setta-watch-code-icon-button is-danger", n.disabled = this.inputsDisabled(), n.setAttribute("aria-label", t), n.innerHTML = F(), n.addEventListener("click", e), n;
  }
  updatePortalPosition() {
    if (!this.portalElement || !this.portalAnchor)
      return;
    const t = this.portalAnchor.getBoundingClientRect(), e = this.portalElement.getBoundingClientRect().height || 360, n = Math.max(
      280,
      window.innerWidth - 24
    ), s = Math.min(352, n), o = t.right + 12, i = window.innerWidth - 12 - s, a = Math.max(12, Math.min(o, i)), c = 12, d = Math.max(
      c,
      window.innerHeight - 12 - e
    ), l = Math.max(c, Math.min(t.top - 24, d));
    this.portalElement.style.left = `${a}px`, this.portalElement.style.top = `${l}px`, this.portalElement.style.width = `${s}px`;
  }
  inputsDisabled() {
    return this.pendingMutation || this.host.serverMode !== "ide" || this.projectConfig.id === "" || this.projectConfig.id === p;
  }
  async setEnabled(t) {
    if (!this.inputsDisabled()) {
      this.pendingMutation = !0, this.errorMessage = null, this.render();
      try {
        await this.host.setWatchCodeEnabled({
          projectConfigId: this.projectConfig.id,
          enabled: t
        }) || (this.errorMessage = "Watch Code update failed.");
      } catch (e) {
        this.errorMessage = g(e);
      } finally {
        this.pendingMutation = !1, this.render();
      }
    }
  }
  async persistInputs() {
    if (!this.inputsDisabled()) {
      this.pendingMutation = !0, this.errorMessage = null, this.renderControlButtonsOnly();
      try {
        await this.host.setWatchCodeInputs({
          projectConfigId: this.projectConfig.id,
          watchCodeFolders: f(this.localFolders),
          watchCodeFiles: this.localFiles.slice()
        }) || (this.errorMessage = "Watch Code inputs were not saved.");
      } catch (t) {
        this.errorMessage = g(t);
      } finally {
        this.pendingMutation = !1, this.render();
      }
    }
  }
  renderControlButtonsOnly() {
    for (const t of this.mounts.values())
      this.renderControlButton(t);
  }
  findSettingAnchor(t) {
    const e = this.portalElement;
    if (!e)
      return null;
    const n = y(t), s = e.querySelector(
      `[data-setting-anchor="${n}"]`
    );
    return s?.dataset.settingAnchor === t ? s : null;
  }
}
function m(r) {
  if (!r || typeof r != "object")
    return w;
  const t = r;
  return {
    id: typeof t.id == "string" ? t.id : p,
    watchCodeEnabled: t.watchCodeEnabled === !0,
    watchCodeFolders: E(t.watchCodeFolders),
    watchCodeFiles: P(t.watchCodeFiles)
  };
}
function E(r) {
  return Array.isArray(r) ? r.flatMap((t) => {
    if (!t || typeof t != "object" || Array.isArray(t))
      return [];
    const e = t;
    return typeof e.path != "string" ? [] : [
      {
        path: e.path,
        recursive: e.recursive === !0
      }
    ];
  }) : [];
}
function P(r) {
  return Array.isArray(r) ? r.filter((t) => typeof t == "string") : [];
}
function f(r) {
  return r.map((t) => ({ ...t }));
}
function g(r) {
  return r instanceof Error && r.message.trim() !== "" ? r.message : "Watch Code update failed.";
}
function M() {
  return new Promise((r) => {
    window.requestAnimationFrame(() => r());
  });
}
function A() {
  return typeof window.matchMedia == "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function y(r) {
  const t = globalThis.CSS;
  return t && typeof t.escape == "function" ? t.escape(r) : r.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
function b() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M12 12l5-5"></path><path d="M12 4v2"></path><path d="M20 12h-2"></path><path d="M12 20v-2"></path><path d="M4 12h2"></path></svg>';
}
function L() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
}
function _() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>';
}
function I() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l4 4-4 4"></path><path d="M3 11V9a3 3 0 0 1 3-3h15"></path><path d="M7 22l-4-4 4-4"></path><path d="M21 13v2a3 3 0 0 1-3 3H3"></path></svg>';
}
function F() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5"></path><path d="M14 11v5"></path></svg>';
}
const T = 1, R = [
  "registerCanvasControl",
  "registerSettingRevealHandler",
  "readProjectState",
  "subscribeProjectState",
  "mutateWatchCodeSettings"
];
function N(r) {
  const t = j(r);
  if (!t || !S(t.effectiveCapabilities))
    return;
  const e = v(t);
  t.registerCanvasControl({
    id: "watch-code",
    label: "Watch Code",
    description: "Watch Code settings",
    placement: "project",
    order: 20,
    renderer: e.renderer
  }), t.registerSettingRevealHandler(
    "watch-code-settings",
    e.revealSetting
  );
}
function S(r) {
  const t = new Set(r);
  return R.every((e) => t.has(e));
}
function j(r) {
  if (!r || typeof r != "object")
    return null;
  const t = r;
  return t.apiVersion !== T || typeof t.pluginId != "string" || typeof t.serverMode != "string" || !Array.isArray(t.effectiveCapabilities) || typeof t.registerCanvasControl != "function" || typeof t.registerSettingRevealHandler != "function" || typeof t.readProjectState != "function" || typeof t.subscribeProjectState != "function" || typeof t.setWatchCodeEnabled != "function" || typeof t.setWatchCodeInputs != "function" ? null : t;
}
export {
  T as apiVersion,
  N as register
};
