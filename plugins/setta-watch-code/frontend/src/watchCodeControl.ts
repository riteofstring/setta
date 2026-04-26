import type {
  SettaPluginCanvasControlProps,
  SettaPluginCanvasControlRenderer,
  SettaPluginHost,
  SettaPluginSettingRevealHandlerContext,
} from "@setta/app-subsystem-frontend-sdk";
import {
  WATCH_CODE_BACKEND_LOCAL_SETTING_ENABLED,
  WATCH_CODE_BACKEND_LOCAL_SETTING_FILES,
  WATCH_CODE_BACKEND_LOCAL_SETTING_FOLDERS,
  WATCH_CODE_BACKEND_ROUTE_BASE_PATH,
  WATCH_CODE_BACKEND_ROUTE_SUFFIX_ENABLED,
  WATCH_CODE_BACKEND_ROUTE_SUFFIX_INPUTS,
} from "./generated/watchCodeBackendContract";

export type WatchCodeFolder = {
  path: string;
  recursive: boolean;
};

type WatchCodeProjectData = {
  projectConfigId: string;
  enabled: boolean;
  folders: WatchCodeFolder[];
  files: string[];
};

export type WatchCodePluginHost = SettaPluginHost;

const NULL_PROJECT_CONFIG_ID = "null";
const PORTAL_MIN_WIDTH_PX = 280;
const PORTAL_MAX_WIDTH_PX = 352;
const PORTAL_MARGIN_PX = 12;
const PORTAL_BUTTON_GAP_PX = 12;
const PORTAL_ESTIMATED_HEIGHT_PX = 360;
const WATCH_CODE_ENABLED_ROUTE = `${WATCH_CODE_BACKEND_ROUTE_BASE_PATH}/${WATCH_CODE_BACKEND_ROUTE_SUFFIX_ENABLED}`;
const WATCH_CODE_INPUTS_ROUTE = `${WATCH_CODE_BACKEND_ROUTE_BASE_PATH}/${WATCH_CODE_BACKEND_ROUTE_SUFFIX_INPUTS}`;
const EMPTY_WATCH_CODE_PROJECT_DATA: WatchCodeProjectData = {
  projectConfigId: NULL_PROJECT_CONFIG_ID,
  enabled: false,
  folders: [],
  files: [],
};
type WatchCodeLocalSettingId =
  | typeof WATCH_CODE_BACKEND_LOCAL_SETTING_ENABLED
  | typeof WATCH_CODE_BACKEND_LOCAL_SETTING_FOLDERS
  | typeof WATCH_CODE_BACKEND_LOCAL_SETTING_FILES;

export function createWatchCodeControl(host: WatchCodePluginHost): {
  renderer: SettaPluginCanvasControlRenderer;
  revealSetting: (
    context: SettaPluginSettingRevealHandlerContext,
  ) => Promise<boolean>;
} {
  const controller = new WatchCodeControlController(host);
  return {
    renderer: {
      mount: (el, props) => controller.mount(el, props),
      update: (el, props) => controller.update(el, props),
      unmount: (el) => controller.unmount(el),
    },
    revealSetting: (context) => controller.revealSetting(context),
  };
}

class WatchCodeControlController {
  private readonly host: WatchCodePluginHost;
  private readonly mounts = new Map<HTMLElement, HTMLButtonElement>();
  private watchCodeData: WatchCodeProjectData = EMPTY_WATCH_CODE_PROJECT_DATA;
  private localFolders: WatchCodeFolder[] = [];
  private localFiles: string[] = [];
  private unsubscribeProjectContext: (() => void) | null = null;
  private unsubscribeWatchCodeData: (() => void) | null = null;
  private portalElement: HTMLElement | null = null;
  private portalAnchor: HTMLButtonElement | null = null;
  private pendingMutation = false;
  private errorMessage: string | null = null;
  private removeDocumentListeners: (() => void) | null = null;

  constructor(host: WatchCodePluginHost) {
    this.host = host;
  }

  mount(el: HTMLElement, props: SettaPluginCanvasControlProps): void {
    this.ensureProjectSubscription();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "setta-watch-code-control";
    button.dataset.testid = "rf__watch-code-settings";
    button.setAttribute("aria-label", props.label);
    button.innerHTML = radarIconMarkup();
    button.addEventListener("click", () => {
      if (this.portalElement) {
        this.closePortal();
        return;
      }
      this.openPortal(button);
    });
    el.textContent = "";
    el.append(button);
    this.mounts.set(el, button);
    this.renderControlButton(button);
  }

