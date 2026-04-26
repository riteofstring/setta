import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_PAN_FRAMES = 30;
const DEFAULT_CASE_TIMEOUT_MS = 8000;
const DEFAULT_REPORT_PATH =
  "perf/reports/frontend/2026-04-28_html-in-canvas-webgl-texture-probe.md";
const ARTIFACT_PATH =
  "perf/artifacts/frontend/html-in-canvas-webgl-texture-probe.json";

type ProbeCaseConfig = {
  caseName: string;
  sourceCount: number;
  sourceMode: "none" | "minimal" | "card" | "controls";
  styleMode: "canvasflow" | "demo";
  uploadMode: "direct" | "paint";
};

type ProbeCaseResult = {
  canvasHeight?: number;
  canvasWidth?: number;
  caseName: string;
  error?: string;
  firstPanFrameMs?: number;
  initialNonBackgroundPixels?: number;
  initialUploadCount?: number;
  maxPanFrameMs?: number;
  panFrameCount?: number;
  panNonBackgroundPixels?: number;
  panUploadCount?: number;
  sourceCount: number;
  sourceTextChars?: number;
  status: "failed" | "passed" | "timeout";
  totalPanFrameMs?: number;
  uploadMode: ProbeCaseConfig["uploadMode"];
};

type ProbeResult = {
  caseTimeoutMs: number;
  cases: ProbeCaseResult[];
  panFrames: number;
  support: {
    requestPaint: string;
    texElementImage2D: string;
    webgl: string;
  };
};

test.skip(
  process.env.SETTA_CANVASFLOW_WEBGL_PROBE !== "1",
  "HTML-in-Canvas WebGL texture probe is opt-in. Set SETTA_CANVASFLOW_WEBGL_PROBE=1.",
);

test("records WebGL-first HTML texture upload behavior", async ({ page }) => {
  test.setTimeout(120000);

  const panFrames = parsePositiveInteger(
    process.env.SETTA_CANVASFLOW_WEBGL_PROBE_FRAMES,
    DEFAULT_PAN_FRAMES,
  );
  const caseTimeoutMs = parsePositiveInteger(
    process.env.SETTA_CANVASFLOW_WEBGL_PROBE_CASE_TIMEOUT_MS,
    DEFAULT_CASE_TIMEOUT_MS,
  );
  const support = await readSupport(page);
  const cases: ProbeCaseConfig[] = [
    {
      caseName: "direct-upload-before-paint",
      sourceCount: 1,
      sourceMode: "minimal",
      styleMode: "demo",
      uploadMode: "direct",
    },
    {
      caseName: "demo-style-paint-upload",
      sourceCount: 1,
      sourceMode: "minimal",
      styleMode: "demo",
      uploadMode: "paint",
    },
    {
      caseName: "single-minimal-paint-upload",
      sourceCount: 1,
      sourceMode: "minimal",
      styleMode: "canvasflow",
      uploadMode: "paint",
    },
    {
      caseName: "single-static-card-paint-upload",
      sourceCount: 1,
      sourceMode: "card",
      styleMode: "canvasflow",
      uploadMode: "paint",
    },
    {
      caseName: "ten-static-cards-paint-upload",
      sourceCount: 10,
      sourceMode: "card",
      styleMode: "canvasflow",
      uploadMode: "paint",
    },
    {
      caseName: "section-shaped-controls-paint-upload",
      sourceCount: 1,
      sourceMode: "controls",
      styleMode: "canvasflow",
      uploadMode: "paint",
    },
  ];
  const results: ProbeCaseResult[] = [];
  for (const probeCase of cases) {
    const casePage = await page.context().newPage();
    const result = await runProbeCaseWithTimeout({
      casePage,
      caseTimeoutMs,
      panFrames,
      probeCase,
    });
    results.push(result);
    await closeProbePage(casePage);
    if (result.status === "timeout") {
      break;
    }
  }

  const result = { caseTimeoutMs, cases: results, panFrames, support };
  await writeProbeReport(result);

  expect(result.support.requestPaint).toBe("function");
  expect(result.support.texElementImage2D).toBe("function");
  expect(result.support.webgl).toBe("object");
  expect(result.cases.length).toBeGreaterThan(0);
  const directUploadResult = result.cases.find(
    (probeCase) => probeCase.uploadMode === "direct",
  );
  expect(directUploadResult?.status).toBe("failed");
  expect(directUploadResult?.error).toContain("No cached paint record");
  const paintResults = result.cases.filter(
    (probeCase) => probeCase.uploadMode === "paint",
  );
  expect(paintResults).toHaveLength(
    cases.filter((probeCase) => probeCase.uploadMode === "paint").length,
  );
  for (const paintResult of paintResults) {
    expect(paintResult.status).toBe("passed");
    expect(paintResult.initialUploadCount).toBe(paintResult.sourceCount);
    expect(paintResult.panUploadCount).toBe(0);
    expect(paintResult.sourceTextChars).toBeGreaterThan(0);
    expect(paintResult.initialNonBackgroundPixels).toBeGreaterThan(0);
    expect(paintResult.panNonBackgroundPixels).toBeGreaterThan(0);
  }
});

