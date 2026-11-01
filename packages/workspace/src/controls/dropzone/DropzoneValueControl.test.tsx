/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../../test/workspaceTestHost.js";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useItemSelectionMode } from "../../document/itemSelectionMode.js";
import { useSectionRefs } from "../../section/sectionRefs.js";
import { DropzoneValueControl } from "./DropzoneValueControl.js";
import type {
  DropzoneAttachment,
  DropzonePolicy,
  DropzoneValueControlProps,
} from "./dropzoneTypes.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SECTION_ID = "panel";
const CONTROL_ID = "dropzone";
const POLICY: DropzonePolicy = {
  maxAttachments: 3,
  maxFileBytes: 5,
  maxTotalBytes: 6,
  allowedMimePrefixes: ["image/"],
};

type DataTransferStub = Pick<DataTransfer, "files" | "getData" | "dropEffect">;

function makeFile(name: string, size: number, type = "image/png"): File {
  return new File([new Uint8Array(size)], name, { type });
}

function makeDataTransfer({
  files = [],
  text = "",
}: {
  files?: ReadonlyArray<File>;
  text?: string;
}): DataTransferStub {
  return {
    files: files as unknown as FileList,
    getData: (format) =>
      format === "text/plain" || format === "text" ? text : "",
    dropEffect: "none",
  };
}

function dispatchDrag(
  target: Element,
  type: "dragenter" | "dragleave" | "dragover" | "drop",
  dataTransfer: DataTransferStub,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    configurable: true,
    value: dataTransfer,
  });
  target.dispatchEvent(event);
  return event;
}

