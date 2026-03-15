import { describe, expect, it } from "vitest";
import { runWithRevealMutationLock } from "./uiSettingRevealMutationLock";

describe("runWithRevealMutationLock", () => {
  it("serializes reveal mutation work so later operations wait for the current lease", async () => {
    const order: Array<string> = [];
    let releaseFirstOperation: (() => void) | null = null;
    const firstOperationGate = new Promise<void>((resolve) => {
      releaseFirstOperation = resolve;
    });

    const firstOperation = runWithRevealMutationLock(async () => {
      order.push("first:start");
      await firstOperationGate;
      order.push("first:end");
      return "first";
    });
    const secondOperation = runWithRevealMutationLock(() => {
      order.push("second:start");
      return "second";
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["first:start"]);

    releaseFirstOperation?.();

    await expect(firstOperation).resolves.toBe("first");
    await expect(secondOperation).resolves.toBe("second");
    expect(order).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("releases the lock when an operation throws so later work can continue", async () => {
    await expect(
      runWithRevealMutationLock(() => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(runWithRevealMutationLock(() => "after-error")).resolves.toBe(
      "after-error",
    );
  });
});
