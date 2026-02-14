import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DateDisplayFormatEnum,
  TextParamInputUITypeEnum,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";
import { TextParamDateTimeInput } from "./TextParamInput";

describe("TextParamDateTimeInput", () => {
  it("renders time input with formatted display text", () => {
    const markup = renderToStaticMarkup(
      <TextParamDateTimeInput
        value="13:05"
        onChange={vi.fn()}
        isDisabled={false}
        uiType={TextParamInputUITypeEnum.time}
        timeDisplayFormat={TimeDisplayFormatEnum.twelve_hour}
        dateDisplayFormat={DateDisplayFormatEnum.iso}
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
        timeDisplayFormat={TimeDisplayFormatEnum.twenty_four_hour}
        dateDisplayFormat={DateDisplayFormatEnum.us}
      />,
    );

    expect(markup).toContain('type="date"');
    expect(markup).toContain('value="2026-12-31"');
    expect(markup).toContain("12/31/2026");
  });
});
