/**
 * Program creation, uniform lookup, and shader prewarming.
 *
 * The frame budget forbids "shader compilation, large allocation, or texture
 * upload on an interaction-critical path", so every program is compiled and
 * every pipeline is exercised once before the first real frame. A driver that
 * defers pipeline setup until the first draw would otherwise spend that cost on
 * whichever frame first showed a node — which is exactly the frame the user is
 * watching.
 *
 * Compile and link failures throw with the driver's own log. There is no
 * silent fallback path: a graph that cannot draw is a defect, not a degraded
 * mode to hide.
 */

export type GraphUniformMap<Name extends string> = Readonly<
  Record<Name, WebGLUniformLocation | null>
>;

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) {
    throw new Error(`director graph could not create the ${label} shader`);
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    gl.deleteShader(shader);
    throw new Error(`director graph ${label} shader failed to compile: ${log}`);
  }
  return shader;
}

export function createGraphProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  label: string,
): WebGLProgram {
  const program = gl.createProgram();
  if (program === null) {
    throw new Error(`director graph could not create the ${label} program`);
  }
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource, `${label} vertex`);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label} fragment`);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    const log = gl.getProgramInfoLog(program) ?? "";
    gl.deleteProgram(program);
    throw new Error(`director graph ${label} program failed to link: ${log}`);
  }
  return program;
}

export function graphUniforms<Name extends string>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly Name[],
): GraphUniformMap<Name> {
  const map = {} as Record<Name, WebGLUniformLocation | null>;
  for (const name of names) {
    map[name] = gl.getUniformLocation(program, name);
  }
  return map;
}

/** Deterministic noise for the background medium's fixed particle positions. */
export function graphSeededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
