import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

type ScopedAxeOptions = {
  readonly disabledRules?: readonly string[] | undefined;
  readonly include: string;
};

export async function expectScopedAxeClean(
  page: Page,
  { disabledRules = [], include }: ScopedAxeOptions,
) {
  let builder = new AxeBuilder({ page }).include(include);
  if (disabledRules.length > 0) {
    builder = builder.disableRules([...disabledRules]);
  }
  const results = await builder.analyze();
  expect(results.violations).toEqual([]);
  return results;
}
