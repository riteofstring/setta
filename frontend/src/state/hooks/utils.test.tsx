/* @vitest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLocalPendingValue } from "./utils";

type HarnessProps = {
  globalValue: string;
  ownerKey: string;
  onGlobalUpdate?: (value: string) => void;
  registerSetter: (setter: (value: string) => void) => void;
};

function PendingValueHarness({
  globalValue,
  ownerKey,
  onGlobalUpdate,
  registerSetter,
}: HarnessProps) {
  const [value, setPendingValue] = useLocalPendingValue(
    globalValue,
    onGlobalUpdate,
    ownerKey,
  );

  React.useEffect(() => {
    registerSetter(setPendingValue);
  }, [registerSetter, setPendingValue]);

  return (
    <div data-testid="pending-value">{value === "" ? "__EMPTY__" : value}</div>
  );
}

type RenderedHarness = {
  host: HTMLDivElement;
  root: Root;
  rerender: (props: Omit<HarnessProps, "registerSetter">) => Promise<void>;
  readValue: () => string;
  setPendingValue: (value: string) => Promise<void>;
};

async function renderHarness(
  props: Omit<HarnessProps, "registerSetter">,
): Promise<RenderedHarness> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  let setPendingValueRef: ((value: string) => void) | null = null;

  async function render(nextProps: Omit<HarnessProps, "registerSetter">) {
    await act(async () => {
      root.render(
        <PendingValueHarness
          {...nextProps}
          registerSetter={(setter) => {
            setPendingValueRef = setter;
          }}
        />,
      );
    });
  }

  await render(props);

  return {
    host,
    root,
    rerender: render,
    readValue: () =>
      host.querySelector('[data-testid="pending-value"]')?.textContent ?? "",
    setPendingValue: async (value: string) => {
      if (!setPendingValueRef) {
        throw new Error("pending setter not registered");
      }
      await act(async () => {
        setPendingValueRef?.(value);
      });
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useLocalPendingValue", () => {
  it("clears stale pending value when the owner changes", async () => {
    const onGlobalUpdate = vi.fn();
    const harness = await renderHarness({
      globalValue: "alpha",
      ownerKey: "variant-a",
      onGlobalUpdate,
    });

    await harness.setPendingValue("draft-a");
    expect(harness.readValue()).toBe("draft-a");

    await harness.rerender({
      globalValue: "",
      ownerKey: "variant-b",
      onGlobalUpdate,
    });

    expect(harness.readValue()).toBe("__EMPTY__");
    expect(onGlobalUpdate).not.toHaveBeenCalled();

    await act(async () => {
      harness.root.unmount();
    });
  });

  it("preserves empty-string pending values until the global value catches up", async () => {
    const onGlobalUpdate = vi.fn();
    const harness = await renderHarness({
      globalValue: "filled",
      ownerKey: "variant-a",
      onGlobalUpdate,
    });

    await harness.setPendingValue("");
    expect(harness.readValue()).toBe("__EMPTY__");

    await harness.rerender({
      globalValue: "server-stale",
      ownerKey: "variant-a",
      onGlobalUpdate,
    });

    expect(harness.readValue()).toBe("__EMPTY__");
    expect(onGlobalUpdate).toHaveBeenCalledTimes(1);
    expect(onGlobalUpdate).toHaveBeenCalledWith("");

    await harness.rerender({
      globalValue: "",
      ownerKey: "variant-a",
      onGlobalUpdate,
    });

    expect(harness.readValue()).toBe("__EMPTY__");

    await act(async () => {
      harness.root.unmount();
    });
  });
});