  update(el: HTMLElement, props: SettaPluginCanvasControlProps): void {
    const button = this.mounts.get(el);
    if (!button) {
      return;
    }
    button.setAttribute("aria-label", props.label);
    this.renderControlButton(button);
  }

  unmount(el: HTMLElement): void {
    const button = this.mounts.get(el);
    if (button && this.portalAnchor === button) {
      this.closePortal();
    }
    this.mounts.delete(el);
    el.textContent = "";
    if (this.mounts.size === 0) {
      this.unsubscribeProjectContext?.();
      this.unsubscribeProjectContext = null;
      this.unsubscribeWatchCodeData?.();
      this.unsubscribeWatchCodeData = null;
      this.closePortal();
    }
  }

  async revealSetting(
    context: SettaPluginSettingRevealHandlerContext,
  ): Promise<boolean> {
    if (context.abortSignal.aborted) {
      return false;
    }
    const button = this.firstButton();
    if (!button) {
      return false;
    }
    this.openPortal(button);
    await animationFrame();
    if (context.abortSignal.aborted) {
      return false;
    }
    const target = this.findSettingAnchor(context.settingId);
    if (!target) {
      return false;
    }
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
    target.classList.add("setta-watch-code-reveal-highlight");
    const timeoutId = window.setTimeout(
      () => {
        target.classList.remove("setta-watch-code-reveal-highlight");
      },
      Math.max(0, context.durationMs),
    );
    context.abortSignal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeoutId);
        target.classList.remove("setta-watch-code-reveal-highlight");
      },
      { once: true },
    );
    return true;
  }

  private ensureProjectSubscription(): void {
    if (this.unsubscribeProjectContext || this.unsubscribeWatchCodeData) {
      return;
    }
    this.applyCurrentProjectData(this.host.getProjectContext().projectConfigId);
    this.unsubscribeProjectContext = this.host.subscribeProjectContext(
      (context) => {
        this.applyCurrentProjectData(context.projectConfigId);
      },
    );
    this.unsubscribeWatchCodeData = this.host.subscribeProjectState(
      { kind: "pluginData", pluginId: this.host.pluginId },
      (nextValue) => {
        this.applyWatchCodeProjectData(
          normalizeWatchCodeProjectData(nextValue),
        );
      },
      { fireImmediately: true },
    );
  }

  private applyCurrentProjectData(projectConfigId: string): void {
    const projectData = normalizeWatchCodeProjectData(
      this.host.readProjectState({
        kind: "pluginData",
        pluginId: this.host.pluginId,
      }),
    );
    this.watchCodeData = {
      projectConfigId,
      ...projectData,
    };
    this.localFolders = cloneFolders(projectData.folders);
    this.localFiles = projectData.files.slice();
    this.render();
  }

  private applyWatchCodeProjectData(
    projectData: Omit<WatchCodeProjectData, "projectConfigId">,
  ): void {
    this.watchCodeData = {
      ...this.watchCodeData,
      ...projectData,
    };
    this.localFolders = cloneFolders(projectData.folders);
    this.localFiles = projectData.files.slice();
    this.render();
  }

  private render(): void {
    for (const button of this.mounts.values()) {
      this.renderControlButton(button);
    }
    if (this.portalElement) {
      this.renderPortal();
      this.updatePortalPosition();
    }
  }

  private renderControlButton(button: HTMLButtonElement): void {
    const enabled = this.watchCodeData.enabled;
    button.classList.toggle("is-active", enabled);
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
  }

  private firstButton(): HTMLButtonElement | null {
    for (const button of this.mounts.values()) {
      return button;
    }
    return null;
  }

  private openPortal(anchor: HTMLButtonElement): void {
    this.portalAnchor = anchor;
    if (!this.portalElement) {
      this.portalElement = document.createElement("aside");
      this.portalElement.className = "setta-watch-code-panel";
      this.portalElement.dataset.testid = "rf__watch-code-settings-portal";
      this.portalElement.setAttribute("aria-label", "Watch code settings");
      document.body.append(this.portalElement);
      this.installDocumentListeners();
    }
    this.renderPortal();
    this.updatePortalPosition();
  }

  private closePortal(): void {
    this.removeDocumentListeners?.();
    this.removeDocumentListeners = null;
    this.portalElement?.remove();
    this.portalElement = null;
    this.portalAnchor = null;
  }

  private installDocumentListeners(): void {
    if (this.removeDocumentListeners) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (
        this.portalElement?.contains(target) ||
        this.portalAnchor?.contains(target)
      ) {
        return;
      }
      this.closePortal();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        this.closePortal();
      }
    };
    const onViewportChange = () => this.updatePortalPosition();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    this.removeDocumentListeners = () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }

  private renderPortal(): void {
    const portal = this.portalElement;
    if (!portal) {
      return;
    }
    portal.textContent = "";
    portal.append(
      this.renderPanelHeader(),
      this.renderEnabledControl(),
      this.renderError(),
      this.renderInputGroup({
        settingId: this.pluginSettingId(
          WATCH_CODE_BACKEND_LOCAL_SETTING_FOLDERS,
        ),
        title: "Watch Folders",
        emptyLabel: "No folders yet.",
        addLabel: "Add Folder",
        add: () => {
          this.localFolders = [
            ...this.localFolders,
            { path: "", recursive: true },
          ];
          this.renderPortal();
        },
        rows: this.localFolders.map((folder, index) =>
          this.renderFolderRow(folder, index),
        ),
      }),
      this.renderInputGroup({
        settingId: this.pluginSettingId(WATCH_CODE_BACKEND_LOCAL_SETTING_FILES),
        title: "Watch Files",
        emptyLabel: "No files yet.",
        addLabel: "Add File",
        add: () => {
          this.localFiles = [...this.localFiles, ""];
          this.renderPortal();
        },
        rows: this.localFiles.map((file, index) =>
          this.renderFileRow(file, index),
        ),
      }),
    );
  }

  private renderPanelHeader(): HTMLElement {
    const header = document.createElement("div");
    header.className = "setta-watch-code-panel-header";
    const title = document.createElement("h2");
    title.textContent = "Watch Code";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "setta-watch-code-icon-button";
    closeButton.setAttribute("aria-label", "Close watch code settings");
    closeButton.innerHTML = closeIconMarkup();
    closeButton.addEventListener("click", () => this.closePortal());
    header.append(title, closeButton);
    return header;
  }

  private renderEnabledControl(): HTMLElement {
    const row = document.createElement("div");
    row.className = "setta-watch-code-enabled-row";
    row.dataset.settingAnchor = this.pluginSettingId(
      WATCH_CODE_BACKEND_LOCAL_SETTING_ENABLED,
    );
    const button = document.createElement("button");
    button.type = "button";
    button.className = "setta-watch-code-toggle";
    button.classList.toggle("is-active", this.watchCodeData.enabled);
    button.disabled = this.inputsDisabled();
    button.setAttribute("aria-pressed", String(this.watchCodeData.enabled));
    button.setAttribute(
      "aria-label",
      this.watchCodeData.enabled ? "Disable Watch Code" : "Enable Watch Code",
    );
    button.innerHTML = `${radarIconMarkup()}<span>${
      this.watchCodeData.enabled ? "Enabled" : "Disabled"
    }</span>`;
    button.addEventListener("click", () => {
      void this.setEnabled(!this.watchCodeData.enabled);
    });
    row.append(button);
    return row;
  }

  private renderError(): HTMLElement {
    const error = document.createElement("p");
    error.className = "setta-watch-code-error";
    error.hidden = !this.errorMessage;
    error.textContent = this.errorMessage ?? "";
    return error;
  }

  private renderInputGroup({
    settingId,
    title,
    emptyLabel,
    addLabel,
    add,
    rows,
  }: {
    settingId: string;
    title: string;
    emptyLabel: string;
    addLabel: string;
    add: () => void;
    rows: HTMLElement[];
  }): HTMLElement {
    const group = document.createElement("section");
    group.className = "setta-watch-code-input-group";
    group.dataset.settingAnchor = settingId;
    const header = document.createElement("div");
    header.className = "setta-watch-code-input-group-header";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "setta-watch-code-add-button";
    addButton.disabled = this.inputsDisabled();
    addButton.innerHTML = `${plusIconMarkup()}<span>${addLabel}</span>`;
    addButton.addEventListener("click", add);
    header.append(heading, addButton);
    group.append(header);
    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "setta-watch-code-empty";
      empty.textContent = emptyLabel;
      group.append(empty);
      return group;
    }
    const rowList = document.createElement("div");
    rowList.className = "setta-watch-code-row-list";
    rowList.append(...rows);
    group.append(rowList);
    return group;
  }

  private renderFolderRow(folder: WatchCodeFolder, index: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "setta-watch-code-input-row";
    const input = this.renderPathInput({
      value: folder.path,
      placeholder: "relative/path/to/folder",
      onInput: (value) => {
        this.localFolders[index] = {
          ...this.localFolders[index],
          path: value,
        };
      },
      onCommit: () => void this.persistInputs(),
    });
    const recursiveButton = document.createElement("button");
    recursiveButton.type = "button";
    recursiveButton.className = "setta-watch-code-icon-button";
    recursiveButton.classList.toggle("is-active", folder.recursive);
    recursiveButton.disabled = this.inputsDisabled();
    recursiveButton.setAttribute("aria-label", "Toggle recursive watch");
    recursiveButton.setAttribute("aria-pressed", String(folder.recursive));
    recursiveButton.innerHTML = repeatIconMarkup();
    recursiveButton.addEventListener("click", () => {
      this.localFolders[index] = {
        ...this.localFolders[index],
        recursive: !folder.recursive,
      };
      void this.persistInputs();
      this.renderPortal();
    });
    const removeButton = this.renderRemoveButton(
      "Remove folder watch path",
      () => {
        this.localFolders = this.localFolders.filter(
          (_, rowIndex) => rowIndex !== index,
        );
        void this.persistInputs();
        this.renderPortal();
      },
    );
    const actions = document.createElement("div");
    actions.className = "setta-watch-code-row-actions";
    actions.append(recursiveButton, removeButton);
    row.append(input, actions);
    return row;
  }

  private renderFileRow(file: string, index: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "setta-watch-code-input-row";
    const input = this.renderPathInput({
      value: file,
      placeholder: "relative/path/to/file.py",
      onInput: (value) => {
        this.localFiles[index] = value;
      },
      onCommit: () => void this.persistInputs(),
    });
    const removeButton = this.renderRemoveButton(
      "Remove file watch path",
      () => {
        this.localFiles = this.localFiles.filter(
          (_, rowIndex) => rowIndex !== index,
        );
        void this.persistInputs();
        this.renderPortal();
      },
    );
    const actions = document.createElement("div");
    actions.className = "setta-watch-code-row-actions";
    actions.append(removeButton);
    row.append(input, actions);
    return row;
  }

  private renderPathInput({
    value,
    placeholder,
    onInput,
    onCommit,
  }: {
    value: string;
    placeholder: string;
    onInput: (value: string) => void;
    onCommit: () => void;
  }): HTMLInputElement {
    const input = document.createElement("input");
    input.className = "setta-watch-code-path-input";
    input.disabled = this.inputsDisabled();
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener("input", () => onInput(input.value));
    input.addEventListener("blur", onCommit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        input.blur();
      }
    });
    return input;
  }

  private renderRemoveButton(
    label: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "setta-watch-code-icon-button is-danger";
    button.disabled = this.inputsDisabled();
    button.setAttribute("aria-label", label);
    button.innerHTML = trashIconMarkup();
    button.addEventListener("click", onClick);
    return button;
  }

  private updatePortalPosition(): void {
    if (!this.portalElement || !this.portalAnchor) {
      return;
    }
    const buttonRect = this.portalAnchor.getBoundingClientRect();
    const portalHeight =
      this.portalElement.getBoundingClientRect().height ||
      PORTAL_ESTIMATED_HEIGHT_PX;
    const maxAllowedWidth = Math.max(
      PORTAL_MIN_WIDTH_PX,
      window.innerWidth - PORTAL_MARGIN_PX * 2,
    );
    const width = Math.min(PORTAL_MAX_WIDTH_PX, maxAllowedWidth);
    const preferredLeft = buttonRect.right + PORTAL_BUTTON_GAP_PX;
    const maxLeft = window.innerWidth - PORTAL_MARGIN_PX - width;
    const left = Math.max(PORTAL_MARGIN_PX, Math.min(preferredLeft, maxLeft));
    const minTop = PORTAL_MARGIN_PX;
    const maxTop = Math.max(
      minTop,
      window.innerHeight - PORTAL_MARGIN_PX - portalHeight,
    );
    const top = Math.max(minTop, Math.min(buttonRect.top - 24, maxTop));
    this.portalElement.style.left = `${left}px`;
    this.portalElement.style.top = `${top}px`;
    this.portalElement.style.width = `${width}px`;
  }

  private inputsDisabled(): boolean {
    return (
      this.pendingMutation ||
      this.host.serverMode !== "ide" ||
      this.watchCodeData.projectConfigId === "" ||
      this.watchCodeData.projectConfigId === NULL_PROJECT_CONFIG_ID
    );
  }

  private async setEnabled(enabled: boolean): Promise<void> {
    if (this.inputsDisabled()) {
      return;
    }
    this.pendingMutation = true;
    this.errorMessage = null;
    this.render();
    try {
      const ok = await this.postBackendRoute(WATCH_CODE_ENABLED_ROUTE, {
        projectConfigId: this.watchCodeData.projectConfigId,
        enabled,
      });
      if (!ok) {
        this.errorMessage = "Watch Code update failed.";
      }
    } catch (error) {
      this.errorMessage = errorMessage(error);
    } finally {
      this.pendingMutation = false;
      this.render();
    }
  }

  private async persistInputs(): Promise<void> {
    if (this.inputsDisabled()) {
      return;
    }
    this.pendingMutation = true;
    this.errorMessage = null;
    this.render();
    try {
      const ok = await this.postBackendRoute(WATCH_CODE_INPUTS_ROUTE, {
        projectConfigId: this.watchCodeData.projectConfigId,
        folders: cloneFolders(this.localFolders),
        files: this.localFiles.slice(),
      });
      if (!ok) {
        this.errorMessage = "Watch Code inputs were not saved.";
      }
    } catch (error) {
      this.errorMessage = errorMessage(error);
    } finally {
      this.pendingMutation = false;
      this.render();
    }
  }

  private pluginSettingId(localId: WatchCodeLocalSettingId): string {
    return `plugin::${this.host.pluginId}::${localId}`;
  }

  private async postBackendRoute(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const response = await this.host.fetchBackendRoute(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return response.status === 200;
  }

  private findSettingAnchor(settingId: string): HTMLElement | null {
    const portal = this.portalElement;
    if (!portal) {
      return null;
    }
    const escapedSettingId = escapeAttributeValue(settingId);
    const candidate = portal.querySelector<HTMLElement>(
      `[data-setting-anchor="${escapedSettingId}"]`,
    );
    if (candidate?.dataset.settingAnchor === settingId) {
      return candidate;
    }
    return null;
  }
}

