/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import { useSectionRefs } from "../../section/sectionRefs";
import { DateValueControl, TimeValueControl } from "./DateTimeValueControl";
import type {
  DateDisplayFormat,
  DateValueControlProps,
  TimeValueControlProps,
} from "./dateTimeTypes";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SECTION_ID = "panel";

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!valueSetter) {
    throw new Error("The native input value setter is unavailable.");
  }
  act(() => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("DateValueControl and TimeValueControl", () => {
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

  function mountDate(props: Partial<DateValueControlProps> = {}): void {
    act(() => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {
            <DateValueControl
              ariaLabel="Date value"
              sectionId={SECTION_ID}
              value="2026-12-31"
              onValueChange={() => {}}
              {...props}
            />
          }
        </WorkspaceTestProvider>,
      );
    });
  }

  function mountTime(props: Partial<TimeValueControlProps> = {}): void {
    act(() => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {
            <TimeValueControl
              ariaLabel="Time value"
              sectionId={SECTION_ID}
              value="13:05"
              onValueChange={() => {}}
              {...props}
            />
          }
        </WorkspaceTestProvider>,
      );
    });
  }

  it("renders and edits the reference formatted date input through the string seam", () => {
    const onValueChange = vi.fn();
    mountDate({ displayFormat: "us", onValueChange });
    const input = host.querySelector<HTMLInputElement>('input[type="text"]');
    if (!input) {
      throw new Error("The formatted date input is not rendered.");
    }
    expect(input.value).toBe("12/31/2026");
    expect(input.getAttribute("aria-label")).toBe("Date value");
    expect(input.classList.contains("bg-transparent")).toBe(true);
    expect(input.classList.contains("dark:[color-scheme:dark]")).toBe(false);
    for (const boundary of ["nodrag", "nopan"]) {
      expect(input.classList.contains(boundary)).toBe(true);
    }
    expect(input.classList.contains("nowheel")).toBe(false);

    setInputValue(input, "01/02/2027");
    expect(onValueChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith("2027-01-02");

    setInputValue(input, "not a date");
    expect(onValueChange).toHaveBeenCalledOnce();
    input.focus();
    act(() => input.blur());
    expect(input.value).toBe("12/31/2026");
  });

  it("renders datetime-local input and configured companion text when date includes time", () => {
    const onValueChange = vi.fn();
    mountDate({
      value: "2026-12-31T09:30",
      displayFormat: "us",
      includeTime: true,
      timeDisplayFormat: "twelve_hour",
      onValueChange,
    });
    const input = host.querySelector<HTMLInputElement>(
      'input[type="datetime-local"]',
    );
    if (!input) {
      throw new Error("The datetime-local input is not rendered.");
    }
    expect(input.value).toBe("2026-12-31T09:30");
    expect(input.classList.contains("dark:[color-scheme:dark]")).toBe(true);
    expect(host.textContent).toContain("12/31/2026 9:30 AM");
    setInputValue(input, "2027-01-02T14:45");
    expect(onValueChange).toHaveBeenCalledWith("2027-01-02T14:45");
  });

  it("renders the live multiple-date calendar with selected and accessible day state", () => {
    const onValueChange = vi.fn();
    mountDate({
      value: '["2026-02-17"]',
      controlMode: "calendar",
      selectionMode: "multiple",
      weekStart: "monday",
      onValueChange,
    });
    const group = host.querySelector<HTMLElement>(
      '[role="group"][aria-label="Date value"]',
    );
    expect(group?.getAttribute("aria-disabled")).toBe("false");
    const weekdayLabels = Array.from(
      group?.querySelectorAll(".uppercase span") ?? [],
    ).map((label) => label.textContent);
    expect(weekdayLabels).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);

    const selected = host.querySelector<HTMLButtonElement>(
      'button[aria-label="February 17, 2026"]',
    );
    const nextDate = host.querySelector<HTMLButtonElement>(
      'button[aria-label="February 18, 2026"]',
    );
    expect(selected?.getAttribute("aria-selected")).toBe("true");
    expect(nextDate?.getAttribute("aria-selected")).toBe("false");
    expect(
      group?.querySelector('[role="grid"]')?.getAttribute("aria-label"),
    ).toBe("Date value, February 2026");
    act(() => nextDate?.click());
    expect(onValueChange).toHaveBeenCalledWith('["2026-02-17","2026-02-18"]');
  });

  it("navigates calendar months and keeps the frozen 42-cell grid", () => {
    mountDate({ value: "2026-02-17", controlMode: "calendar" });
    const group = host.querySelector<HTMLElement>('[role="group"]');
    expect(group?.querySelectorAll('button[role="gridcell"]')).toHaveLength(42);
    const next = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Date value: Next month"]',
    );
    act(() => next?.click());
    expect(host.textContent).toContain("March 2026");
  });

  it("uses one calendar tab stop and moves focus across month boundaries with arrow keys", () => {
    mountDate({ value: "2026-02-28", controlMode: "calendar" });
    const gridCells = Array.from(
      host.querySelectorAll<HTMLButtonElement>('button[role="gridcell"]'),
    );
    expect(gridCells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
    const selectedDate = host.querySelector<HTMLButtonElement>(
      'button[aria-label="February 28, 2026"]',
    );
    selectedDate?.focus();
    act(() => {
      selectedDate?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    const nextDate = host.querySelector<HTMLButtonElement>(
      'button[aria-label="March 1, 2026"]',
    );
    expect(document.activeElement).toBe(nextDate);
    expect(nextDate?.tabIndex).toBe(0);
    expect(host.textContent).toContain("March 2026");
  });

  it("keeps focus on an adjacent-month date after selecting it", () => {
    const onValueChange = vi.fn();
    mountDate({ value: "2026-02-28", controlMode: "calendar", onValueChange });
    const trailingDate = host.querySelector<HTMLButtonElement>(
      'button[aria-label="March 1, 2026"]',
    );
    trailingDate?.focus();

    act(() => trailingDate?.click());

    const focusedDate = host.querySelector<HTMLButtonElement>(
      'button[aria-label="March 1, 2026"]',
    );
    expect(onValueChange).toHaveBeenCalledWith("2026-03-01");
    expect(host.textContent).toContain("March 2026");
    expect(document.activeElement).toBe(focusedDate);
    expect(focusedDate?.tabIndex).toBe(0);
  });

  it("maps horizontal calendar keys to visual direction inside a locally rtl host", () => {
    host.dir = "rtl";
    mountDate({ value: "2026-02-28", controlMode: "calendar" });
    const selectedDate = host.querySelector<HTMLButtonElement>(
      'button[aria-label="February 28, 2026"]',
    );
    selectedDate?.focus();

    act(() => {
      selectedDate?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowLeft",
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(document.activeElement).toBe(
      host.querySelector<HTMLButtonElement>(
        'button[aria-label="March 1, 2026"]',
      ),
    );
  });

  it("combines calendar date and time while forcing include-time to single selection", () => {
    const onValueChange = vi.fn();
    mountDate({
      value: "2026-02-17T09:30",
      controlMode: "calendar",
      selectionMode: "multiple",
      includeTime: true,
      timeDisplayFormat: "twelve_hour",
      onValueChange,
    });
    expect(host.textContent).toContain("2026-02-17 9:30 AM");
    const timeInput =
      host.querySelector<HTMLInputElement>('input[type="time"]');
    if (!timeInput) {
      throw new Error("The calendar time input is not rendered.");
    }
    expect(timeInput.getAttribute("aria-label")).toBe("Date value time");
    expect(timeInput.classList.contains("dark:[color-scheme:dark]")).toBe(true);
    setInputValue(timeInput, "14:45");
    expect(onValueChange).toHaveBeenCalledWith("2026-02-17T14:45");
  });

  it("renders native time input, formatted companion text, and controlled updates", () => {
    const onValueChange = vi.fn();
    mountTime({ displayFormat: "twelve_hour", onValueChange });
    const input = host.querySelector<HTMLInputElement>('input[type="time"]');
    if (!input) {
      throw new Error("The native time input is not rendered.");
    }
    expect(input.value).toBe("13:05");
    expect(input.getAttribute("aria-label")).toBe("Time value");
    expect(input.classList.contains("dark:[color-scheme:dark]")).toBe(true);
    expect(input.classList.contains("nowheel")).toBe(false);
    expect(host.textContent).toContain("1:05 PM");
    setInputValue(input, "09:45");
    expect(onValueChange).toHaveBeenCalledWith("09:45");
  });

  it("renders bounded formatted time display with font and transparent options", () => {
    mountTime({
      controlMode: "display",
      displayFormat: "twelve_hour",
      transparent: true,
      scale: 1.8,
      font: "clock",
    });
    const display = host.querySelector<HTMLElement>(
      'output[aria-label="Time value: 1:05 PM"]',
    );
    expect(display?.textContent).toBe("1:05 PM");
    expect(display?.classList.contains("tracking-[0.08em]")).toBe(true);
    expect(display?.style.fontSize).toBe("1.8em");
    expect(host.querySelector("span.section-value")).toBeNull();
  });

  it("restores section focus on Escape from every editable surface", () => {
    const sectionRoot = document.createElement("div");
    sectionRoot.tabIndex = -1;
    document.body.appendChild(sectionRoot);
    testWorkspace.sectionRefs.setState({
      withNested: { [SECTION_ID]: sectionRoot },
    });
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    mountTime();
    const input = host.querySelector<HTMLInputElement>('input[type="time"]');
    input?.focus();
    act(() => {
      input?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
        }),
      );
    });
    expect(document.activeElement).toBe(sectionRoot);

    mountDate({ value: "2026-02-17", controlMode: "calendar" });
    const selectedDate = host.querySelector<HTMLButtonElement>(
      'button[aria-label="February 17, 2026"]',
    );
    selectedDate?.focus();
    act(() => {
      selectedDate?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
        }),
      );
    });
    expect(document.activeElement).toBe(sectionRoot);
    expect(documentEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentEscape);
    sectionRoot.remove();
  });

  it("disables native and calendar interactions through host and item-select state", () => {
    mountTime({ disabled: true });
    expect(
      host.querySelector<HTMLInputElement>('input[type="time"]')?.disabled,
    ).toBe(true);

    testWorkspace.itemSelectionMode.setState({ isSelectingItems: true });
    mountDate({ controlMode: "calendar" });
    const group = host.querySelector<HTMLElement>('[role="group"]');
    expect(group?.getAttribute("aria-disabled")).toBe("true");
    expect(
      Array.from(group?.querySelectorAll("button") ?? []).every(
        (button) => button.disabled,
      ),
    ).toBe(true);
    expect(host.querySelector("span.section-value")?.className).not.toContain(
      "peer-focus-within/textinput:border-blue-400",
    );
  });

  it("fails specifically on invalid public configuration", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(WorkspaceTestProvider, {
          workspace: testWorkspace,
          children: createElement(DateValueControl, {
            ariaLabel: "Date value",
            sectionId: SECTION_ID,
            value: "",
            onValueChange: () => {},
            displayFormat: "ambiguous" as DateDisplayFormat,
          }),
        }),
      ),
    ).toThrow("DateValueControl received invalid displayFormat: ambiguous.");
    expect(() =>
      renderToStaticMarkup(
        createElement(WorkspaceTestProvider, {
          workspace: testWorkspace,
          children: createElement(TimeValueControl, {
            ariaLabel: "Time value",
            sectionId: SECTION_ID,
            value: "",
            onValueChange: () => {},
            scale: 4,
          }),
        }),
      ),
    ).toThrow(
      "TimeValueControl received invalid scale: 4; expected 0.5 through 3.",
    );
  });
});
