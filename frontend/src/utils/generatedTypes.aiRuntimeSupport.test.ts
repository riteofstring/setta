import {
  AgentRunStatusEnum,
  AgenticEdgeKindEnum,
  ButtonActionModeEnum,
  CodeObjTypeEnum,
  createAgentRun,
  createAgenticEdge,
  createEngineConfig,
  createRunEvent,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateParamCodeObjImpl,
  DateSelectionModeEnum,
  DropzoneModeEnum,
  EngineTypeEnum,
  HttpRequestMethodEnum,
  TimeControlModeEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
  TimeParamCodeObjImpl,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated AI/runtime support", () => {
  it("creates isolated engine and run helper defaults", () => {
    const firstEngine = createEngineConfig();
    const secondEngine = createEngineConfig();
    const firstRun = createAgentRun();
    const secondRun = createAgentRun();

    firstEngine.defaults.thinking = true;
    firstRun.events.push(createRunEvent({ id: "event-1" }));
    firstRun.toolCalls.push({ tool: "list" });

    expect(firstEngine.engineType).toBe(EngineTypeEnum.setta_llm);
    expect(secondEngine.defaults.thinking).toBeNull();
    expect(firstRun.status).toBe(AgentRunStatusEnum.queued);
    expect(secondRun.events).toHaveLength(0);
    expect(secondRun.toolCalls).toHaveLength(0);
  });

  it("creates agentic edges with canonical enum defaults", () => {
    const edge = createAgenticEdge({
      id: "edge-1",
      sourceSectionId: "section-a",
      targetSectionId: "section-b",
      kind: AgenticEdgeKindEnum.chat_section,
    });

    expect(edge.kind).toBe(AgenticEdgeKindEnum.chat_section);
    expect(edge.contextMode).toBeNull();
    expect(edge.style).toEqual({});
  });

  it("exports the current param UI type shapes for date/time and action controls", () => {
    const dateParam: DateParamCodeObjImpl = {
      type: CodeObjTypeEnum.DateParam,
      id: "date-param-1",
      name: "Due date",
      description: "",
      isPreset: false,
      coreNameType: "TEXT",
      coreNameEditable: false,
      passingStyle: "DEFAULT",
      typeAnnotation: "",
      defaultVal: "",
      value: "",
      dateDisplayFormat: DateDisplayFormatEnum.us,
      dateControlMode: DateControlModeEnum.calendar,
      dateSelectionMode: DateSelectionModeEnum.multiple,
      dateCalendarWeekStart: DateCalendarWeekStartEnum.monday,
      dateIncludesTime: true,
    };
    const timeParam: TimeParamCodeObjImpl = {
      type: CodeObjTypeEnum.TimeParam,
      id: "time-param-1",
      name: "Start time",
      description: "",
      isPreset: false,
      coreNameType: "TEXT",
      coreNameEditable: false,
      passingStyle: "DEFAULT",
      typeAnnotation: "",
      defaultVal: "",
      value: "",
      timeControlMode: TimeControlModeEnum.display,
      timeDisplayFormat: TimeDisplayFormatEnum.twelve_hour,
      timeDisplayTransparent: true,
      timeDisplayScale: 1.5,
      timeDisplayFont: TimeDisplayFontEnum.clock,
    };

    expect(dateParam.dateCalendarWeekStart).toBe(
      DateCalendarWeekStartEnum.monday,
    );
    expect(timeParam.timeDisplayFont).toBe(TimeDisplayFontEnum.clock);
    expect(ButtonActionModeEnum.HTTP_REQUEST).toBe("HTTP_REQUEST");
    expect(HttpRequestMethodEnum.POST).toBe("POST");
    expect(DropzoneModeEnum.STATEFUL).toBe("STATEFUL");
  });
});
