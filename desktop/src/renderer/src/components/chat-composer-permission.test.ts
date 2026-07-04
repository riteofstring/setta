import { expect, test } from "vitest";

import { permissionScopeActive } from "./chat-composer-permission";

test("permission picker scope is active only for the selected conversation", () => {
  expect(permissionScopeActive("conversation_a", "conversation_a")).toBe(true);
  expect(permissionScopeActive("conversation_a", "conversation_b")).toBe(false);
  expect(permissionScopeActive("", "conversation_a")).toBe(false);
  expect(permissionScopeActive("conversation_a", "")).toBe(false);
});