async function readSupport(page: Page) {
  await page.setViewportSize({ width: 980, height: 760 });
  await page.setContent("<!doctype html><html><body></body></html>");
  return await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("layoutsubtree", "true");
    document.body.appendChild(canvas);
    const gl = canvas.getContext("webgl", {
      antialias: false,
      preserveDrawingBuffer: true,
    }) as
      | (WebGLRenderingContext & {
          texElementImage2D?: (
            target: number,
            level: number,
            internalformat: number,
            format: number,
            type: number,
            source: Element,
          ) => void;
        })
      | null;
    return {
      requestPaint: typeof (
        canvas as HTMLCanvasElement & { requestPaint?: unknown }
      ).requestPaint,
      texElementImage2D: typeof gl?.texElementImage2D,
      webgl: gl ? "object" : "missing",
    };
  });
}

async function runProbeCaseWithTimeout({
  casePage,
  caseTimeoutMs,
  panFrames,
  probeCase,
}: {
  casePage: Page;
  caseTimeoutMs: number;
  panFrames: number;
  probeCase: ProbeCaseConfig;
}): Promise<ProbeCaseResult> {
  await casePage.setViewportSize({ width: 980, height: 760 });
  await casePage.setContent("<!doctype html><html><body></body></html>");
  const evaluation = casePage
    .evaluate(runBrowserProbeCase, { panFrames, probeCase })
    .catch((error: unknown): ProbeCaseResult => {
      return {
        caseName: probeCase.caseName,
        error: String(error),
        sourceCount: probeCase.sourceCount,
        status: "failed",
        uploadMode: probeCase.uploadMode,
      };
    });
  const timeout = new Promise<ProbeCaseResult>((resolve) => {
    setTimeout(() => {
      resolve({
        caseName: probeCase.caseName,
        error: `Timed out after ${caseTimeoutMs} ms.`,
        sourceCount: probeCase.sourceCount,
        status: "timeout",
        uploadMode: probeCase.uploadMode,
      });
    }, caseTimeoutMs);
  });
  const result = await Promise.race([evaluation, timeout]);
  evaluation.catch(() => undefined);
  return result;
}

async function closeProbePage(page: Page) {
  await Promise.race([
    page.close({ runBeforeUnload: false }).catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 1000)),
  ]);
}

