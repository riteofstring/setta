import { type Locator, type Page } from "@playwright/test";

export function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}

export function getMessageGroup(section: Locator, text: string): Locator {
  return section.locator("[data-message-id]").filter({ hasText: text }).first();
}

export async function getBubbleWidth(bubble: Locator): Promise<number> {
  return bubble.evaluate((element) => element.getBoundingClientRect().width);
}

export async function getHorizontalOverflowMetrics(bubble: Locator): Promise<{
  overflowPx: number;
  hasScrollOverflow: boolean;
}> {
  return bubble.evaluate((element) => {
    const bubbleElement = element as HTMLElement;
    const bubbleRect = bubbleElement.getBoundingClientRect();
    let overflowPx = 0;
    for (const child of Array.from(bubbleElement.querySelectorAll("*"))) {
      const childRect = child.getBoundingClientRect();
      overflowPx = Math.max(
        overflowPx,
        Math.ceil(childRect.right - bubbleRect.right),
      );
    }
    return {
      overflowPx: Math.max(overflowPx, 0),
      hasScrollOverflow:
        bubbleElement.scrollWidth > bubbleElement.clientWidth + 1,
    };
  });
}

export function formatExpectedChatTimestampTitle(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "long",
  }).format(timestampMs);
}
