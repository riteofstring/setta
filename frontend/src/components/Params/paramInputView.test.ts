import {
  CodeObjTypeEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildDropzoneDependencyEvents,
  planParamInputChange,
  shouldRevealPasswordValue,
} from "./paramInputView";

describe("planParamInputChange", () => {
  it("normalizes non-string values and keeps the standard backend update path", () => {
    expect(
      planParamInputChange({
        previousValue: "1",
        nextValue: 2,
        codeObjType: CodeObjTypeEnum.CodeParam,
      }),
    ).toEqual({
      nextValue: "2",
      shouldEmitRealtime: true,
      backendUpdateKind: "standard",
    });
  });

  it("suppresses realtime emission for unchanged values while keeping the backend update", () => {
    expect(
      planParamInputChange({
        previousValue: "same",
        nextValue: "same",
        codeObjType: CodeObjTypeEnum.TextParam,
      }),
    ).toEqual({
      nextValue: "same",
      shouldEmitRealtime: false,
      backendUpdateKind: "standard",
    });
  });

  it("routes password params through the password backend path and still skips realtime", () => {
    expect(
      planParamInputChange({
        previousValue: "",
        nextValue: "secret",
        codeObjType: CodeObjTypeEnum.PasswordParam,
      }),
    ).toEqual({
      nextValue: "secret",
      shouldEmitRealtime: false,
      backendUpdateKind: "password",
    });
  });

  it("respects skipBackendUpdate without changing the local value plan", () => {
    expect(
      planParamInputChange({
        previousValue: "before",
        nextValue: "after",
        codeObjType: CodeObjTypeEnum.CodeParam,
        options: { skipBackendUpdate: true },
      }),
    ).toEqual({
      nextValue: "after",
      shouldEmitRealtime: true,
      backendUpdateKind: null,
    });
  });
});

describe("shouldRevealPasswordValue", () => {
  it("only reveals saved password params when the value is still hidden", () => {
    expect(
      shouldRevealPasswordValue({
        codeObjType: CodeObjTypeEnum.PasswordParam,
        isRevealing: false,
        value: "",
      }),
    ).toBe(true);
    expect(
      shouldRevealPasswordValue({
        codeObjType: CodeObjTypeEnum.PasswordParam,
        isRevealing: true,
        value: "",
      }),
    ).toBe(false);
    expect(
      shouldRevealPasswordValue({
        codeObjType: CodeObjTypeEnum.CodeParam,
        isRevealing: false,
        value: "",
      }),
    ).toBe(false);
  });
});

describe("buildDropzoneDependencyEvents", () => {
  it("emits the metadata event first, then binary upload events for file attachments", () => {
    const binaryPayload = new ArrayBuffer(8);
    const events = buildDropzoneDependencyEvents({
      sectionId: "section-1",
      paramInfoId: "param-1",
      attachments: [
        {
          kind: "file",
          name: "report.pdf",
          mimeType: "application/pdf",
          size: 42,
          contentId: "artifact/report.pdf",
          byteLength: 42,
          binaryPayload,
        },
        {
          kind: "text",
          name: "notes.txt",
          text: "hello",
        },
      ],
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      dependencyKey: {
        type: DependencyKeyTypeEnum.SectionParam,
        sectionId: "section-1",
        codeObjId: "param-1",
      },
      payload: {
        type: DependencyValueTypeEnum.Literal,
        payload: JSON.stringify({
          sectionId: "section-1",
          paramInfoId: "param-1",
          attachments: [
            {
              kind: "file",
              name: "report.pdf",
              mimeType: "application/pdf",
              size: 42,
              contentId: "artifact/report.pdf",
              byteLength: 42,
            },
            {
              kind: "text",
              name: "notes.txt",
              text: "hello",
            },
          ],
        }),
      },
    });
    expect(events[1]).toEqual({
      dependencyKey: {
        type: DependencyKeyTypeEnum.SectionParam,
        sectionId: "section-1",
        codeObjId: "param-1",
      },
      payload: {
        type: DependencyValueTypeEnum.Binary,
        payload: {
          contentId: "artifact/report.pdf",
          byteLength: 42,
          mimeType: "application/pdf",
        },
      },
      binaryPayload,
    });
  });

  it("returns no events when the dropzone receives no attachments", () => {
    expect(
      buildDropzoneDependencyEvents({
        sectionId: "section-1",
        paramInfoId: "param-1",
        attachments: [],
      }),
    ).toEqual([]);
  });
});
