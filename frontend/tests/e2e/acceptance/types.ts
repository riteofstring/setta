export type AcceptanceStep = {
  keyword: "Given" | "When" | "Then" | "And";
  text: string;
  docString?: string;
};

export type AcceptanceScenario = {
  feature: string;
  name: string;
  source: string;
  sourceHash: string;
  steps: AcceptanceStep[];
};
