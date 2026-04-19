import { expect, test, type Page } from "@playwright/test";

const FRONTEND_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

type HarnessSlashCommand = {
  action: string;
  appGenerationMode: string | null;
  command: string;
  promptTemplate: string;
  requiresImageAttachment: boolean;
  summary: string;
};

type HarnessSubmitCall = {
  attachments: unknown[];
  message: string;
  options: Record<string, unknown> | undefined;
};

type BrowserHarnessState = {
  setSlashCommands: (nextCommands: HarnessSlashCommand[]) => void;
  setWaitingForResponse: (nextWaitingState: boolean) => void;
  slashCommands: HarnessSlashCommand[];
  submitCalls: HarnessSubmitCall[];
};

async function mountChatInputHarness(page: Page): Promise<void> {
  await page.goto(FRONTEND_BASE_URL, {
    waitUntil: "domcontentloaded",
  });
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.evaluate(async () => {
    const { React, createRoot } = await import(
      "/src/testUtils/appRouteTestUtils.ts",
    );
    const { ChatInput } = await import(
      "/src/components/Chat/ChatInput.tsx",
    );

    document.body.innerHTML = '<div id="chat-input-harness-root"></div>';
    const rootElement = document.getElementById("chat-input-harness-root");
    if (!rootElement) {
      throw new Error("Expected chat-input-harness-root.");
    }

    const initialSlashCommands: HarnessSlashCommand[] = [
      {
        command: "/wireframe",
        action: "custom_prompt",
        summary: "Generate a wireframe app.",
        promptTemplate: "Create a wireframe dashboard.",
        appGenerationMode: "json_render",
        requiresImageAttachment: false,
      },
    ];

    const harnessWindow = window as typeof window & {
      __chatInputReplayHarness: BrowserHarnessState;
    };

    harnessWindow.__chatInputReplayHarness = {
      slashCommands: initialSlashCommands,
      submitCalls: [],
      setSlashCommands: (_nextCommands: HarnessSlashCommand[]) => {},
      setWaitingForResponse: (_nextWaitingState: boolean) => {},
    };

    function App() {
      const [waitingForResponse, setWaitingForResponse] = React.useState(true);
      const [slashCommands, setSlashCommands] = React.useState(
        initialSlashCommands,
      );

      harnessWindow.__chatInputReplayHarness.slashCommands = slashCommands;
      harnessWindow.__chatInputReplayHarness.setSlashCommands = (
        nextCommands,
      ) => {
        setSlashCommands(nextCommands);
      };
      harnessWindow.__chatInputReplayHarness.setWaitingForResponse = (
        nextWaitingState,
      ) => {
        setWaitingForResponse(nextWaitingState);
      };

      return React.createElement(
        "div",
        {
          style: {
            margin: "24px auto",
            maxWidth: "720px",
            padding: "16px",
          },
        },
        React.createElement(ChatInput, {
          placeholderText: "Type a message...",
          waitingForResponse,
          slashCommands,
          recognizedSlashCommands: slashCommands,
          onSubmit: async (message, attachments, options) => {
            harnessWindow.__chatInputReplayHarness.submitCalls.push({
              attachments,
              message,
              options,
            });
            return true;
          },
          onStop: () => {
            setWaitingForResponse(false);
          },
          onSlashCommand: async () => true,
        }),
      );
    }

    createRoot(rootElement).render(React.createElement(App));
  });
}

async function updateWireframeCommandToRequireImage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const harnessWindow = window as typeof window & {
      __chatInputReplayHarness: BrowserHarnessState;
    };
    const nextCommands = harnessWindow.__chatInputReplayHarness.slashCommands.map(
      (command) =>
        command.command === "/wireframe"
          ? {
              ...command,
              appGenerationMode: "json_render_with_image",
              promptTemplate:
                "Create a wireframe dashboard from image references.",
              requiresImageAttachment: true,
            }
          : command,
    );
    harnessWindow.__chatInputReplayHarness.setSlashCommands(nextCommands);
  });
}

async function releaseQueuedReplay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const harnessWindow = window as typeof window & {
      __chatInputReplayHarness: BrowserHarnessState;
    };
    harnessWindow.__chatInputReplayHarness.setWaitingForResponse(false);
  });
}

async function readSubmitCalls(page: Page): Promise<HarnessSubmitCall[]> {
  return await page.evaluate(() => {
    const harnessWindow = window as typeof window & {
      __chatInputReplayHarness: BrowserHarnessState;
    };
    return harnessWindow.__chatInputReplayHarness.submitCalls;
  });
}

test("queued current-registry slash-command replays revalidate against the refreshed browser registry", async ({
  page,
}) => {
  await mountChatInputHarness(page);

  const textarea = page.getByTestId("chat-input-textarea");
  await expect(textarea).toBeVisible();
  await textarea.fill("/wireframe support ops");
  await textarea.press("Tab");

  const queuedDraft = page
    .locator('[data-chat-queued-draft="true"]')
    .filter({ hasText: "/wireframe support ops" })
    .first();
  await expect(queuedDraft).toBeVisible();

  await updateWireframeCommandToRequireImage(page);
  await releaseQueuedReplay(page);

  await expect(page.getByText("Attach at least one image before using /wireframe.")).toBeVisible();
  await expect(queuedDraft).toBeVisible();
  await expect.poll(() => readSubmitCalls(page)).toEqual([]);
});
