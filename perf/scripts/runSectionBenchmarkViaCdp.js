"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { chromium } = require(
  require.resolve("@playwright/test", {
    paths: [path.resolve(__dirname, "../../frontend")],
  }),
);

const {
  SECTION_PAN_ZOOM_BENCHMARK_REPLAY,
} = require("./sectionPanZoomBenchmarkReplay");
const { getSectionBenchmarkScene } = require("./sectionBenchmarkScenes");
const {
  summarizeTrace,
} = require("./summarizeSectionTopLevelGridBenchmarkTrace");

const TRACE_CATEGORIES = [
  "blink.user_timing",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-v8.cpu_profiler",
  "loading",
].join(",");

function parseArgs(argv) {
  const options = {
    help: false,
    browserUrl: null,
    pageUrl: null,
    sceneId: null,
    tracePath: null,
    benchmarkResultPath: null,
    summaryPath: null,
  };

  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--browser-url") {
      options.browserUrl = argv[idx + 1] ?? null;
      idx += 1;
      continue;
    }
    if (arg === "--page-url") {
      options.pageUrl = argv[idx + 1] ?? null;
      idx += 1;
      continue;
    }
    if (arg === "--scene-id") {
      options.sceneId = argv[idx + 1] ?? null;
      idx += 1;
      continue;
    }
    if (arg === "--trace-path") {
      options.tracePath = argv[idx + 1] ?? null;
      idx += 1;
      continue;
    }
    if (arg === "--benchmark-result-path") {
      options.benchmarkResultPath = argv[idx + 1] ?? null;
      idx += 1;
      continue;
    }
    if (arg === "--summary-path") {
      options.summaryPath = argv[idx + 1] ?? null;
      idx += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.help) {
    return options;
  }

  for (const [key, value] of Object.entries(options)) {
    if (key === "help" || key === "summaryPath") {
      continue;
    }
    if (value === null) {
      throw new Error(`Missing required argument: --${toKebabCase(key)}`);
    }
  }

  return options;
}

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function getHelpText() {
  return [
    "Usage: node perf/scripts/runSectionBenchmarkViaCdp.js \\",
    "  --browser-url http://127.0.0.1:<cdp-port> \\",
    "  --page-url http://127.0.0.1:<frontend-port>/<route> \\",
    "  --scene-id <scene-id> \\",
    "  --trace-path <trace.json> \\",
    "  --benchmark-result-path <result.json> \\",
    "  [--summary-path <summary.json>]",
  ].join("\n");
}

function buildBenchmarkConfig(sceneId) {
  const scene = getSectionBenchmarkScene(sceneId);
  return {
    scene,
    benchmarkConfig: {
      sceneId: scene.id,
      ...(scene.benchmarkConfig ?? {}),
    },
  };
}

async function startTracing(client) {
  const traceEvents = [];
  const tracingComplete = new Promise((resolve) => {
    client.on("Tracing.dataCollected", (event) => {
      if (Array.isArray(event.value)) {
        traceEvents.push(...event.value);
      }
    });
    client.once("Tracing.tracingComplete", resolve);
  });

  await client.send("Tracing.start", {
    categories: TRACE_CATEGORIES,
    transferMode: "ReportEvents",
  });

  return {
    traceEvents,
    tracingComplete,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${getHelpText()}\n`);
    return;
  }
  const { scene, benchmarkConfig } = buildBenchmarkConfig(options.sceneId);

  const browser = await chromium.connectOverCDP(options.browserUrl);
  const targetOrigin = new URL(options.pageUrl).origin;
  const existingPage =
    browser
      .contexts()
      .flatMap((context) => context.pages().map((page) => ({ context, page })))
      .find(({ page }) => page.url().startsWith(targetOrigin)) ?? null;
  const context =
    existingPage?.context ?? browser.contexts()[0] ?? (await browser.newContext());
  const page = existingPage?.page ?? (await context.newPage());
  const shouldClosePage = existingPage === null;
  const targetUrl = new URL(options.pageUrl);
  const targetRoute = {
    pathname: targetUrl.pathname,
    search: targetUrl.search,
    hash: targetUrl.hash,
  };

  try {
    if (existingPage === null) {
      await page.goto(options.pageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
    } else {
      await page.waitForSelector(".react-flow__viewport", { timeout: 30_000 });
      await page.evaluate(({ pathname, search, hash }) => {
        window.history.pushState({}, "", `${pathname}${search}${hash}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, targetRoute);
      await page.waitForFunction(
        (pathname) => window.location.pathname === pathname,
        targetUrl.pathname,
        { timeout: 10_000 },
      );
    }
    await page.waitForSelector(".react-flow__viewport", { timeout: 30_000 });
    await page.waitForSelector(".react-flow__node", { timeout: 30_000 });

    const client = await context.newCDPSession(page);
    const { traceEvents, tracingComplete } = await startTracing(client);
    const benchmarkResult = await page.evaluate(
      ({ replaySource, replayConfig }) => {
        const replay = new Function(`return (${replaySource});`)();
        return replay(replayConfig);
      },
      {
        replaySource: SECTION_PAN_ZOOM_BENCHMARK_REPLAY,
        replayConfig: benchmarkConfig,
      },
    );
    await client.send("Tracing.end");
    await tracingComplete;

    const tracePath = path.resolve(options.tracePath);
    fs.mkdirSync(path.dirname(tracePath), { recursive: true });
    fs.writeFileSync(
      tracePath,
      JSON.stringify({ traceEvents }, null, 2),
      "utf8",
    );

    const benchmarkResultPath = path.resolve(options.benchmarkResultPath);
    fs.mkdirSync(path.dirname(benchmarkResultPath), { recursive: true });
    fs.writeFileSync(
      benchmarkResultPath,
      JSON.stringify(
        {
          browserUrl: options.browserUrl,
          pageUrl: options.pageUrl,
          sceneId: scene.id,
          benchmarkConfig,
          benchmarkResult,
        },
        null,
        2,
      ),
      "utf8",
    );

    let summaryPath = null;
    if (options.summaryPath !== null) {
      summaryPath = path.resolve(options.summaryPath);
      fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
      fs.writeFileSync(
        summaryPath,
        JSON.stringify(
          summarizeTrace(tracePath, {
            markPrefix: benchmarkConfig.markPrefix ?? null,
          }),
          null,
          2,
        ),
        "utf8",
      );
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          browserUrl: options.browserUrl,
          pageUrl: options.pageUrl,
          sceneId: scene.id,
          tracePath,
          benchmarkResultPath,
          summaryPath,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    if (shouldClosePage) {
      await page.close();
    }
  }
}

module.exports = {
  buildBenchmarkConfig,
  getHelpText,
  parseArgs,
  main,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack);
    process.exit(1);
  });
}
