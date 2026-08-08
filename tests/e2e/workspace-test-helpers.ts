import type { Page } from "@playwright/test";

type BrowserViewport = Readonly<{ x: number; y: number; zoom: number }>;

export async function canvasViewport(page: Page): Promise<BrowserViewport> {
  const value = await page.getByTestId("canvas-shell-document").inputValue();
  return (JSON.parse(value) as { viewport: BrowserViewport }).viewport;
}

export async function addSampleSection(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add section" }).click();
  const picker = page.getByRole("dialog", { name: "Add a section" });
  await picker.getByRole("button", { name: "Sample note" }).click();
}
