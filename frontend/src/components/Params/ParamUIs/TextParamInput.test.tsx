/* @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  TextParamInputUITypeEnum,
  TimeControlModeEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextParamDateTimeInput } from "./TextParamInput";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function createDateTimeInput(
  overrideProps: Partial<ComponentProps<typeof TextParamDateTimeInput>> = {},
) {
  return (
    <TextParamDateTimeInput
      value=""
      onChange={vi.fn()}
      isDisabled={false}
      uiType={TextParamInputUITypeEnum.date}
      timeControlMode={TimeControlModeEnum.display}
      timeDisplayFormat={TimeDisplayFormatEnum.twenty_four_hour}
      dateDisplayFormat={DateDisplayFormatEnum.iso}
      dateControlMode={DateControlModeEnum.calendar}
      dateSelectionMode={DateSelectionModeEnum.single}
      dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
      dateIncludesTime={false}
      {...overrideProps}
    />
  );
}

async function renderDateTimeInput(
  props: Partial<ComponentProps<typeof TextParamDateTimeInput>> = {},
): Promise<{
  host: HTMLDivElement;
  root: Root;
}> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createDateTimeInput(props));
  });
  return { host, root };
}

describe("TextParamDateTimeInput", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders time input with formatted display text", () => {
    const markup = renderToStaticMarkup(
      <TextParamDateTimeInput
        value="13:05"
        onChange={vi.fn()}
        isDisabled={false}
        uiType={TextParamInputUITypeEnum.time}
        timeControlMode={TimeControlModeEnum.input}
        timeDisplayFormat={TimeDisplayFormatEnum.twelve_hour}
        dateDisplayFormat={DateDisplayFormatEnum.iso}
        dateControlMode={DateControlModeEnum.input}
        dateSelectionMode={DateSelectionModeEnum.single}
        dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
        dateIncludesTime={false}
      />,
    );

    expect(markup).toContain('type="time"');
    expect(markup).toContain('value="13:05"');
    expect(markup).toContain("1:05 PM");
  });

  it("renders date input with selected display format", () => {
    const markup = renderToStaticMarkup(
      <TextParamDateTimeInput
        value="2026-12-31"
        onChange={vi.fn()}
        isDisabled={false}
        uiType={TextParamInputUITypeEnum.date}
        timeControlMode={TimeControlModeEnum.display}
        timeDisplayFormat={TimeDisplayFormatEnum.twenty_four_hour}
        dateDisplayFormat={DateDisplayFormatEnum.us}
        dateControlMode={DateControlModeEnum.input}
        dateSelectionMode={DateSelectionModeEnum.single}
        dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
        dateIncludesTime={false}
      />,
    );

    expect(markup).toContain('type="text"');
    expect(markup).toContain('value="12/31/2026"');
  });

  it("renders a calendar UI for date params in calendar mode", () => {
    const markup = renderToStaticMarkup(
      <TextParamDateTimeInput
        value=""
        onChange={vi.fn()}
        isDisabled={false}
        uiType={TextParamInputUITypeEnum.date}
        timeControlMode={TimeControlModeEnum.display}
        timeDisplayFormat={TimeDisplayFormatEnum.twenty_four_hour}
        dateDisplayFormat={DateDisplayFormatEnum.iso}
        dateControlMode={DateControlModeEnum.calendar}
        dateSelectionMode={DateSelectionModeEnum.single}
        dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
        dateIncludesTime={false}
      />,
    );

    expect(markup).toContain("Prev");
    expect(markup).toContain("Next");
    expect(markup).toContain("No date selected");
  });

  it("renders calendar weekday headers using the configured week-start order", () => {
    const markup = renderToStaticMarkup(
      <TextParamDateTimeInput
        value=""
        onChange={vi.fn()}
        isDisabled={false}
        uiType={TextParamInputUITypeEnum.date}
        timeControlMode={TimeControlModeEnum.display}
        timeDisplayFormat={TimeDisplayFormatEnum.twenty_four_hour}
        dateDisplayFormat={DateDisplayFormatEnum.iso}
        dateControlMode={DateControlModeEnum.calendar}
        dateSelectionMode={DateSelectionModeEnum.single}
        dateCalendarWeekStart={DateCalendarWeekStartEnum.monday}
        dateIncludesTime={false}
      />,
    );

    const mondayIndex = markup.indexOf(">Mon<");
    const sundayIndex = markup.indexOf(">Sun<");
    expect(mondayIndex).toBeGreaterThanOrEqual(0);
    expect(sundayIndex).toBeGreaterThanOrEqual(0);
    expect(mondayIndex).toBeLessThan(sundayIndex);
  });

  it("renders display-only time text when time mode is display", () => {
    const markup = renderToStaticMarkup(
      <TextParamDateTimeInput
        value="13:05"
        onChange={vi.fn()}
        isDisabled={false}
        uiType={TextParamInputUITypeEnum.time}
        timeControlMode={TimeControlModeEnum.display}
        timeDisplayFormat={TimeDisplayFormatEnum.twelve_hour}
        dateDisplayFormat={DateDisplayFormatEnum.iso}
        dateControlMode={DateControlModeEnum.input}
        dateSelectionMode={DateSelectionModeEnum.single}
        dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
        dateIncludesTime={false}
      />,
    );

    expect(markup).not.toContain('type="time"');
    expect(markup).toContain("1:05 PM");
  });

  it("applies clock display font and scale options", () => {
    const markup = renderToStaticMarkup(
      <TextParamDateTimeInput
        value="13:05"
        onChange={vi.fn()}
        isDisabled={false}
        uiType={TextParamInputUITypeEnum.time}
        timeControlMode={TimeControlModeEnum.display}
        timeDisplayFormat={TimeDisplayFormatEnum.twelve_hour}
        timeDisplayScale={1.8}
        timeDisplayFont={TimeDisplayFontEnum.clock}
        dateDisplayFormat={DateDisplayFormatEnum.iso}
        dateControlMode={DateControlModeEnum.input}
        dateSelectionMode={DateSelectionModeEnum.single}
        dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
        dateIncludesTime={false}
      />,
    );

    expect(markup).toContain("tracking-[0.08em]");
    expect(markup).toContain("font-size:1.8em");
  });

  it("omits display border when transparent time display is enabled", () => {
    const markup = renderToStaticMarkup(
      <TextParamDateTimeInput
        value="13:05"
        onChange={vi.fn()}
        isDisabled={false}
        uiType={TextParamInputUITypeEnum.time}
        timeControlMode={TimeControlModeEnum.display}
        timeDisplayFormat={TimeDisplayFormatEnum.twelve_hour}
        timeDisplayTransparent={true}
        dateDisplayFormat={DateDisplayFormatEnum.iso}
        dateControlMode={DateControlModeEnum.input}
        dateSelectionMode={DateSelectionModeEnum.single}
        dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
        dateIncludesTime={false}
      />,
    );

    expect(markup).not.toContain("border-setta-200/50");
  });

  it("parses and serializes multi-date calendar values as JSON arrays", () => {
    const markup = renderToStaticMarkup(
      createDateTimeInput({
        value: '["2026-02-17","2026-02-19"]',
        dateSelectionMode: DateSelectionModeEnum.multiple,
      }),
    );

    expect(markup).toContain("2 selected");
  });

  it("serializes multi-date calendar selections through the live input", async () => {
    const onChange = vi.fn();
    const { host, root } = await renderDateTimeInput({
      value: '["2026-02-17"]',
      onChange,
      dateSelectionMode: DateSelectionModeEnum.multiple,
    });
    const nextDateButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "18",
    );

    if (!nextDateButton) {
      throw new Error("Expected to find the February 18 calendar button.");
    }

    await act(async () => {
      nextDateButton.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
        }),
      );
    });

    expect(onChange).toHaveBeenCalledWith('["2026-02-17","2026-02-18"]');

    await act(async () => {
      root.unmount();
    });
  });

  it("renders datetime-local input when date includes time", () => {
    const markup = renderToStaticMarkup(
      <TextParamDateTimeInput
        value="2026-12-31T09:30"
        onChange={vi.fn()}
        isDisabled={false}
        uiType={TextParamInputUITypeEnum.date}
        timeControlMode={TimeControlModeEnum.input}
        timeDisplayFormat={TimeDisplayFormatEnum.twelve_hour}
        dateDisplayFormat={DateDisplayFormatEnum.us}
        dateControlMode={DateControlModeEnum.input}
        dateSelectionMode={DateSelectionModeEnum.single}
        dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
        dateIncludesTime={true}
      />,
    );

    expect(markup).toContain('type="datetime-local"');
    expect(markup).toContain('value="2026-12-31T09:30"');
    expect(markup).toContain("12/31/2026 9:30 AM");
  });

  it("shows time picker for calendar mode when include-time is enabled", () => {
    const markup = renderToStaticMarkup(
      <TextParamDateTimeInput
        value="2026-12-31T09:30"
        onChange={vi.fn()}
        isDisabled={false}
        uiType={TextParamInputUITypeEnum.date}
        timeControlMode={TimeControlModeEnum.input}
        timeDisplayFormat={TimeDisplayFormatEnum.twelve_hour}
        dateDisplayFormat={DateDisplayFormatEnum.iso}
        dateControlMode={DateControlModeEnum.calendar}
        dateSelectionMode={DateSelectionModeEnum.single}
        dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
        dateIncludesTime={true}
      />,
    );

    expect(markup).toContain("Time");
    expect(markup).toContain('type="time"');
  });

  it("renders across repeated time/date mode toggles without throwing", () => {
    const renderTime = (
      mode: (typeof TimeControlModeEnum)[keyof typeof TimeControlModeEnum],
    ) =>
      renderToStaticMarkup(
        <TextParamDateTimeInput
          value="13:05"
          onChange={vi.fn()}
          isDisabled={false}
          uiType={TextParamInputUITypeEnum.time}
          timeControlMode={mode}
          timeDisplayFormat={TimeDisplayFormatEnum.twelve_hour}
          dateDisplayFormat={DateDisplayFormatEnum.iso}
          dateControlMode={DateControlModeEnum.input}
          dateSelectionMode={DateSelectionModeEnum.single}
          dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
          dateIncludesTime={false}
        />,
      );
    const renderDate = (
      mode: (typeof DateControlModeEnum)[keyof typeof DateControlModeEnum],
    ) =>
      renderToStaticMarkup(
        <TextParamDateTimeInput
          value="2026-12-31"
          onChange={vi.fn()}
          isDisabled={false}
          uiType={TextParamInputUITypeEnum.date}
          timeControlMode={TimeControlModeEnum.input}
          timeDisplayFormat={TimeDisplayFormatEnum.twenty_four_hour}
          dateDisplayFormat={DateDisplayFormatEnum.iso}
          dateControlMode={mode}
          dateSelectionMode={DateSelectionModeEnum.single}
          dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
          dateIncludesTime={false}
        />,
      );

    expect(renderTime(TimeControlModeEnum.display)).toContain("1:05 PM");
    expect(renderTime(TimeControlModeEnum.input)).toContain('type="time"');
    expect(renderTime(TimeControlModeEnum.display)).toContain("1:05 PM");

    expect(renderDate(DateControlModeEnum.calendar)).toContain("Prev");
    expect(renderDate(DateControlModeEnum.input)).toContain('type="text"');
    expect(renderDate(DateControlModeEnum.calendar)).toContain("Prev");
  });
});