describe("DropzoneValueControl", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    testWorkspace.itemSelectionMode.getState().reset();
    testWorkspace.sectionRefs.getState().reset();
  });

  function mount(props: Partial<DropzoneValueControlProps> = {}) {
    act(() => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {
            <DropzoneValueControl
              ariaLabel="Assets"
              sectionId={SECTION_ID}
              controlId={CONTROL_ID}
              attachments={[]}
              policy={POLICY}
              onAccepted={() => {}}
              onRejected={() => {}}
              {...props}
            />
          }
        </WorkspaceTestProvider>,
      );
    });
  }

  function getDropTarget(): HTMLDivElement {
    const target = host.querySelector<HTMLDivElement>('[role="group"]');
    if (!target) {
      throw new Error("The drop target is not rendered.");
    }
    return target;
  }

  function getFileInput(): HTMLInputElement {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) {
      throw new Error("The file input is not rendered.");
    }
    return input;
  }

  function getButton(label: string): HTMLButtonElement {
    const button = Array.from(host.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === label,
    );
    if (!button) {
      throw new Error(`The ${label} button is not rendered.`);
    }
    return button;
  }

  it("renders the frozen presentation with package gesture boundaries and accessible controls", () => {
    const onServerFilePickerRequest = vi.fn();
    mount({ onServerFilePickerRequest });
    const rootElement = host.firstElementChild;
    if (!(rootElement instanceof HTMLDivElement)) {
      throw new Error("The dropzone root is not rendered.");
    }
    for (const className of [
      "setta-prevent-section-active-css",
      "nodrag",
      "nopan",
      "section-value",
      "min-h-0",
    ]) {
      expect(rootElement.classList.contains(className)).toBe(true);
    }
    expect(rootElement.classList.contains("nowheel")).toBe(false);
    const target = getDropTarget();
    expect(target.classList.contains("nowheel")).toBe(false);
    expect(target.getAttribute("aria-label")).toBe("Assets: Drop a file here");
    expect(target.getAttribute("aria-disabled")).toBe("false");
    expect(target.getAttribute("aria-busy")).toBe("false");
    for (const className of [
      "rounded-xl",
      "border-4",
      "border-dashed",
      "tracking-widest",
      "dark:border-setta-700",
    ]) {
      expect(target.classList.contains(className)).toBe(true);
    }
    expect(target.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    const input = getFileInput();
    expect(input.id).toBe(
      `${testWorkspace.domId}-panel-dropzone-DropzoneFileInput`,
    );
    expect(input.multiple).toBe(true);
    expect(input.getAttribute("aria-label")).toBe("Assets local files");
    for (const label of ["Local file...", "Server file..."]) {
      const button = getButton(label);
      expect(button.type).toBe("button");
      expect(button.classList.contains("rounded-full")).toBe(true);
      expect(button.classList.contains("after:-inset-y-1")).toBe(true);
    }
  });

  it("emits accepted file objects unchanged and reports policy rejections", () => {
    const onAccepted = vi.fn();
    const onRejected = vi.fn();
    mount({ onAccepted, onRejected });
    const accepted = makeFile("photo.png", 4);
    const wrongType = makeFile("notes.txt", 1, "text/plain");
    const input = getFileInput();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [accepted, wrongType],
    });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onAccepted).toHaveBeenCalledOnce();
    expect(onAccepted).toHaveBeenCalledWith({
      kind: "files",
      files: [accepted],
    });
    expect(onAccepted.mock.calls[0]?.[0].files[0]).toBe(accepted);
    expect(onRejected).toHaveBeenCalledWith([
      { kind: "file", file: wrongType, reason: "mime-type" },
    ]);
    expect(input.value).toBe("");
  });

  it("tracks nested drag depth and gives file drops one movement owner", () => {
    const onAccepted = vi.fn();
    mount({ onAccepted });
    const target = getDropTarget();
    const file = makeFile("photo.png", 4);
    const transfer = makeDataTransfer({ files: [file] });
    act(() => {
      dispatchDrag(target, "dragenter", transfer);
      dispatchDrag(target, "dragenter", transfer);
    });
    expect(target.dataset.dragActive).toBe("true");
    expect(target.classList.contains("border-emerald-500")).toBe(true);
    act(() => {
      dispatchDrag(target, "dragleave", transfer);
    });
    expect(target.dataset.dragActive).toBe("true");
    let dropEvent: Event | undefined;
    act(() => {
      dropEvent = dispatchDrag(target, "drop", transfer);
    });
    expect(dropEvent?.defaultPrevented).toBe(true);
    expect(target.dataset.dragActive).toBe("false");
    expect(onAccepted).toHaveBeenCalledWith({ kind: "files", files: [file] });
  });

  it("emits dropped text as a stateless result and rejects oversized UTF-8 payloads", () => {
    const onAccepted = vi.fn();
    const onRejected = vi.fn();
    mount({ onAccepted, onRejected });
    const target = getDropTarget();
    act(() => {
      dispatchDrag(target, "drop", makeDataTransfer({ text: "hello" }));
      dispatchDrag(target, "drop", makeDataTransfer({ text: "éééé" }));
    });
    expect(onAccepted).toHaveBeenCalledWith({ kind: "text", text: "hello" });
    expect(onRejected).toHaveBeenCalledWith([
      { kind: "text", text: "éééé", reason: "total-size" },
    ]);
  });

  it("renders controlled attachment metadata and delegates removal by host identity", () => {
    const attachments: DropzoneAttachment[] = [
      { id: "file-1", kind: "file", name: "photo.png", size: 1024 },
      { id: "text-1", kind: "text", name: "Dropped text", size: null },
    ];
    const onAttachmentRemove = vi.fn();
    mount({ attachments, onAttachmentRemove });
    expect(getDropTarget().textContent).toContain("2 attachments");
    const list = host.querySelector('[role="list"]');
    expect(list?.querySelectorAll('[role="listitem"]')).toHaveLength(2);
    expect(list?.textContent).toContain("photo.png");
    expect(list?.textContent).toContain("1 KB");
    expect(list?.textContent).toContain("Dropped text");
    const remove = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete photo.png"]',
    );
    if (!remove) {
      throw new Error("The attachment removal action is not rendered.");
    }
    act(() => remove.click());
    expect(onAttachmentRemove).toHaveBeenCalledWith("file-1");
    expect(host.querySelectorAll('[role="listitem"]')).toHaveLength(2);

    mount({ attachments });
    expect(host.querySelector('button[aria-label^="Delete "]')).toBeNull();
  });

  it("restores focus to the next attachment action and then the local-file action", () => {
    const first = {
      id: "file-1",
      kind: "file" as const,
      name: "first.png",
      size: 1,
    };
    const second = {
      id: "file-2",
      kind: "file" as const,
      name: "second.png",
      size: 1,
    };
    const onAttachmentRemove = vi.fn();
    mount({ attachments: [first, second], onAttachmentRemove });
    const firstDelete = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete first.png"]',
    );
    firstDelete?.focus();
    act(() => firstDelete?.click());
    mount({ attachments: [second], onAttachmentRemove });
    const secondDelete = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete second.png"]',
    );
    expect(document.activeElement).toBe(secondDelete);

    act(() => secondDelete?.click());
    mount({ attachments: [], onAttachmentRemove });
    expect(document.activeElement).toBe(getButton("Local file..."));
    expect(onAttachmentRemove.mock.calls).toEqual([["file-1"], ["file-2"]]);
  });

  it("renders the server action only for its explicit host callback", () => {
    mount();
    expect(host.textContent).not.toContain("Server file...");
    const onServerFilePickerRequest = vi.fn();
    mount({ onServerFilePickerRequest });
    act(() => getButton("Server file...").click());
    expect(onServerFilePickerRequest).toHaveBeenCalledWith({
      remainingSlots: 3,
    });
  });

  it("blocks new input when controlled attachments exhaust the count policy", () => {
    const attachments: DropzoneAttachment[] = [
      { id: "1", kind: "file", name: "one.png", size: 1 },
      { id: "2", kind: "file", name: "two.png", size: 1 },
      { id: "3", kind: "file", name: "three.png", size: 1 },
    ];
    const onAccepted = vi.fn();
    const onServerFilePickerRequest = vi.fn();
    mount({ attachments, onAccepted, onServerFilePickerRequest });
    expect(getFileInput().disabled).toBe(true);
    expect(getButton("Local file...").disabled).toBe(true);
    expect(getButton("Server file...").disabled).toBe(true);
    expect(getDropTarget().getAttribute("aria-disabled")).toBe("true");
    act(() => getButton("Server file...").click());
    expect(onServerFilePickerRequest).not.toHaveBeenCalled();
    act(() => {
      dispatchDrag(
        getDropTarget(),
        "drop",
        makeDataTransfer({ files: [makeFile("four.png", 1)] }),
      );
    });
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("exposes controlled pending/error state and blocks every input path", () => {
    const onAccepted = vi.fn();
    const onRejected = vi.fn();
    const onServerFilePickerRequest = vi.fn();
    mount({
      pending: true,
      errorMessage: "Upload failed.",
      onAccepted,
      onRejected,
      onServerFilePickerRequest,
    });
    const target = getDropTarget();
    expect(target.getAttribute("aria-busy")).toBe("true");
    expect(target.getAttribute("aria-describedby")).toBe(
      `${testWorkspace.domId}-panel-dropzone-DropzoneError`,
    );
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Uploading attachments.",
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "Upload failed.",
    );
    expect(getButton("Local file...").disabled).toBe(true);
    expect(getButton("Server file...").disabled).toBe(true);
    act(() => {
      dispatchDrag(
        target,
        "drop",
        makeDataTransfer({ files: [makeFile("photo.png", 4)] }),
      );
    });
    expect(onAccepted).not.toHaveBeenCalled();
    expect(onRejected).not.toHaveBeenCalled();
    expect(target.dataset.dragActive).toBe("false");
  });

  it("composes host and item-select disabledness and restores section focus on Escape", () => {
    const sectionRoot = document.createElement("div");
    sectionRoot.tabIndex = -1;
    document.body.appendChild(sectionRoot);
    testWorkspace.sectionRefs.setState({
      withNested: { [SECTION_ID]: sectionRoot },
    });
    mount({ disabled: true, onServerFilePickerRequest: () => {} });
    expect(getFileInput().disabled).toBe(true);
    expect(getButton("Local file...").disabled).toBe(true);
    expect(getDropTarget().getAttribute("aria-disabled")).toBe("true");
    expect(getDropTarget().classList.contains("opacity-60")).toBe(true);

    mount({ onServerFilePickerRequest: () => {} });
    const localButton = getButton("Local file...");
    localButton.focus();
    act(() => {
      localButton.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
        }),
      );
    });
    expect(document.activeElement).toBe(sectionRoot);

    act(() =>
      testWorkspace.itemSelectionMode.setState({ isSelectingItems: true }),
    );
    expect(getFileInput().disabled).toBe(true);
    expect(getButton("Local file...").disabled).toBe(true);
    expect(getDropTarget().getAttribute("aria-disabled")).toBe("true");
    expect(getDropTarget().classList.contains("opacity-60")).toBe(true);
    sectionRoot.remove();
  });
});