function normalizeWatchCodeProjectData(
  value: unknown,
): Omit<WatchCodeProjectData, "projectConfigId"> {
  if (!value || typeof value !== "object") {
    return {
      enabled: false,
      folders: [],
      files: [],
    };
  }
  const record = value as Record<string, unknown>;
  return {
    enabled: record.enabled === true,
    folders: normalizeFolders(record.folders),
    files: normalizeStringArray(record.files),
  };
}

function normalizeFolders(value: unknown): WatchCodeFolder[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry): WatchCodeFolder[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.path !== "string") {
      return [];
    }
    return [
      {
        path: record.path,
        recursive: record.recursive === true,
      },
    ];
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function cloneFolders(folders: WatchCodeFolder[]): WatchCodeFolder[] {
  return folders.map((folder) => ({ ...folder }));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return "Watch Code update failed.";
}

function animationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function escapeAttributeValue(value: string): string {
  const css = globalThis.CSS;
  if (css && typeof css.escape === "function") {
    return css.escape(value);
  }
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function radarIconMarkup(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M12 12l5-5"></path><path d="M12 4v2"></path><path d="M20 12h-2"></path><path d="M12 20v-2"></path><path d="M4 12h2"></path></svg>';
}

function closeIconMarkup(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
}

function plusIconMarkup(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>';
}

function repeatIconMarkup(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l4 4-4 4"></path><path d="M3 11V9a3 3 0 0 1 3-3h15"></path><path d="M7 22l-4-4 4-4"></path><path d="M21 13v2a3 3 0 0 1-3 3H3"></path></svg>';
}

function trashIconMarkup(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5"></path><path d="M14 11v5"></path></svg>';
}
