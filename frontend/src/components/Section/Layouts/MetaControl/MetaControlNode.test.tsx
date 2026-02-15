import { renderToStaticMarkup } from "react-dom/server";
import {
  CodeObjTypeEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  TimeControlModeEnum,
  TextParamInputUITypeEnum,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { MetaControlContent } from "./MetaControlNode";

describe("MetaControlContent text param rendering", () => {
  it("renders a date input when text param uiType is date", () => {
    const markup = renderToStaticMarkup(
      <MetaControlContent
        sectionId="section-1"
        controlParamId="param-1"
        sectionName="Date Control"
        paramDisplayName="Date Control"
        codeObjType={CodeObjTypeEnum.TextParam}
        value="2026-02-15"
        defaultVal=""
        showSectionTitle={false}
        onValueChange={vi.fn()}
        textParamUiType={TextParamInputUITypeEnum.date}
        timeDisplayFormat={TimeDisplayFormatEnum.twenty_four_hour}
        dateDisplayFormat={DateDisplayFormatEnum.iso}
      />,
    );

    expect(markup).toContain('type="date"');
    expect(markup).toContain('value="2026-02-15"');
  });

  it("renders a time input when text param uiType is time", () => {
    const markup = renderToStaticMarkup(
      <MetaControlContent
        sectionId="section-1"
        controlParamId="param-1"
        sectionName="Time Control"
        paramDisplayName="Time Control"
        codeObjType={CodeObjTypeEnum.TextParam}
        value="13:45"
        defaultVal=""
        showSectionTitle={false}
        onValueChange={vi.fn()}
        textParamUiType={TextParamInputUITypeEnum.time}
        timeControlMode={TimeControlModeEnum.input}
        timeDisplayFormat={TimeDisplayFormatEnum.twelve_hour}
        dateDisplayFormat={DateDisplayFormatEnum.iso}
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
        codeObjType={CodeObjTypeEnum.TextParam}
        value="13:45"
        defaultVal=""
        showSectionTitle={false}
        onValueChange={vi.fn()}
        textParamUiType={TextParamInputUITypeEnum.time}
        timeControlMode={TimeControlModeEnum.display}
        timeDisplayFormat={TimeDisplayFormatEnum.twelve_hour}
        dateDisplayFormat={DateDisplayFormatEnum.iso}
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
        codeObjType={CodeObjTypeEnum.TextParam}
        value=""
        defaultVal=""
        showSectionTitle={false}
        onValueChange={vi.fn()}
        textParamUiType={TextParamInputUITypeEnum.date}
        timeDisplayFormat={TimeDisplayFormatEnum.twenty_four_hour}
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
