import { renderToStaticMarkup } from "react-dom/server";
import {
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  TextParamInputUITypeEnum,
  TimeControlModeEnum,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import {
  parseCalendarSelectedDates,
  serializeCalendarSelectedDates,
  TextParamDateTimeInput,
} from "./TextParamInput";

describe("TextParamDateTimeInput", () => {
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
      />,
    );

    expect(markup).toContain('type="date"');
    expect(markup).toContain('value="2026-12-31"');
    expect(markup).toContain("12/31/2026");
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
      />,
    );

    expect(markup).toContain("Prev");
    expect(markup).toContain("Next");
    expect(markup).toContain("No date selected");
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
      />,
    );

    expect(markup).not.toContain('type="time"');
    expect(markup).toContain("1:05 PM");
  });

  it("parses and serializes multi-date calendar values as JSON arrays", () => {
    const parsed = parseCalendarSelectedDates(
      '["2026-02-01","2026-02-03"]',
      DateSelectionModeEnum.multiple,
    );
    expect(parsed).toEqual(["2026-02-01", "2026-02-03"]);

    const serialized = serializeCalendarSelectedDates(
      ["2026-02-03", "2026-02-01"],
      DateSelectionModeEnum.multiple,
    );
    expect(serialized).toBe('["2026-02-01","2026-02-03"]');
  });
});
