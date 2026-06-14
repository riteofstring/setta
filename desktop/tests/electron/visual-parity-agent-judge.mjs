/* global clearTimeout, setTimeout */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

export async function agentJudgeVerdict({
  appMetrics,
  appPath,
  artifactDir,
  controlScorecard,
  mockupPath,
  options,
  repoRoot,
  scene,
  scorecard,
  target,
}) {
  if (options.agentJudgeFile) {
    const verdict = sceneVerdictFromFile(
      JSON.parse(await readTextFile(options.agentJudgeFile)),
      scene,
    );
    return normalizeAgentJudgeVerdict({
      scene,
      scorecard,
      source: options.agentJudgeFile,
      status: "provided",
      verdict,
    });
  }
  if (options.agentJudgeRunner === "none") {
    return {
      criteria: {},
      pass: false,
      reason:
        "No configured vision-agent judge is available in this run. Use --agent-judge-runner codex-cli or provide --agent-judge-file with a structured verdict from an authorized image-capable agent.",
      required: true,
      scene,
      status: "missing",
    };
  }
  if (options.agentJudgeRunner !== "codex-cli") {
    throw new Error(`unsupported visual parity agent judge runner: ${options.agentJudgeRunner}`);
  }

  const trials = [];
  for (let trial = 1; trial <= options.agentJudgeTrials; trial += 1) {
    const verdict = await runCodexCliAgentJudgeTrial({
      appMetrics,
      appPath,
      artifactDir,
      controlScorecard,
      mockupPath,
      options,
      repoRoot,
      scene,
      scorecard,
      target,
      trial,
    });
    trials.push(verdict);
  }
  return aggregateAgentJudgeVerdicts({
    runner: options.agentJudgeRunner,
    scene,
    scorecard,
    status: "judged",
    trials,
  });
}

function sceneVerdictFromFile(verdict, scene) {
  if (verdict.scenes && typeof verdict.scenes === "object" && verdict.scenes[scene]) {
    return verdict.scenes[scene];
  }
  if (verdict[scene] && typeof verdict[scene] === "object") {
    return verdict[scene];
  }
  return verdict;
}

function normalizeAgentJudgeVerdict({ scene, scorecard, source, status, verdict }) {
  if (Array.isArray(verdict.trials)) {
    return aggregateAgentJudgeVerdicts({
      runner: source,
      scene,
      scorecard,
      status,
      trials: verdict.trials.map((trial, index) =>
        normalizeAgentJudgeTrialVerdict(trial, index + 1),
      ),
    });
  }
  if (typeof verdict.pass !== "boolean") {
    throw new Error(`agent judge verdict for ${scene} must contain a boolean pass field`);
  }
  const normalized = normalizeAgentJudgeTrialVerdict(verdict, 1);
  return {
    deterministicPass: scorecard.pass,
    majority: {
      failCount: normalized.pass ? 0 : 1,
      passCount: normalized.pass ? 1 : 0,
      threshold: 1,
      trialCount: 1,
    },
    pass: scorecard.pass && normalized.pass,
    required: true,
    runner: source,
    scene,
    status,
    trials: [normalized],
  };
}

function aggregateAgentJudgeVerdicts({ runner, scene, scorecard, status, trials }) {
  const passCount = trials.filter((trial) => trial.pass).length;
  const threshold = Math.floor(trials.length / 2) + 1;
  const majorityPass = passCount >= threshold;
  return {
    deterministicPass: scorecard.pass,
    majority: {
      failCount: trials.length - passCount,
      passCount,
      threshold,
      trialCount: trials.length,
    },
    pass: scorecard.pass && majorityPass,
    required: true,
    runner,
    scene,
    status,
    trials,
  };
}

async function runCodexCliAgentJudgeTrial({
  appMetrics,
  appPath,
  artifactDir,
  controlScorecard,
  mockupPath,
  options,
  repoRoot,
  scene,
  scorecard,
  target,
  trial,
}) {
  const judgeDir = join(artifactDir, scene, "agent-judge", `trial-${trial}`);
  await mkdir(judgeDir, { recursive: true });
  const promptPath = join(judgeDir, "prompt.txt");
  const schemaPath = join(judgeDir, "schema.json");
  const outputPath = join(judgeDir, "verdict.json");
  const prompt = agentJudgePrompt({
    appMetrics,
    appPath,
    controlScorecard,
    mockupPath,
    options,
    scene,
    scorecard,
    target,
    trial,
  });
  await writeFile(promptPath, prompt, "utf8");
  await writeFile(schemaPath, JSON.stringify(agentJudgeOutputSchema(), null, 2), "utf8");

  const args = [
    "exec",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--cd",
    repoRoot,
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath,
    "--image",
    mockupPath,
    "--image",
    appPath,
  ];
  if (options.agentJudgeModel) {
    args.push("--model", options.agentJudgeModel);
  }
  args.push("-");

  const result = await runProcess("codex", args, {
    cwd: repoRoot,
    input: prompt,
    timeoutMs: options.agentJudgeTimeoutMs,
  });
  await writeFile(join(judgeDir, "stdout.txt"), result.stdout, "utf8");
  await writeFile(join(judgeDir, "stderr.txt"), result.stderr, "utf8");
  const verdict = JSON.parse(await readTextFile(outputPath));
  return normalizeAgentJudgeTrialVerdict(verdict, trial);
}

