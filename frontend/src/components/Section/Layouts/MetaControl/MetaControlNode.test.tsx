import { renderToStaticMarkup } from "react-dom/server";
import {
  CodeObjTypeEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  TimeControlModeEnum,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { MetaControlContent } from "./MetaControlNode";

describe("MetaControlContent date/time param rendering", () => {
  it("renders a date input for date params", () => {
    const markup = renderToStaticMarkup(
      <MetaControlContent
        sectionId="section-1"
        controlParamId="param-1"
        sectionName="Date Control"
        paramDisplayName="Date Control"
        codeObjType={CodeObjTypeEnum.DateParam}
        value="2026-02-15"
        defaultVal=""
        showSectionTitle={false}
        onValueChange={vi.fn()}
        dateDisplayFormat={DateDisplayFormatEnum.iso}
      />,
    );

    expect(markup).toContain('type="date"');
    expect(markup).toContain('value="2026-02-15"');
  });

  it("renders a time input for time params", () => {
    const markup = renderToStaticMarkup(
      <MetaControlContent
        sectionId="section-1"
        controlParamId="param-1"
        sectionName="Time Control"
        paramDisplayName="Time Control"
        codeObjType={CodeObjTypeEnum.TimeParam}
        value="13:45"
        defaultVal=""
        showSectionTitle={false}
        onValueChange={vi.fn()}
        timeControlMode={TimeControlModeEnum.input}
        timeDisplayFormat={TimeDisplayFormatEnum.twelve_hour}
      />,
    );

    expect(markup).toContain('type="time"');
    expect(markup).toContain('value="13:45"');
  });

  it("renders display-only time text when time control mode is display", () => {
    const markup = renderToStaticMarkup(
      <MetaControlContent
        sectionId="section-1"
        controlParamId="param-1"
        sectionName="Time Control"
        paramDisplayName="Time Control"
        codeObjType={CodeObjTypeEnum.TimeParam}
        value="13:45"
        defaultVal=""
        showSectionTitle={false}
        onValueChange={vi.fn()}
        timeControlMode={TimeControlModeEnum.display}
        timeDisplayFormat={TimeDisplayFormatEnum.twelve_hour}
      />,
    );

    expect(markup).not.toContain('type="time"');
    expect(markup).toContain("1:45 PM");
  });

  it("renders calendar controls when date control mode is calendar", () => {
    const markup = renderToStaticMarkup(
      <MetaControlContent
        sectionId="section-1"
        controlParamId="param-1"
        sectionName="Calendar"
        paramDisplayName="Calendar"
        codeObjType={CodeObjTypeEnum.DateParam}
        value=""
        defaultVal=""
        showSectionTitle={false}
        onValueChange={vi.fn()}
        dateDisplayFormat={DateDisplayFormatEnum.iso}
        dateControlMode={DateControlModeEnum.calendar}
        dateSelectionMode={DateSelectionModeEnum.multiple}
        dateCalendarWeekStart={DateCalendarWeekStartEnum.monday}
      />,
    );

    expect(markup).toContain("Prev");
    expect(markup).toContain("Next");
  });
});
