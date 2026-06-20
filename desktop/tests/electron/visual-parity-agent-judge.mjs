/* global clearTimeout, setTimeout */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

export async function agentJudgeVerdict({
  animationEvidence,
  animationScorecard,
  appMetrics,
  appPath,
  artifactDir,
  controlScorecard,
  deterministicPass,
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
      source: options.agentJudgeFile,
      status: "provided",
      verdict,
      deterministicPass,
    });
  }
  if (options.agentJudgeRunner === "none") {
    throw new Error(
      "Phase 6.5 requires a configured vision-agent judge; --agent-judge-runner none is not allowed.",
    );
  }
  if (options.agentJudgeRunner !== "codex-cli") {
    throw new Error(`unsupported visual parity agent judge runner: ${options.agentJudgeRunner}`);
  }

  const trials = [];
  for (let trial = 1; trial <= options.agentJudgeTrials; trial += 1) {
    const verdict = await runCodexCliAgentJudgeTrial({
      animationEvidence,
      animationScorecard,
      appMetrics,
      appPath,
      artifactDir,
      controlScorecard,
      deterministicPass,
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
    deterministicPass,
    runner: options.agentJudgeRunner,
    scene,
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

function normalizeAgentJudgeVerdict({ deterministicPass, scene, source, status, verdict }) {
  if (Array.isArray(verdict.trials)) {
    return aggregateAgentJudgeVerdicts({
      deterministicPass,
      runner: source,
      scene,
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
    deterministicPass,
    majority: {
      failCount: normalized.pass ? 0 : 1,
      passCount: normalized.pass ? 1 : 0,
      threshold: 1,
      trialCount: 1,
    },
    pass: deterministicPass && normalized.pass,
    required: true,
    runner: source,
    scene,
    status,
    trials: [normalized],
  };
}

function aggregateAgentJudgeVerdicts({ deterministicPass, runner, scene, status, trials }) {
  const passCount = trials.filter((trial) => trial.pass).length;
  const threshold = Math.floor(trials.length / 2) + 1;
  const majorityPass = passCount >= threshold;
  return {
    deterministicPass,
    majority: {
      failCount: trials.length - passCount,
      passCount,
      threshold,
      trialCount: trials.length,
    },
    pass: deterministicPass && majorityPass,
    required: true,
    runner,
    scene,
    status,
    trials,
  };
}

async function runCodexCliAgentJudgeTrial({
  animationEvidence,
  animationScorecard,
  appMetrics,
  appPath,
  artifactDir,
  controlScorecard,
  deterministicPass,
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
    animationEvidence,
    animationScorecard,
    appMetrics,
    appPath,
    controlScorecard,
    deterministicPass,
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
  if (animationEvidence) {
    args.push("--image", animationEvidence.mockupContactSheetPath);
    args.push("--image", animationEvidence.appContactSheetPath);
  }
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
    [
      "background",
      "nodeBorders",
      "edgeGlow",
      "overallNeonCharacter",
      "pulseShimmerFeel",
      "flickerJank",
    ].map((name) => {
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
  animationEvidence,
  animationScorecard,
  appMetrics,
  appPath,
  controlScorecard,
  deterministicPass,
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
${
  animationEvidence
    ? `- Image 3 is the reference mockup animation contact sheet: ${animationEvidence.mockupContactSheetPath}
- Image 4 is the production app animation contact sheet: ${animationEvidence.appContactSheetPath}
- The side-by-side animation contact sheet is saved at: ${animationEvidence.contactSheetPath}`
    : "- This scene has no animation requirement; no contact-sheet images are attached."
}

Scene: ${scene}
Trial: ${trial} of ${options.agentJudgeTrials}

The deterministic metric floor is authoritative. If deterministicPass is false, your verdict must fail.
If deterministicPass is true, judge whether the app crop is visually equivalent to the mockup crop for:
1. background: background color/luminance and canvas atmosphere.
2. nodeBorders: node/card borders, halos, internal contrast, and readable neon silhouettes.
3. edgeGlow: edge brightness, aura, active-flow energy, and line visibility at fit zoom.
4. overallNeonCharacter: whether the scene reads as the same neon mockup style, not merely nonblank or structurally similar.
5. pulseShimmerFeel: for animated scenes, whether the contact sheets show comparable directional workflow pulses or semantic shimmer/breathing/tendril motion. For static scenes this passes when no motion evidence is required.
6. flickerJank: for animated scenes, whether the contact sheets avoid frozen-frame behavior, whole-frame flicker, and jarring instability. For static scenes this passes when no motion evidence is required.

Use this scale for each criterion:
0 = missing or unrelated; 1 = severe mismatch; 2 = visible mismatch; 3 = close but still materially off; 4 = parity with small tolerable differences; 5 = indistinguishable for the criterion.
A criterion passes only at score >= 4. The overall pass must be true only when all six criteria pass and deterministicPass is true.

Return only JSON matching the provided schema. Include concrete deltas if failing or marginal.

Deterministic pass:
${JSON.stringify(deterministicPass, null, 2)}

Deterministic scorecard:
${JSON.stringify(scorecard, null, 2)}

Animation scorecard:
${JSON.stringify(animationScorecard, null, 2)}

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
          pulseShimmerFeel: criterionSchema,
          flickerJank: criterionSchema,
        },
        required: [
          "background",
          "nodeBorders",
          "edgeGlow",
          "overallNeonCharacter",
          "pulseShimmerFeel",
          "flickerJank",
        ],
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