function normalizeAgentJudgeTrialVerdict(verdict, trial) {
  if (typeof verdict.pass !== "boolean") {
    throw new Error(`agent judge trial ${trial} must contain a boolean pass field`);
  }
  return {
    criteria: normalizeAgentJudgeCriteria(verdict.criteria),
    deltas: stringArray(verdict.deltas),
    pass: verdict.pass,
    summary: String(verdict.summary ?? ""),
    trial: Number.isInteger(verdict.trial) ? verdict.trial : trial,
  };
}

function normalizeAgentJudgeCriteria(criteria) {
  if (!criteria || typeof criteria !== "object") {
    throw new Error("agent judge verdict criteria must be an object");
  }
  return Object.fromEntries(
    ["background", "nodeBorders", "edgeGlow", "overallNeonCharacter"].map((name) => {
      const criterion = criteria[name];
      if (!criterion || typeof criterion !== "object") {
        throw new Error(`agent judge verdict criteria.${name} must be an object`);
      }
      if (typeof criterion.pass !== "boolean") {
        throw new Error(`agent judge verdict criteria.${name}.pass must be boolean`);
      }
      const score = Number(criterion.score);
      if (!Number.isFinite(score) || score < 0 || score > 5) {
        throw new Error(`agent judge verdict criteria.${name}.score must be a 0-5 number`);
      }
      return [
        name,
        {
          pass: criterion.pass,
          rationale: String(criterion.rationale ?? ""),
          score,
        },
      ];
    }),
  );
}

function stringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

function agentJudgePrompt({
  appMetrics,
  appPath,
  controlScorecard,
  mockupPath,
  options,
  scene,
  scorecard,
  target,
  trial,
}) {
  return `You are the Setta visual parity judge for Phase 6.5.

Inputs:
- Image 1 is the reference mockup crop: ${mockupPath}
- Image 2 is the production app crop: ${appPath}
- Both images are cropped to the graph canvas at the same fit-to-view framing.

Scene: ${scene}
Trial: ${trial} of ${options.agentJudgeTrials}

The deterministic metric floor is authoritative. If scorecard.pass is false, your verdict must fail.
If scorecard.pass is true, judge whether the app crop is visually equivalent to the mockup crop for:
1. background: background color/luminance and canvas atmosphere.
2. nodeBorders: node/card borders, halos, internal contrast, and readable neon silhouettes.
3. edgeGlow: edge brightness, aura, active-flow energy, and line visibility at fit zoom.
4. overallNeonCharacter: whether the scene reads as the same neon mockup style, not merely nonblank or structurally similar.

Use this scale for each criterion:
0 = missing or unrelated; 1 = severe mismatch; 2 = visible mismatch; 3 = close but still materially off; 4 = parity with small tolerable differences; 5 = indistinguishable for the criterion.
A criterion passes only at score >= 4. The overall pass must be true only when all four criteria pass and the deterministic scorecard passes.

Return only JSON matching the provided schema. Include concrete deltas if failing or marginal.

Deterministic scorecard:
${JSON.stringify(scorecard, null, 2)}

App image metrics:
${JSON.stringify(appMetrics, null, 2)}

Control scorecard:
${JSON.stringify(controlScorecard, null, 2)}

Derived target:
${JSON.stringify(target, null, 2)}
`;
}

function agentJudgeOutputSchema() {
  const criterionSchema = {
    additionalProperties: false,
    properties: {
      pass: { type: "boolean" },
      rationale: { type: "string" },
      score: { maximum: 5, minimum: 0, type: "number" },
    },
    required: ["pass", "rationale", "score"],
    type: "object",
  };
  return {
    additionalProperties: false,
    properties: {
      criteria: {
        additionalProperties: false,
        properties: {
          background: criterionSchema,
          edgeGlow: criterionSchema,
          nodeBorders: criterionSchema,
          overallNeonCharacter: criterionSchema,
        },
        required: ["background", "nodeBorders", "edgeGlow", "overallNeonCharacter"],
        type: "object",
      },
      deltas: {
        items: { type: "string" },
        type: "array",
      },
      pass: { type: "boolean" },
      summary: { type: "string" },
    },
    required: ["pass", "criteria", "deltas", "summary"],
    type: "object",
  };
}

function runProcess(command, args, { cwd, input, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error(
          `${command} ${args.join(" ")} timed out after ${timeoutMs}ms\nstdout:\n${boundedProcessText(
            stdout,
          )}\nstderr:\n${boundedProcessText(stderr)}`,
        ),
      );
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stderr, stdout });
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with code ${code} signal ${signal}\nstdout:\n${boundedProcessText(
            stdout,
          )}\nstderr:\n${boundedProcessText(stderr)}`,
        ),
      );
    });
    child.stdin.end(input);
  });
}

function boundedProcessText(value) {
  if (value.length <= 4000) {
    return value;
  }
  return `${value.slice(0, 2000)}\n...<truncated>...\n${value.slice(-2000)}`;
}

async function readTextFile(path) {
  return readFile(path, "utf8");
}
