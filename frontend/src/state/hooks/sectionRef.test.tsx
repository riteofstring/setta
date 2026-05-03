/* @vitest-environment jsdom */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSectionRefs } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it } from "vitest";
import {
  useSectionRefAndInit,
  type SectionRefRegistrationMode,
} from "./sectionRef";

let root: Root | null = null;

describe("useSectionRefAndInit", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.innerHTML = "";
    resetProjectStores();
  });

  it("registers legacy full-subtree refs only when requested", () => {
    renderHarness(
      <SectionRefHarness sectionId="section-a" type="withNested" />,
    );

    const refs = useSectionRefs.getState();
    expect(refs.withNested["section-a"]).toBeInstanceOf(HTMLDivElement);
    expect(refs.selfOnly["section-a"]).toBeUndefined();
  });

  it("does not write section refs for scene wrappers that opt out", () => {
    renderHarness(<SectionRefHarness sectionId="scene-section" type="none" />);

    const refs = useSectionRefs.getState();
    expect(refs.withNested["scene-section"]).toBeUndefined();
    expect(refs.selfOnly["scene-section"]).toBeUndefined();
  });
});

function SectionRefHarness({
  sectionId,
  type,
}: {
  readonly sectionId: string;
  readonly type: SectionRefRegistrationMode;
}) {
  const ref = useSectionRefAndInit(sectionId, type);
  return <div ref={ref} />;
}

function renderHarness(element: ReactElement): void {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
}
