import { type Locator, type Page } from "@playwright/test";

export async function seedAIStore(
  page: Page,
  patch: Record<string, unknown>,
): Promise<void> {
  await page.addInitScript((nextState) => {
    const key = "setta_ai_data";
    let payload: { state: Record<string, unknown>; version: number } = {
      state: {},
      version: 0,
    };
    const raw = window.localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          state?: unknown;
          version?: unknown;
        };
        payload = {
          state:
            parsed && typeof parsed.state === "object" && parsed.state !== null
              ? (parsed.state as Record<string, unknown>)
              : {},
          version: typeof parsed?.version === "number" ? parsed.version : 0,
        };
      } catch {
        payload = { state: {}, version: 0 };
      }
    }
    payload.state = { ...payload.state, ...nextState };
    window.localStorage.setItem(key, JSON.stringify(payload));
  }, patch);
}

export async function bindVisibleProjectChatWindowToChatId(
  page: Page,
  chatId: string,
): Promise<void> {
  await page.evaluate(async (nextChatId: string) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const {
      ChatWindowPlacementEnum,
      createProjectChatWindowInstance,
      createProjectChatWindowingState,
    } = await import("/src/utils/generatedTypes.ts");
    useProjectState.setState((state) => {
      const firstWindowId =
        state.projectChatWindowing.order[0] ?? "project-chat-window-1";
      const current =
        state.projectChatWindowing.instancesById[firstWindowId] ?? null;
      if (!current) {
        state.projectChatWindowing = createProjectChatWindowingState({
          order: [firstWindowId],
          instancesById: {
            [firstWindowId]: createProjectChatWindowInstance({
              instanceId: firstWindowId,
              placement: ChatWindowPlacementEnum.bottom_docked,
              chatId: nextChatId,
              isMinimized: false,
            }),
          },
        });
        return;
      }
      state.projectChatWindowing.instancesById[firstWindowId] = {
        ...current,
        chatId: nextChatId,
        isMinimized: false,
      };
    });
  }, chatId);
}

export async function openProjectAIChatSurface(page: Page): Promise<void> {
  await selectProjectAIChatTab(page);
  if (await hasVisibleProjectAIChatSurface(page)) {
    return;
  }

  const createButton = page.getByTestId("project-chat-bottom-dock-create");
  if (await createButton.isVisible().catch(() => false)) {
    await createButton.click();
  }
  await page
    .getByTestId("project-chat-bottom-dock-window-panel")
    .first()
    .waitFor({ state: "visible" });
}

export async function selectProjectAIChatTab(page: Page): Promise<void> {
  await page.waitForSelector(".react-flow__pane");
  await page.getByTestId("overview-tab-project-ai-chat").click();
}

async function hasVisibleProjectAIChatSurface(page: Page): Promise<boolean> {
  const candidates: Locator[] = [
    page.getByTestId("project-chat-maximized-window").first(),
    page.getByTestId("project-chat-floating-window").first(),
    page.getByTestId("project-chat-bottom-dock-window-panel").first(),
    page
      .locator('#OverviewPane [data-chat-surface-mode="project_ai_mode"]')
      .first(),
  ];

  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      return true;
    }
  }
  return false;
}

export function buildGetLLMResponseResponse(chatId: string) {
  return chatId;
}
