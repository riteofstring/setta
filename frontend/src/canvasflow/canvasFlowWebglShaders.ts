import type { CanvasFlowWebglRenderingContext } from "./canvasFlowTypes";

export const CANVAS_FLOW_COLOR_VERTEX_SHADER = `
attribute vec2 a_position;

uniform vec2 u_resolution;

void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
}
`;

export const CANVAS_FLOW_COLOR_FRAGMENT_SHADER = `
precision mediump float;

uniform vec4 u_color;

void main() {
  gl_FragColor = u_color;
}
`;

export type CanvasFlowColorProgram = {
  colorLocation: WebGLUniformLocation;
  positionBuffer: WebGLBuffer;
  positionLocation: number;
  program: WebGLProgram;
  resolutionLocation: WebGLUniformLocation;
};

export function createCanvasFlowColorProgram(
  gl: CanvasFlowWebglRenderingContext,
): CanvasFlowColorProgram {
  const vertexShader = createShader(
    gl,
    gl.VERTEX_SHADER,
    CANVAS_FLOW_COLOR_VERTEX_SHADER,
  );
  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    CANVAS_FLOW_COLOR_FRAGMENT_SHADER,
  );
  const program = createProgram(gl, vertexShader, fragmentShader);
  const positionLocation = gl.getAttribLocation(program, "a_position");
  const resolutionLocation = getUniformLocation(gl, program, "u_resolution");
  const colorLocation = getUniformLocation(gl, program, "u_color");
  const positionBuffer = createBuffer(gl);
  return {
    colorLocation,
    positionBuffer,
    positionLocation,
    program,
    resolutionLocation,
  };
}

function createShader(
  gl: CanvasFlowWebglRenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create CanvasFlow WebGL shader.");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "unknown compile error";
    gl.deleteShader(shader);
    throw new Error(`Failed to compile CanvasFlow WebGL shader: ${info}`);
  }
  return shader;
}

function createProgram(
  gl: CanvasFlowWebglRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
) {
  const program = gl.createProgram();
  if (!program) {
    throw new Error("Failed to create CanvasFlow WebGL program.");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? "unknown link error";
    gl.deleteProgram(program);
    throw new Error(`Failed to link CanvasFlow WebGL program: ${info}`);
  }
  return program;
}

function createBuffer(gl: CanvasFlowWebglRenderingContext) {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error("Failed to create CanvasFlow WebGL buffer.");
  }
  return buffer;
}

function getUniformLocation(
  gl: CanvasFlowWebglRenderingContext,
  program: WebGLProgram,
  name: string,
) {
  const location = gl.getUniformLocation(program, name);
  if (!location) {
    throw new Error(`CanvasFlow WebGL uniform is unavailable: ${name}`);
  }
  return location;
}
