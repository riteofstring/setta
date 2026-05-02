import { flowToScreenPosition } from "../viewportMath";
import type { HtmlSurfaceEffectHitProjector } from "./hitScene";
import type { HtmlSurfaceEffectVisual } from "./visualScene";

export const HTML_SURFACE_RIPPLE_EFFECT_ID = "setta-ripple";
export const HTML_SURFACE_RIPPLE_PROJECTOR_ID = "setta-ripple-projector";

type HtmlSurfaceShaderEffectSpec = {
  readonly effectId: string;
  readonly fragmentShader: string;
  readonly projectorId: string;
};

const RIPPLE_FRAGMENT_SHADER = `
fn project_effect_uv(uv: vec2<f32>) -> vec2<f32> {
  let wave = vec2<f32>(
    sin(uv.y * 6.28318530718) * 0.025,
    sin(uv.x * 6.28318530718) * 0.025
  );
  return clamp(uv + wave, vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  return textureSample(nodeTexture, nodeSampler, project_effect_uv(input.uv));
}
`;

const SHADER_EFFECT_SPECS: readonly HtmlSurfaceShaderEffectSpec[] = [
  {
    effectId: HTML_SURFACE_RIPPLE_EFFECT_ID,
    fragmentShader: RIPPLE_FRAGMENT_SHADER,
    projectorId: HTML_SURFACE_RIPPLE_PROJECTOR_ID,
  },
];

export function getHtmlSurfaceShaderEffectSpec(
  effectId: string,
): HtmlSurfaceShaderEffectSpec {
  const spec = SHADER_EFFECT_SPECS.find(
    (candidate) => candidate.effectId === effectId,
  );
  if (!spec) {
    throw new Error(
      `Setta HTML surface renderer received unsupported shader effect "${effectId}".`,
    );
  }
  return spec;
}

export function assertHtmlSurfaceShaderEffectSupported(
  surface: Pick<HtmlSurfaceEffectVisual, "effectId" | "projectorId">,
) {
  const spec = getHtmlSurfaceShaderEffectSpec(surface.effectId);
  if (surface.projectorId !== spec.projectorId) {
    throw new Error(
      `Setta HTML surface shader effect "${surface.effectId}" requires projector "${spec.projectorId}", received "${surface.projectorId}".`,
    );
  }
}

export function createHtmlSurfaceShaderEffectProjectors(): ReadonlyMap<
  string,
  HtmlSurfaceEffectHitProjector
> {
  return new Map([
    [
      HTML_SURFACE_RIPPLE_PROJECTOR_ID,
      ({ surface, surfaceX, surfaceY, viewport }) => {
        const screenPosition = flowToScreenPosition(
          { x: surface.bounds.x, y: surface.bounds.y },
          viewport,
        );
        const u =
          (surfaceX - screenPosition.x) /
          (surface.bounds.width * viewport.zoom);
        const v =
          (surfaceY - screenPosition.y) /
          (surface.bounds.height * viewport.zoom);
        if (u < 0 || u >= 1 || v < 0 || v >= 1) {
          return null;
        }
        const projected = projectHtmlSurfaceShaderEffectUv({
          effectId: surface.effectId,
          u,
          v,
        });
        return {
          localX: projected.u * surface.sourceWidth,
          localY: projected.v * surface.sourceHeight,
          u: projected.u,
          v: projected.v,
        };
      },
    ],
  ]);
}

export function createHtmlSurfaceShaderEffectShader(effectId: string): string {
  const spec = getHtmlSurfaceShaderEffectSpec(effectId);
  return `${SHADER_EFFECT_VERTEX_SHADER}${spec.fragmentShader}`;
}

export function projectHtmlSurfaceShaderEffectUv({
  effectId,
  u,
  v,
}: {
  readonly effectId: string;
  readonly u: number;
  readonly v: number;
}): { readonly u: number; readonly v: number } {
  getHtmlSurfaceShaderEffectSpec(effectId);
  return {
    u: clampUnit(u + Math.sin(v * Math.PI * 2) * 0.025),
    v: clampUnit(v + Math.sin(u * Math.PI * 2) * 0.025),
  };
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const SHADER_EFFECT_VERTEX_SHADER = `
struct Camera {
  viewport: vec4<f32>,
  canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(1) @binding(0) var nodeSampler: sampler;
@group(1) @binding(1) var nodeTexture: texture_2d<f32>;

struct VertexInput {
  @location(0) flowPosition: vec2<f32>,
  @location(1) uv: vec2<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  let screen = camera.viewport.xy + input.flowPosition * camera.viewport.z;
  let clip = vec2<f32>(
    (screen.x / camera.canvas.x) * 2.0 - 1.0,
    1.0 - (screen.y / camera.canvas.y) * 2.0
  );
  var output: VertexOutput;
  output.position = vec4<f32>(clip, 0.0, 1.0);
  output.uv = input.uv;
  return output;
}
`;