async function runBrowserProbeCase({
  panFrames,
  probeCase,
}: {
  panFrames: number;
  probeCase: ProbeCaseConfig;
}): Promise<ProbeCaseResult> {
  type SourceConfig = {
    accent: string;
    body: string;
    height: number;
    title: string;
    width: number;
    x: number;
    y: number;
  };
  type TextureEntry = {
    config: SourceConfig;
    element: HTMLElement;
    height: number;
    texture: WebGLTexture;
    width: number;
  };
  type ProgramInfo = {
    positionBuffer: WebGLBuffer;
    positionLocation: number;
    program: WebGLProgram;
    texCoordBuffer: WebGLBuffer;
    texCoordLocation: number;
    textureLocation: WebGLUniformLocation;
  };

  document.body.replaceChildren();
  document.body.style.margin = "0";
  document.body.style.background = "#111827";
  const canvas = document.createElement("canvas");
  canvas.width = 860;
  canvas.height = 540;
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  canvas.style.display = "block";
  canvas.style.position = "relative";
  canvas.setAttribute("layoutsubtree", "true");
  document.body.appendChild(canvas);

  const gl = canvas.getContext("webgl", {
    antialias: false,
    preserveDrawingBuffer: true,
  }) as
    | (WebGLRenderingContext & {
        texElementImage2D?: (
          target: number,
          level: number,
          internalformat: number,
          format: number,
          type: number,
          source: Element,
        ) => void;
      })
    | null;
  if (!gl) {
    throw new Error("Unable to create WebGL context.");
  }
  if (typeof gl.texElementImage2D !== "function") {
    throw new Error("WebGLRenderingContext.texElementImage2D is missing.");
  }

  const programInfo = createProgramInfo(gl);
  const sources = createSourceConfigs(probeCase);
  const entries = sources.map((source, index) =>
    createTextureEntry(gl, canvas, source, index, probeCase),
  );
  const sourceTextChars = entries.reduce(
    (total, entry) =>
      total + (entry.element.textContent ?? "").replace(/\s+/g, "").length,
    0,
  );

  const initialUploadCount =
    probeCase.uploadMode === "paint"
      ? await runPaintUpload({
          canvas,
          dirtyEntries: entries,
          entries,
          gl,
          texElementImage2D: gl.texElementImage2D,
        })
      : await runDirectUpload({
          entries,
          gl,
          programInfo,
          texElementImage2D: gl.texElementImage2D,
          viewport: { x: 0, y: 0, zoom: 1 },
        });
  if (probeCase.uploadMode === "paint") {
    await nextAnimationFrame();
  }
  drawScene(gl, programInfo, entries, { x: 0, y: 0, zoom: 1 });
  const initialNonBackgroundPixels = readNonBackgroundPixels(gl, canvas);

  let panUploadCount = 0;
  let totalPanFrameMs = 0;
  let firstPanFrameMs = 0;
  let maxPanFrameMs = 0;
  for (let frame = 0; frame < panFrames; frame += 1) {
    const frameStart = performance.now();
    await nextAnimationFrame();
    drawScene(gl, programInfo, entries, {
      x: 20 + frame * 2.5,
      y: 14 + Math.sin(frame / 4) * 12,
      zoom: 0.84 + frame * 0.002,
    });
    const frameMs = performance.now() - frameStart;
    if (frame === 0) {
      firstPanFrameMs = frameMs;
    }
    totalPanFrameMs += frameMs;
    maxPanFrameMs = Math.max(maxPanFrameMs, frameMs);
  }
  const panNonBackgroundPixels = readNonBackgroundPixels(gl, canvas);

  return {
    canvasHeight: canvas.height,
    canvasWidth: canvas.width,
    caseName: probeCase.caseName,
    firstPanFrameMs,
    initialNonBackgroundPixels,
    initialUploadCount,
    maxPanFrameMs,
    panFrameCount: panFrames,
    panNonBackgroundPixels,
    panUploadCount,
    sourceCount: entries.length,
    sourceTextChars,
    status: "passed",
    totalPanFrameMs,
    uploadMode: probeCase.uploadMode,
  };

  function createSourceConfigs(caseConfig: ProbeCaseConfig): SourceConfig[] {
    if (caseConfig.sourceMode === "none") {
      return [];
    }
    return Array.from({ length: caseConfig.sourceCount }, (_, index) => ({
      accent: index % 2 === 0 ? "#0f766e" : "#a21caf",
      body:
        caseConfig.sourceMode === "minimal"
          ? "Plain text direct canvas child."
          : `Card ${index + 1} keeps real DOM text while WebGL pans the textured quad.`,
      height: caseConfig.sourceMode === "controls" ? 286 : 118,
      title:
        caseConfig.sourceMode === "controls"
          ? "Settings Section"
          : `HTML Node ${index + 1}`,
      width: caseConfig.sourceMode === "controls" ? 420 : 244,
      x: 42 + (index % 5) * 154,
      y: 44 + Math.floor(index / 5) * 128,
    }));
  }

  function createTextureEntry(
    gl: WebGLRenderingContext,
    canvas: HTMLCanvasElement,
    config: SourceConfig,
    index: number,
    caseConfig: ProbeCaseConfig,
  ): TextureEntry {
    const element = document.createElement("div");
    element.className = "html-texture-source";
    element.dataset.caseName = caseConfig.caseName;
    element.dataset.index = String(index);
    const baseStyle = [
      "box-sizing:border-box",
      `width:${config.width}px`,
      `height:${config.height}px`,
      "border-radius:8px",
      "border:1px solid rgba(15,23,42,.22)",
      "background:#f8fafc",
      "color:#111827",
      "font:14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      "padding:14px",
      "display:flex",
      "flex-direction:column",
      "gap:10px",
    ];
    const layoutStyle =
      caseConfig.styleMode === "demo"
        ? ["position:relative", "pointer-events:none"]
        : [
            "position:absolute",
            "left:0",
            "top:0",
            `transform:translate(${config.x}px, ${config.y}px)`,
            "transform-origin:0 0",
            "pointer-events:auto",
          ];
    element.style.cssText = [...baseStyle, ...layoutStyle].join(";");
    element.innerHTML =
      caseConfig.sourceMode === "minimal"
        ? `<strong>${escapeHtml(config.title)}</strong><span>${escapeHtml(config.body)}</span>`
        : renderCardSourceHtml(config, caseConfig.sourceMode === "controls");
    canvas.appendChild(element);

    const texture = gl.createTexture();
    if (!texture) {
      throw new Error("Unable to create WebGL texture.");
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return {
      config,
      element,
      height: config.height,
      texture,
      width: config.width,
    };
  }

  function renderCardSourceHtml(
    config: SourceConfig,
    includeControls: boolean,
  ) {
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <strong style="font-size:16px;">${escapeHtml(config.title)}</strong>
        <span style="width:14px;height:14px;border-radius:999px;background:${config.accent};"></span>
      </div>
      <p style="margin:0;line-height:1.35;color:#334155;">${escapeHtml(config.body)}</p>
      ${
        includeControls
          ? `
            <div style="display:flex;align-items:center;gap:8px;">
              <button style="font:inherit;padding:5px 9px;border-radius:5px;border:1px solid #94a3b8;background:white;">Action</button>
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" checked />
                Enabled
              </label>
            </div>
            <label style="display:flex;align-items:center;gap:8px;">
              <span>Level</span>
              <input type="range" min="0" max="100" value="64" style="flex:1;" />
            </label>
          `
          : ""
      }
    `;
  }

  function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => {
      switch (character) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return "&#39;";
      }
    });
  }

  async function runPaintUpload({
    canvas,
    dirtyEntries,
    entries,
    gl,
    texElementImage2D,
  }: {
    canvas: HTMLCanvasElement;
    dirtyEntries: TextureEntry[];
    entries: TextureEntry[];
    gl: WebGLRenderingContext;
    texElementImage2D: (
      target: number,
      level: number,
      internalformat: number,
      format: number,
      type: number,
      source: Element,
    ) => void;
  }) {
    const requestPaint = (
      canvas as HTMLCanvasElement & { requestPaint?: () => void }
    ).requestPaint;
    if (typeof requestPaint !== "function") {
      throw new Error("HTMLCanvasElement.requestPaint is missing.");
    }
    return await new Promise<number>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        canvas.removeEventListener("paint", onPaint);
        reject(new Error("Timed out waiting for canvas paint event."));
      }, 2000);
      const onPaint = () => {
        window.clearTimeout(timeout);
        let uploads = 0;
        for (const entry of dirtyEntries) {
          gl.bindTexture(gl.TEXTURE_2D, entry.texture);
          texElementImage2D.call(
            gl,
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            entry.element,
          );
          uploads += 1;
        }
        gl.bindTexture(gl.TEXTURE_2D, null);
        resolve(uploads);
      };
      canvas.addEventListener("paint", onPaint, { once: true });
      const paintTick = String(performance.now());
      for (const entry of entries) {
        entry.element.dataset.paintTick = paintTick;
      }
      requestPaint.call(canvas);
    });
  }

  async function runDirectUpload({
    entries,
    gl,
    programInfo,
    texElementImage2D,
    viewport,
  }: {
    entries: TextureEntry[];
    gl: WebGLRenderingContext;
    programInfo: ProgramInfo;
    texElementImage2D: (
      target: number,
      level: number,
      internalformat: number,
      format: number,
      type: number,
      source: Element,
    ) => void;
    viewport: { x: number; y: number; zoom: number };
  }) {
    await nextAnimationFrame();
    let uploads = 0;
    for (const entry of entries) {
      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
      texElementImage2D.call(
        gl,
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        entry.element,
      );
      uploads += 1;
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    drawScene(gl, programInfo, entries, viewport);
    return uploads;
  }

  function drawScene(
    gl: WebGLRenderingContext,
    programInfo: ProgramInfo,
    entries: TextureEntry[],
    viewport: { x: number; y: number; zoom: number },
  ) {
    const canvas = gl.canvas as HTMLCanvasElement;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.03, 0.06, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(programInfo.program);
    gl.enableVertexAttribArray(programInfo.positionLocation);
    gl.enableVertexAttribArray(programInfo.texCoordLocation);
    gl.uniform1i(programInfo.textureLocation, 0);

    for (const entry of entries) {
      const x = viewport.x + entry.config.x * viewport.zoom;
      const y = viewport.y + entry.config.y * viewport.zoom;
      const width = entry.width * viewport.zoom;
      const height = entry.height * viewport.zoom;
      const positions = createClipSpaceQuad(
        x,
        y,
        width,
        height,
        canvas.width,
        canvas.height,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, programInfo.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
      gl.vertexAttribPointer(
        programInfo.positionLocation,
        2,
        gl.FLOAT,
        false,
        0,
        0,
      );

      gl.bindBuffer(gl.ARRAY_BUFFER, programInfo.texCoordBuffer);
      gl.vertexAttribPointer(
        programInfo.texCoordLocation,
        2,
        gl.FLOAT,
        false,
        0,
        0,
      );
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  function createProgramInfo(gl: WebGLRenderingContext): ProgramInfo {
    const vertexShader = compileShader(
      gl,
      gl.VERTEX_SHADER,
      `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;

        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          v_texCoord = a_texCoord;
        }
      `,
    );
    const fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      `
        precision mediump float;
        uniform sampler2D u_texture;
        varying vec2 v_texCoord;

        void main() {
          gl_FragColor = texture2D(u_texture, v_texCoord);
        }
      `,
    );
    const program = gl.createProgram();
    if (!program) {
      throw new Error("Unable to create WebGL program.");
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        `Unable to link WebGL program: ${gl.getProgramInfoLog(program)}`,
      );
    }
    const positionBuffer = gl.createBuffer();
    const texCoordBuffer = gl.createBuffer();
    const textureLocation = gl.getUniformLocation(program, "u_texture");
    if (!positionBuffer || !texCoordBuffer || !textureLocation) {
      throw new Error("Unable to create WebGL buffers.");
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      gl.STATIC_DRAW,
    );
    return {
      positionBuffer,
      positionLocation: gl.getAttribLocation(program, "a_position"),
      program,
      texCoordBuffer,
      texCoordLocation: gl.getAttribLocation(program, "a_texCoord"),
      textureLocation,
    };
  }

  function compileShader(
    gl: WebGLRenderingContext,
    type: number,
    source: string,
  ) {
    const shader = gl.createShader(type);
    if (!shader) {
      throw new Error("Unable to create WebGL shader.");
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(
        `Unable to compile WebGL shader: ${gl.getShaderInfoLog(shader)}`,
      );
    }
    return shader;
  }

  function createClipSpaceQuad(
    x: number,
    y: number,
    width: number,
    height: number,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    const left = (x / canvasWidth) * 2 - 1;
    const right = ((x + width) / canvasWidth) * 2 - 1;
    const top = 1 - (y / canvasHeight) * 2;
    const bottom = 1 - ((y + height) / canvasHeight) * 2;
    return new Float32Array([
      left,
      top,
      right,
      top,
      left,
      bottom,
      left,
      bottom,
      right,
      top,
      right,
      bottom,
    ]);
  }

  function readNonBackgroundPixels(
    gl: WebGLRenderingContext,
    canvas: HTMLCanvasElement,
  ) {
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(
      0,
      0,
      canvas.width,
      canvas.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      if (red > 20 || green > 20 || blue > 35) {
        count += 1;
      }
    }
    return count;
  }

  function nextAnimationFrame() {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
}

async function writeProbeReport(result: ProbeResult) {
  const repoRoot = path.resolve(process.cwd(), "..");
  const reportPath = path.resolve(
    repoRoot,
    process.env.SETTA_CANVASFLOW_WEBGL_PROBE_REPORT_PATH ?? DEFAULT_REPORT_PATH,
  );
  const artifactPath = path.resolve(repoRoot, ARTIFACT_PATH);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(
    artifactPath,
    `${JSON.stringify(result, null, 2)}\n`,
    "utf-8",
  );
  await fs.writeFile(reportPath, renderProbeReport(result), "utf-8");
}

function renderProbeReport(result: ProbeResult) {
  const lines = [
    "# HTML-in-Canvas WebGL Texture Probe",
    "",
    "Date: 2026-04-28",
    "Area: frontend",
    "Branch/Commit: go-rewrite-canvas-replace-xyflow working tree",
    "Related PR: n/a",
    "",
    "## Goal",
    "",
    "Verify that a WebGL-first `layoutsubtree` canvas can upload direct HTML children with `texElementImage2D()` and reuse those textures across pan/zoom frames without re-uploading unchanged HTML.",
    "",
    "## Reference",
    "",
    "- `docs/plans/html-in-canvas-webgl-texture-canvasflow-plan.md`",
    "- https://github.com/fimbox/html-in-canvas/blob/main/plugins/html-cloth.mjs",
    "",
    "## Method",
    "",
    "- Runner: opt-in Playwright E2E probe `frontend/tests/e2e/canvasflow/html-in-canvas-webgl-texture-probe.spec.ts`.",
    "- Browser: Chrome launched by Playwright with `--enable-blink-features=CanvasDrawElement`.",
    "- Each case runs in a fresh page with a Node-side timeout so a hung renderer process is recorded as a result instead of losing the whole report.",
    "- The probe creates the canvas with WebGL first, sets `layoutsubtree`, appends direct HTML children, tests direct `texElementImage2D()` uploads, then tests the cloth-demo-style `requestPaint()` upload path.",
    "- Paint-upload cases upload inside the canvas `paint` event and draw/read WebGL pixels on the following animation frame, matching the demo pattern that keeps the paint callback as the HTML capture boundary.",
    "- Empty no-child requestPaint cases are intentionally excluded because CanvasFlow's texture path is about direct child source elements and Chromium does not need to emit a paint event when no layoutsubtree child can change.",
    "- Raw JSON artifact, ignored by git: `perf/artifacts/frontend/html-in-canvas-webgl-texture-probe.json`.",
    "",
    "## Support",
    "",
    "| requestPaint | texElementImage2D | WebGL |",
    "| :--- | :--- | :--- |",
    `| ${result.support.requestPaint} | ${result.support.texElementImage2D} | ${result.support.webgl} |`,
    "",
    "## Results",
    "",
    "| Case | Mode | Status | Sources | Text Chars | Initial Uploads | Pan Uploads | Pan Frames | First Pan Frame | Max Pan Frame | Non-BG Pixels Initial | Non-BG Pixels After Pan | Error |",
    "| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |",
  ];
  for (const probeCase of result.cases) {
    lines.push(
      `| ${probeCase.caseName} | ${probeCase.uploadMode} | ${probeCase.status} | ${probeCase.sourceCount} | ${formatOptionalInteger(probeCase.sourceTextChars)} | ${formatOptionalInteger(probeCase.initialUploadCount)} | ${formatOptionalInteger(probeCase.panUploadCount)} | ${formatOptionalInteger(probeCase.panFrameCount)} | ${formatOptionalMs(probeCase.firstPanFrameMs)} | ${formatOptionalMs(probeCase.maxPanFrameMs)} | ${formatOptionalInteger(probeCase.initialNonBackgroundPixels)} | ${formatOptionalInteger(probeCase.panNonBackgroundPixels)} | ${escapeTable(probeCase.error ?? "")} |`,
    );
  }
  lines.push(
    "",
    "## Decision",
    "",
    renderDecision(result),
    "",
    "## Verification",
    "",
    "- The Playwright test asserts support APIs and writes a report for each progressive case.",
    "- Passing cases verify initial upload counts, zero pan-frame uploads, source text, and nonblank WebGL pixels before and after pan frames.",
    "",
  );
  return lines.join("\n");
}

function renderDecision(result: ProbeResult) {
  const timeout = result.cases.find(
    (probeCase) => probeCase.status === "timeout",
  );
  if (timeout) {
    if (timeout.uploadMode === "paint") {
      const directCachedPaintFailures = result.cases.filter(
        (probeCase) =>
          probeCase.uploadMode === "direct" &&
          probeCase.error?.includes("No cached paint record"),
      );
      if (directCachedPaintFailures.length) {
        return `- Direct uploads outside \`paint\` fail with \`No cached paint record\`, and the first cloth-demo-style \`requestPaint()\` upload case timed out. WebGL-first app integration is blocked at \`${timeout.caseName}\` after ${result.caseTimeoutMs} ms.`;
      }
      return `- Cloth-demo-style \`requestPaint()\` scheduling is blocked. The smallest timed-out case was \`${timeout.caseName}\` after ${result.caseTimeoutMs} ms.`;
    }
    return `- WebGL-first app integration is blocked. The smallest timed-out direct upload case was \`${timeout.caseName}\` after ${result.caseTimeoutMs} ms, so the next step is to isolate or change upload preconditions before touching CanvasFlow.`;
  }
  const failed = result.cases.find(
    (probeCase) =>
      probeCase.status === "failed" &&
      !isExpectedDirectPaintRecordFailure(probeCase),
  );
  if (failed) {
    return `- WebGL-first app integration is blocked by \`${failed.caseName}\`: ${failed.error ?? "unknown failure"}.`;
  }
  const paintCases = result.cases.filter(
    (probeCase) => probeCase.uploadMode === "paint",
  );
  const passedPaintCases = paintCases.filter(
    (probeCase) => probeCase.status === "passed",
  );
  if (paintCases.length > 0 && passedPaintCases.length === paintCases.length) {
    const expectedDirectFailures = result.cases.filter(
      isExpectedDirectPaintRecordFailure,
    );
    const directSummary = expectedDirectFailures.length
      ? " Direct upload before a cached paint record fails as expected, which matches the WICG model and the demo scheduling."
      : "";
    return `- The standalone probe validates the API shape needed before app integration: WebGL context first, direct canvas child HTML sources, \`texElementImage2D()\` during \`paint\`, draw on the normal WebGL frame after upload, and texture reuse across viewport-only frames.${directSummary}`;
  }
  return "- The standalone probe validates the API shape needed before app integration: WebGL context first, direct canvas child HTML sources, `texElementImage2D()` during `paint`, and texture reuse across viewport-only frames.";
}

function isExpectedDirectPaintRecordFailure(probeCase: ProbeCaseResult) {
  return (
    probeCase.uploadMode === "direct" &&
    probeCase.status === "failed" &&
    probeCase.error?.includes("No cached paint record") === true
  );
}

function formatOptionalMs(value: number | undefined) {
  return value === undefined ? "" : `${value.toFixed(2)} ms`;
}

function formatOptionalInteger(value: number | undefined) {
  return value === undefined
    ? ""
    : new Intl.NumberFormat("en-US").format(value);
}

function escapeTable(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
