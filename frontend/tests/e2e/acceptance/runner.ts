import type { Page } from "@playwright/test";
import type { AcceptanceScenario, AcceptanceStep } from "./types";
import { stepDefinitions } from "./steps";

type AcceptanceContext = {
  page: Page;
  projectConfigId?: string;
  projectConfigName?: string;
  sectionId?: string;
  sectionName?: string;
  cleanups: Array<() => Promise<void>>;
};

type StepMatch = {
  definition: StepDefinition;
  match: RegExpMatchArray;
};

export type StepDefinition = {
  pattern: RegExp;
  handler: (
    context: AcceptanceContext,
    step: AcceptanceStep,
    match: RegExpMatchArray,
  ) => Promise<void>;
};

export async function runAcceptanceScenario(
  page: Page,
  scenario: AcceptanceScenario,
): Promise<void> {
  const context: AcceptanceContext = {
    page,
    cleanups: [],
  };

  try {
    for (const step of scenario.steps) {
      const match = findStep(step);
      if (!match) {
        throw new Error(
          `No step definition for: "${step.keyword} ${step.text}" (source: ${scenario.source})`,
        );
      }
      await match.definition.handler(context, step, match.match);
    }
  } finally {
    for (const cleanup of context.cleanups.reverse()) {
      await cleanup();
    }
  }
}

function findStep(step: AcceptanceStep): StepMatch | null {
  for (const definition of stepDefinitions) {
    const match = step.text.match(definition.pattern);
    if (match) {
      return { definition, match };
    }
  }
  return null;
}
