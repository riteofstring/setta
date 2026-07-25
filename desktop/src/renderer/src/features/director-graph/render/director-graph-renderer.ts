/**
 * The WebGL2 renderer.
 *
 * It is given an immutable packed snapshot, a layout frame, and view state, and
 * it draws. It owns no product decision, no clock, and no semantic value: every
 * colour, size, and glyph it uses comes from `graph-visual-language`, and every
 * position comes from the packed columns.
 *
 * Five passes, in the order the mockup composes them:
 *
 * 1. the drifting particle medium, into the scene framebuffer
 * 2. edge beams, additively
 * 3. node particle clusters, additively
 * 4. the halftone/CRT post pass, resolving the scene onto the canvas
 * 5. glyphs, alpha-blended on top so they stay crisp through the dither
 *
 * Cost is bounded three ways: the scene pass is capped and adaptively scaled,
 * only the visible node and edge slices are drawn, and per-frame uploads are
 * one range of one RG32F texture.
 */

import {
  graphBarrel,
  graphEdgeGeometry,
  graphFieldTint,
  graphFitFrame,
  graphLiveEdgeClipY,
  graphModeColor,
  graphNodeGeometry,
  graphReferenceFrame,
  graphVisualUniforms,
  type GraphFitFrame,
} from "./graph-visual-language";
import {
  graphEdgeFragmentShader,
  graphEdgeVertexShader,
  graphFieldFragmentShader,
  graphFieldHaloSlots,
  graphFieldVertexShader,
  graphGlyphFragmentShader,
  graphGlyphVertexShader,
  graphNodeFragmentShader,
  graphNodeVertexShader,
  graphPostFragmentShader,
  graphPostVertexShader,
} from "./graph-shaders";
import { createGraphProgram, graphSeededRandom, graphUniforms } from "./graph-gl-programs";
import { createGraphGlyphAtlas } from "./graph-glyph-atlas";
import {
  graphEdgeStaticStride,
  graphNodeStateStride,
  graphNodeStateTextureWidth,
  graphNodeStaticStride,
  nodeStateTextureRows,
  type GraphPackedScene,
  type GraphUploadRange,
} from "./graph-scene-packer";
import { graphSurfaceSizes, type GraphQualityProfile } from "./graph-quality";
import { packedGraphGlyphs, packedValueAt } from "../packed-graph-vocabulary";
import type { PackedGraphSnapshot } from "../packed-graph-snapshot";

const floatSize = 4;
const nodeStaticBytes = graphNodeStaticStride * floatSize;
const edgeStaticBytes = graphEdgeStaticStride * floatSize;
/** Floats per particle in the shared template: direction, phase, speed, role. */
const particleTemplateStride = 5;
const particleTemplateBytes = particleTemplateStride * floatSize;

export interface GraphRenderView {
  readonly timeSeconds: number;
  readonly cameraWorldY: number;
  readonly hoverLaneX: number;
  readonly hoverWorldY: number;
  readonly hoverAmount: number;
  /** Full-window slide during a workstream switch, in clip units. */
  readonly shiftX: number;
  /** 0..1 signal tear and aberration during a workstream switch. */
  readonly glitch: number;
  readonly reducedMotion: boolean;
}

export interface GraphRenderFrame {
  readonly snapshot: PackedGraphSnapshot;
  readonly scene: GraphPackedScene;
  readonly worldY: Float32Array;
  readonly nodes: GraphUploadRange;
  readonly edges: GraphUploadRange;
  readonly view: GraphRenderView;
}

const fieldUniformNames = [
  "u_time",
  "u_cam",
  "u_pointScale",
  "u_aspect",
  "u_shiftX",
  "u_flow",
  "u_halo",
  "u_haloCount",
  "u_near",
  "u_far",
] as const;

const edgeUniformNames = [
  "u_time",
  "u_cam",
  "u_aspect",
  "u_width",
  "u_shiftX",
  "u_fitX",
  "u_fitY",
  "u_motion",
  "u_modeColor",
  "u_channel",
  "u_nodeState",
  "u_nodeTexWidth",
  "u_failColor",
] as const;

const nodeUniformNames = [
  "u_time",
  "u_cam",
  "u_pointScale",
  "u_shiftX",
  "u_fitX",
  "u_fitY",
  "u_scale",
  "u_maxPoint",
  "u_motion",
  "u_hoverX",
  "u_hoverY",
  "u_hoverAmount",
  "u_instanceBase",
  "u_modeColor",
  "u_role",
  "u_emphasis",
  "u_detail",
  "u_nodeState",
  "u_nodeTexWidth",
  "u_failColor",
] as const;

const glyphUniformNames = [
  "u_time",
  "u_cam",
  "u_aspect",
  "u_glyphCount",
  "u_shiftX",
  "u_glyphY",
  "u_fitX",
  "u_fitY",
  "u_motion",
  "u_instanceBase",
  "u_modeColor",
  "u_role",
  "u_detail",
  "u_nodeState",
  "u_nodeTexWidth",
  "u_atlas",
  "u_scanlines",
] as const;

const postUniformNames = [
  "u_tex",
  "u_res",
  "u_pixel",
  "u_scanlines",
  "u_time",
  "u_glitch",
  "u_grain",
  "u_barrel",
] as const;

interface GraphSurfaces {
  cssWidth: number;
  cssHeight: number;
  postWidth: number;
  postHeight: number;
  sceneWidth: number;
  sceneHeight: number;
  scenePixelScale: number;
}

export class DirectorGraphRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly fieldProgram: WebGLProgram;
  private readonly edgeProgram: WebGLProgram;
  private readonly nodeProgram: WebGLProgram;
  private readonly glyphProgram: WebGLProgram;
  private readonly postProgram: WebGLProgram;
  private readonly fieldUniforms: ReturnType<
    typeof graphUniforms<(typeof fieldUniformNames)[number]>
  >;
  private readonly edgeUniforms: ReturnType<
    typeof graphUniforms<(typeof edgeUniformNames)[number]>
  >;
  private readonly nodeUniforms: ReturnType<
    typeof graphUniforms<(typeof nodeUniformNames)[number]>
  >;
  private readonly glyphUniforms: ReturnType<
    typeof graphUniforms<(typeof glyphUniformNames)[number]>
  >;
  private readonly postUniforms: ReturnType<
    typeof graphUniforms<(typeof postUniformNames)[number]>
  >;

  private readonly fieldBuffer: WebGLBuffer;
  private readonly particleBuffer: WebGLBuffer;
  private readonly segmentBuffer: WebGLBuffer;
  private readonly quadBuffer: WebGLBuffer;
  private readonly nodeStaticBuffer: WebGLBuffer;
  private readonly edgeStaticBuffer: WebGLBuffer;
  private readonly fieldArray: WebGLVertexArrayObject;
  private readonly edgeArray: WebGLVertexArrayObject;
  private readonly nodeArray: WebGLVertexArrayObject;
  private readonly glyphArray: WebGLVertexArrayObject;
  private readonly atlasTexture: WebGLTexture;
  private readonly stateTexture: WebGLTexture;
  private readonly sceneTexture: WebGLTexture;
  private readonly sceneFramebuffer: WebGLFramebuffer;

  private readonly halos = new Float32Array(graphFieldHaloSlots * 3);
  private readonly maximumPointSize: number;
  private profile: GraphQualityProfile;
  private surfaces: GraphSurfaces = {
    cssWidth: 1,
    cssHeight: 1,
    postWidth: 1,
    postHeight: 1,
    sceneWidth: 1,
    sceneHeight: 1,
    scenePixelScale: 1,
  };
  private fieldCount = 0;
  private particleCount = 0;
  private segmentVertexCount = 0;
  private nodeStaticCapacity = 0;
  private edgeStaticCapacity = 0;
  private stateTexelCapacity = 0;
  private sceneSurfaceKey = "";
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, ownerDocument: Document, profile: GraphQualityProfile) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    if (gl === null) {
      throw new Error("director graph requires a WebGL2 context");
    }
    this.gl = gl;
    this.profile = profile;
    const pointRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array;
    this.maximumPointSize = packedValueAt(pointRange, 1);

    this.fieldProgram = createGraphProgram(
      gl,
      graphFieldVertexShader,
      graphFieldFragmentShader,
      "field",
    );
    this.edgeProgram = createGraphProgram(
      gl,
      graphEdgeVertexShader,
      graphEdgeFragmentShader,
      "edge",
    );
    this.nodeProgram = createGraphProgram(
      gl,
      graphNodeVertexShader,
      graphNodeFragmentShader,
      "node",
    );
    this.glyphProgram = createGraphProgram(
      gl,
      graphGlyphVertexShader,
      graphGlyphFragmentShader,
      "glyph",
    );
    this.postProgram = createGraphProgram(
      gl,
      graphPostVertexShader,
      graphPostFragmentShader,
      "post",
    );
    this.fieldUniforms = graphUniforms(gl, this.fieldProgram, fieldUniformNames);
    this.edgeUniforms = graphUniforms(gl, this.edgeProgram, edgeUniformNames);
    this.nodeUniforms = graphUniforms(gl, this.nodeProgram, nodeUniformNames);
    this.glyphUniforms = graphUniforms(gl, this.glyphProgram, glyphUniformNames);
    this.postUniforms = graphUniforms(gl, this.postProgram, postUniformNames);

    this.fieldBuffer = this.createBuffer();
    this.particleBuffer = this.createBuffer();
    this.segmentBuffer = this.createBuffer();
    this.quadBuffer = this.createBuffer();
    this.nodeStaticBuffer = this.createBuffer();
    this.edgeStaticBuffer = this.createBuffer();
    this.fieldArray = this.createVertexArray();
    this.edgeArray = this.createVertexArray();
    this.nodeArray = this.createVertexArray();
    this.glyphArray = this.createVertexArray();
    this.atlasTexture = this.createTexture();
    this.stateTexture = this.createTexture();
    this.sceneTexture = this.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (framebuffer === null) {
      throw new Error("director graph could not create its scene framebuffer");
    }
    this.sceneFramebuffer = framebuffer;

    this.uploadAtlas(ownerDocument);
    this.uploadQuad();
    this.allocateEmptyInstanceStorage();
    this.applyProfile(profile);
    this.uploadConstantUniforms();
  }

  /**
   * Gives every instance buffer and the state texture one valid element before
   * anything draws. Prewarming runs before the first snapshot arrives, and a
   * draw whose enabled attributes point into an unallocated buffer is an
   * invalid operation rather than an empty picture.
   */
  private allocateEmptyInstanceStorage(): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeStaticBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(graphNodeStaticStride), gl.DYNAMIC_DRAW);
    this.nodeStaticCapacity = 1;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeStaticBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(graphEdgeStaticStride), gl.DYNAMIC_DRAW);
    this.edgeStaticCapacity = 1;
    gl.bindTexture(gl.TEXTURE_2D, this.stateTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RG32F,
      graphNodeStateTextureWidth,
      1,
      0,
      gl.RG,
      gl.FLOAT,
      new Float32Array(graphNodeStateTextureWidth * graphNodeStateStride),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.stateTexelCapacity = graphNodeStateTextureWidth;
  }

  /**
   * Applies a quality tier. Only the tier-sized geometry is rebuilt; snapshot
   * data is untouched, so a tier step costs one buffer rebuild rather than a
   * re-projection.
   */
  applyProfile(profile: GraphQualityProfile): void {
    this.profile = profile;
    this.uploadFieldParticles(profile.fieldParticles);
    this.uploadParticleTemplate(profile.particlesPerNode);
    this.uploadEdgeSegments(profile.edgeSegments);
  }

  /** The context the instrumentation samples GPU frame time from. */
  context(): WebGL2RenderingContext {
    return this.gl;
  }

  /** Sizes both passes for the viewport, tier, and adaptive render scale. */
  resize(
    cssWidth: number,
    cssHeight: number,
    devicePixelRatio: number,
    renderScale: number,
    canvas: HTMLCanvasElement,
  ): void {
    const sizes = graphSurfaceSizes(
      cssWidth,
      cssHeight,
      devicePixelRatio,
      this.profile,
      renderScale,
    );
    this.surfaces = {
      ...sizes,
      cssWidth: Math.max(1, cssWidth),
      cssHeight: Math.max(1, cssHeight),
    };
    if (canvas.width !== sizes.postWidth || canvas.height !== sizes.postHeight) {
      canvas.width = sizes.postWidth;
      canvas.height = sizes.postHeight;
    }
    const key = `${sizes.sceneWidth}x${sizes.sceneHeight}`;
    if (key === this.sceneSurfaceKey) {
      return;
    }
    this.sceneSurfaceKey = key;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      sizes.sceneWidth,
      sizes.sceneHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.sceneTexture,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  surfaceSizes(): Readonly<GraphSurfaces> {
    return this.surfaces;
  }

  /** Uploads only the ranges the packer says changed. */
  upload(scene: GraphPackedScene): void {
    const gl = this.gl;
    if (scene.nodeStatic.length / graphNodeStaticStride !== this.nodeStaticCapacity) {
      this.nodeStaticCapacity = scene.nodeStatic.length / graphNodeStaticStride;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeStaticBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, scene.nodeStatic, gl.DYNAMIC_DRAW);
    } else if (scene.nodeStaticUpload.to > scene.nodeStaticUpload.from) {
      const from = scene.nodeStaticUpload.from * graphNodeStaticStride;
      const length =
        (scene.nodeStaticUpload.to - scene.nodeStaticUpload.from) * graphNodeStaticStride;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeStaticBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, from * floatSize, scene.nodeStatic, from, length);
    }
    if (scene.edgeStatic.length / graphEdgeStaticStride !== this.edgeStaticCapacity) {
      this.edgeStaticCapacity = scene.edgeStatic.length / graphEdgeStaticStride;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeStaticBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, scene.edgeStatic, gl.DYNAMIC_DRAW);
    } else if (scene.edgeStaticUpload.to > scene.edgeStaticUpload.from) {
      const from = scene.edgeStaticUpload.from * graphEdgeStaticStride;
      const length =
        (scene.edgeStaticUpload.to - scene.edgeStaticUpload.from) * graphEdgeStaticStride;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeStaticBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, from * floatSize, scene.edgeStatic, from, length);
    }
    this.uploadNodeState(scene);
  }

  /** Draws one frame. Returns nothing: the canvas is the only output. */
  render(frame: GraphRenderFrame): void {
    const gl = this.gl;
    const fit = graphFitFrame(this.cssWidth(), this.cssHeight());
    const motion = frame.view.reducedMotion ? 0 : 1;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFramebuffer);
    gl.viewport(0, 0, this.surfaces.sceneWidth, this.surfaces.sceneHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.drawField(frame, fit, motion);
    this.drawEdges(frame, fit, motion);
    this.drawNodes(frame, fit, motion);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.surfaces.postWidth, this.surfaces.postHeight);
    gl.disable(gl.BLEND);
    this.drawPost(frame, motion);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawGlyphs(frame, fit, motion);
    gl.disable(gl.BLEND);
  }

  /**
   * Runs every pipeline once before the first visible frame so the driver's
   * pipeline setup does not land on a frame the user is watching.
   */
  prewarm(): void {
    const gl = this.gl;
    // Unit 0 must hold the node state texture, not the scene texture: the scene
    // texture is this framebuffer's own colour attachment, and sampling it while
    // drawing into it is a rendering feedback loop.
    this.bindStateTexture();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFramebuffer);
    gl.viewport(0, 0, 1, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.fieldProgram);
    gl.bindVertexArray(this.fieldArray);
    gl.drawArrays(gl.POINTS, 0, Math.min(1, this.fieldCount));
    gl.useProgram(this.edgeProgram);
    gl.bindVertexArray(this.edgeArray);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.segmentVertexCount, 1);
    gl.useProgram(this.nodeProgram);
    gl.bindVertexArray(this.nodeArray);
    gl.drawArraysInstanced(gl.POINTS, 0, this.particleCount, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.useProgram(this.postProgram);
    gl.bindVertexArray(null);
    gl.viewport(0, 0, 1, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.glyphProgram);
    gl.bindVertexArray(this.glyphArray);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 1);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.useProgram(null);
    gl.flush();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const gl = this.gl;
    for (const buffer of [
      this.fieldBuffer,
      this.particleBuffer,
      this.segmentBuffer,
      this.quadBuffer,
      this.nodeStaticBuffer,
      this.edgeStaticBuffer,
    ]) {
      gl.deleteBuffer(buffer);
    }
    for (const array of [this.fieldArray, this.edgeArray, this.nodeArray, this.glyphArray]) {
      gl.deleteVertexArray(array);
    }
    for (const texture of [this.atlasTexture, this.stateTexture, this.sceneTexture]) {
      gl.deleteTexture(texture);
    }
    gl.deleteFramebuffer(this.sceneFramebuffer);
    for (const program of [
      this.fieldProgram,
      this.edgeProgram,
      this.nodeProgram,
      this.glyphProgram,
      this.postProgram,
    ]) {
      gl.deleteProgram(program);
    }
  }

  private cssWidth(): number {
    return this.surfaces.cssWidth;
  }

  private cssHeight(): number {
    return this.surfaces.cssHeight;
  }

  private createBuffer(): WebGLBuffer {
    const buffer = this.gl.createBuffer();
    if (buffer === null) {
      throw new Error("director graph could not create a vertex buffer");
    }
    return buffer;
  }

  private createVertexArray(): WebGLVertexArrayObject {
    const array = this.gl.createVertexArray();
    if (array === null) {
      throw new Error("director graph could not create a vertex array");
    }
    return array;
  }

  private createTexture(): WebGLTexture {
    const texture = this.gl.createTexture();
    if (texture === null) {
      throw new Error("director graph could not create a texture");
    }
    return texture;
  }

  private uploadAtlas(ownerDocument: Document): void {
    const gl = this.gl;
    const atlas = createGraphGlyphAtlas(ownerDocument);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private uploadQuad(): void {
    const gl = this.gl;
    const corners = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
  }

  private uploadFieldParticles(count: number): void {
    const gl = this.gl;
    const random = graphSeededRandom(4242);
    const data = new Float32Array(count * 4);
    for (let index = 0; index < count; index += 1) {
      data[index * 4] = random();
      data[index * 4 + 1] = random();
      data[index * 4 + 2] = random();
      data[index * 4 + 3] = random();
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.fieldCount = count;
    gl.bindVertexArray(this.fieldArray);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
    gl.bindVertexArray(null);
  }

  /**
   * One particle template shared by every node. Per-node variety comes from a
   * hash of the node index in the shader, so a graph of any size uploads this
   * once.
   */
  private uploadParticleTemplate(count: number): void {
    const gl = this.gl;
    const random = graphSeededRandom(911);
    const data = new Float32Array(count * particleTemplateStride);
    for (let index = 0; index < count; index += 1) {
      const offset = index * particleTemplateStride;
      if (index === 0) {
        data.set([0, 0, 0, 0.6, 0], offset);
        continue;
      }
      const angle = random() * Math.PI * 2;
      const magnitude = 0.35 + random() * 0.95;
      data[offset] = Math.cos(angle) * magnitude;
      data[offset + 1] = Math.sin(angle) * magnitude;
      data[offset + 2] = random();
      data[offset + 3] = 0.5 + random() * 1.4;
      data[offset + 4] = index % 3 === 0 ? 2 : 1;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.particleCount = count;
    gl.bindVertexArray(this.nodeArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, particleTemplateBytes, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, particleTemplateBytes, 16);
    gl.bindVertexArray(null);
    this.bindNodeInstances(0);
    this.bindGlyphInstances(0);
  }

  private uploadEdgeSegments(segments: number): void {
    const gl = this.gl;
    const data = new Float32Array(segments * 6 * 2);
    let offset = 0;
    for (let segment = 0; segment < segments; segment += 1) {
      const start = segment / segments;
      const end = (segment + 1) / segments;
      const corners: readonly (readonly [number, number])[] = [
        [start, 1],
        [start, -1],
        [end, 1],
        [start, -1],
        [end, -1],
        [end, 1],
      ];
      for (const [t, side] of corners) {
        data[offset] = t;
        data[offset + 1] = side;
        offset += 2;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.segmentBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.segmentVertexCount = segments * 6;
    gl.bindVertexArray(this.edgeArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.segmentBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this.bindEdgeInstances(0);
  }

  /**
   * Points the node pass's instance attributes at the first visible node.
   * WebGL2 has no base-instance draw, so the slice is expressed as an attribute
   * offset and the shader adds `u_instanceBase` when it reads node state.
   */
  private bindNodeInstances(base: number): void {
    const gl = this.gl;
    const start = base * nodeStaticBytes;
    gl.bindVertexArray(this.nodeArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeStaticBuffer);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, nodeStaticBytes, start);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, nodeStaticBytes, start + 16);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, nodeStaticBytes, start + 32);
    gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);
  }

  private bindGlyphInstances(base: number): void {
    const gl = this.gl;
    const start = base * nodeStaticBytes;
    gl.bindVertexArray(this.glyphArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeStaticBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, nodeStaticBytes, start);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, nodeStaticBytes, start + 16);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, nodeStaticBytes, start + 32);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
  }

  private bindEdgeInstances(base: number): void {
    const gl = this.gl;
    const start = base * edgeStaticBytes;
    gl.bindVertexArray(this.edgeArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeStaticBuffer);
    for (const [location, size, offset] of [
      [1, 2, 0],
      [2, 2, 8],
      [3, 4, 16],
      [4, 2, 32],
    ] as const) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, edgeStaticBytes, start + offset);
      gl.vertexAttribDivisor(location, 1);
    }
    gl.bindVertexArray(null);
  }

  private uploadNodeState(scene: GraphPackedScene): void {
    const gl = this.gl;
    const texels = scene.nodeState.length / graphNodeStateStride;
    const rows = Math.max(1, Math.ceil(texels / graphNodeStateTextureWidth));
    gl.bindTexture(gl.TEXTURE_2D, this.stateTexture);
    if (texels !== this.stateTexelCapacity) {
      this.stateTexelCapacity = texels;
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RG32F,
        graphNodeStateTextureWidth,
        rows,
        0,
        gl.RG,
        gl.FLOAT,
        scene.nodeState,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return;
    }
    const region = nodeStateTextureRows(scene.nodeStateUpload);
    if (region.rowCount === 0) {
      return;
    }
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      region.firstRow,
      graphNodeStateTextureWidth,
      region.rowCount,
      gl.RG,
      gl.FLOAT,
      scene.nodeState,
      region.firstRow * graphNodeStateTextureWidth * graphNodeStateStride,
    );
  }

  /** Values that never change once a program is linked. */
  private uploadConstantUniforms(): void {
    const gl = this.gl;
    const fail = graphModeColor.fail;
    gl.useProgram(this.edgeProgram);
    gl.uniform3fv(this.edgeUniforms.u_modeColor, graphVisualUniforms.modeColor);
    gl.uniform2fv(this.edgeUniforms.u_channel, graphVisualUniforms.edgeChannel);
    gl.uniform3f(this.edgeUniforms.u_failColor, fail[0], fail[1], fail[2]);
    gl.uniform1i(this.edgeUniforms.u_nodeState, 0);
    gl.uniform1i(this.edgeUniforms.u_nodeTexWidth, graphNodeStateTextureWidth);
    gl.useProgram(this.nodeProgram);
    gl.uniform3fv(this.nodeUniforms.u_modeColor, graphVisualUniforms.modeColor);
    gl.uniform3fv(this.nodeUniforms.u_role, graphVisualUniforms.role);
    gl.uniform3fv(this.nodeUniforms.u_emphasis, graphVisualUniforms.emphasis);
    gl.uniform3fv(this.nodeUniforms.u_detail, graphVisualUniforms.detail);
    gl.uniform3f(this.nodeUniforms.u_failColor, fail[0], fail[1], fail[2]);
    gl.uniform1f(this.nodeUniforms.u_maxPoint, this.maximumPointSize);
    gl.uniform1i(this.nodeUniforms.u_nodeState, 0);
    gl.uniform1i(this.nodeUniforms.u_nodeTexWidth, graphNodeStateTextureWidth);
    gl.useProgram(this.glyphProgram);
    gl.uniform3fv(this.glyphUniforms.u_modeColor, graphVisualUniforms.modeColor);
    gl.uniform3fv(this.glyphUniforms.u_role, graphVisualUniforms.role);
    gl.uniform3fv(this.glyphUniforms.u_detail, graphVisualUniforms.detail);
    gl.uniform1f(this.glyphUniforms.u_glyphCount, packedGraphGlyphs.length);
    gl.uniform1i(this.glyphUniforms.u_nodeState, 0);
    gl.uniform1i(this.glyphUniforms.u_nodeTexWidth, graphNodeStateTextureWidth);
    gl.uniform1i(this.glyphUniforms.u_atlas, 1);
    gl.useProgram(this.fieldProgram);
    gl.uniform3f(
      this.fieldUniforms.u_near,
      graphFieldTint.near[0],
      graphFieldTint.near[1],
      graphFieldTint.near[2],
    );
    gl.uniform3f(
      this.fieldUniforms.u_far,
      graphFieldTint.far[0],
      graphFieldTint.far[1],
      graphFieldTint.far[2],
    );
    gl.useProgram(this.postProgram);
    gl.uniform1i(this.postUniforms.u_tex, 0);
    gl.useProgram(null);
  }

  private bindStateTexture(): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.stateTexture);
  }

  private drawField(frame: GraphRenderFrame, fit: GraphFitFrame, motion: number): void {
    const gl = this.gl;
    gl.useProgram(this.fieldProgram);
    const count = this.collectHalos(frame, fit);
    gl.uniform1f(this.fieldUniforms.u_time, frame.view.timeSeconds);
    gl.uniform1f(this.fieldUniforms.u_cam, frame.view.cameraWorldY);
    gl.uniform1f(this.fieldUniforms.u_pointScale, this.surfaces.scenePixelScale);
    gl.uniform1f(
      this.fieldUniforms.u_aspect,
      this.surfaces.sceneWidth / Math.max(1, this.surfaces.sceneHeight),
    );
    gl.uniform1f(this.fieldUniforms.u_shiftX, frame.view.shiftX);
    gl.uniform1f(this.fieldUniforms.u_flow, this.profile.effects.fieldFlow ? motion : 0);
    gl.uniform3fv(this.fieldUniforms.u_halo, this.halos);
    gl.uniform1i(this.fieldUniforms.u_haloCount, count);
    gl.bindVertexArray(this.fieldArray);
    gl.drawArrays(gl.POINTS, 0, this.fieldCount);
  }

  private drawEdges(frame: GraphRenderFrame, fit: GraphFitFrame, motion: number): void {
    const gl = this.gl;
    const count = frame.edges.to - frame.edges.from;
    if (count <= 0) {
      return;
    }
    this.bindEdgeInstances(frame.edges.from);
    gl.useProgram(this.edgeProgram);
    this.bindStateTexture();
    gl.uniform1f(this.edgeUniforms.u_time, frame.view.timeSeconds);
    gl.uniform1f(this.edgeUniforms.u_cam, frame.view.cameraWorldY);
    gl.uniform1f(
      this.edgeUniforms.u_aspect,
      (fit.fitX * this.cssWidth()) / Math.max(1, fit.fitY * this.cssHeight()),
    );
    gl.uniform1f(this.edgeUniforms.u_width, graphEdgeGeometry.baseWidth);
    gl.uniform1f(this.edgeUniforms.u_shiftX, frame.view.shiftX);
    gl.uniform1f(this.edgeUniforms.u_fitX, fit.fitX);
    gl.uniform1f(this.edgeUniforms.u_fitY, fit.fitY);
    gl.uniform1f(this.edgeUniforms.u_motion, motion);
    gl.bindVertexArray(this.edgeArray);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.segmentVertexCount, count);
  }

  private drawNodes(frame: GraphRenderFrame, fit: GraphFitFrame, motion: number): void {
    const gl = this.gl;
    const count = frame.nodes.to - frame.nodes.from;
    if (count <= 0) {
      return;
    }
    this.bindNodeInstances(frame.nodes.from);
    gl.useProgram(this.nodeProgram);
    this.bindStateTexture();
    gl.uniform1f(this.nodeUniforms.u_time, frame.view.timeSeconds);
    gl.uniform1f(this.nodeUniforms.u_cam, frame.view.cameraWorldY);
    gl.uniform1f(this.nodeUniforms.u_pointScale, this.surfaces.scenePixelScale);
    gl.uniform1f(this.nodeUniforms.u_shiftX, frame.view.shiftX);
    gl.uniform1f(this.nodeUniforms.u_fitX, fit.fitX);
    gl.uniform1f(this.nodeUniforms.u_fitY, fit.fitY);
    gl.uniform1f(this.nodeUniforms.u_scale, fit.size);
    gl.uniform1f(this.nodeUniforms.u_motion, motion);
    gl.uniform1f(this.nodeUniforms.u_hoverX, frame.view.hoverLaneX);
    gl.uniform1f(this.nodeUniforms.u_hoverY, frame.view.hoverWorldY);
    gl.uniform1f(this.nodeUniforms.u_hoverAmount, frame.view.hoverAmount);
    gl.uniform1i(this.nodeUniforms.u_instanceBase, frame.nodes.from);
    gl.bindVertexArray(this.nodeArray);
    gl.drawArraysInstanced(gl.POINTS, 0, this.particleCount, count);
  }

  private drawPost(frame: GraphRenderFrame, motion: number): void {
    const gl = this.gl;
    gl.useProgram(this.postProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.uniform2f(this.postUniforms.u_res, this.surfaces.postWidth, this.surfaces.postHeight);
    gl.uniform1f(
      this.postUniforms.u_pixel,
      Math.max(
        1.6,
        this.profile.ditherPixel * (this.surfaces.postWidth / Math.max(1, this.cssWidth())),
      ),
    );
    gl.uniform1f(this.postUniforms.u_scanlines, this.profile.effects.scanlines ? 1 : 0);
    gl.uniform1f(this.postUniforms.u_grain, this.profile.effects.grain ? 1 : 0);
    gl.uniform1f(this.postUniforms.u_time, frame.view.timeSeconds);
    gl.uniform1f(
      this.postUniforms.u_glitch,
      this.profile.effects.switchTear ? frame.view.glitch * motion : 0,
    );
    gl.uniform1f(this.postUniforms.u_barrel, this.profile.effects.barrel ? graphBarrel : 0);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private drawGlyphs(frame: GraphRenderFrame, fit: GraphFitFrame, motion: number): void {
    const gl = this.gl;
    const count = frame.nodes.to - frame.nodes.from;
    if (count <= 0) {
      return;
    }
    this.bindGlyphInstances(frame.nodes.from);
    gl.useProgram(this.glyphProgram);
    this.bindStateTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.uniform1f(this.glyphUniforms.u_time, frame.view.timeSeconds);
    gl.uniform1f(this.glyphUniforms.u_cam, frame.view.cameraWorldY);
    gl.uniform1f(this.glyphUniforms.u_aspect, this.cssWidth() / Math.max(1, this.cssHeight()));
    gl.uniform1f(this.glyphUniforms.u_shiftX, frame.view.shiftX);
    gl.uniform1f(
      this.glyphUniforms.u_glyphY,
      (fit.size * graphReferenceFrame.height) / Math.max(1, this.cssHeight()),
    );
    gl.uniform1f(this.glyphUniforms.u_fitX, fit.fitX);
    gl.uniform1f(this.glyphUniforms.u_fitY, fit.fitY);
    gl.uniform1f(this.glyphUniforms.u_motion, motion);
    gl.uniform1f(this.glyphUniforms.u_scanlines, this.profile.effects.scanlines ? 1 : 0);
    gl.uniform1i(this.glyphUniforms.u_instanceBase, frame.nodes.from);
    gl.bindVertexArray(this.glyphArray);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
  }

  /**
   * The nodes the background medium parts around. Bounded to a fixed slot count
   * so the uniform stays small and the field's inner loop stays short.
   */
  private collectHalos(frame: GraphRenderFrame, fit: GraphFitFrame): number {
    let count = 0;
    for (
      let index = frame.nodes.from;
      index < frame.nodes.to && count < graphFieldHaloSlots;
      index += 1
    ) {
      const open = packedValueAt(frame.scene.nodeState, index * graphNodeStateStride + 1);
      if (open < 0.12) {
        continue;
      }
      const worldY = packedValueAt(frame.worldY, index);
      const clipY = graphLiveEdgeClipY + (frame.view.cameraWorldY - worldY);
      if (clipY < -1.35 || clipY > 1.35) {
        continue;
      }
      const working =
        frame.view.timeSeconds >= packedValueAt(frame.snapshot.nodes.bornAt, index) &&
        frame.view.timeSeconds < packedValueAt(frame.snapshot.nodes.settleAt, index);
      const diameter =
        (graphNodeGeometry.baseDiameter + (working ? graphNodeGeometry.workingBonus : 0)) *
        graphNodeGeometry.cssDiameterScale *
        fit.size;
      this.halos[count * 3] = packedValueAt(frame.snapshot.nodes.lane, index) * fit.fitX;
      this.halos[count * 3 + 1] = clipY * fit.fitY;
      this.halos[count * 3 + 2] = Math.max(0.012, diameter / Math.max(1, this.cssHeight()));
      count += 1;
    }
    this.halos.fill(0, count * 3);
    return count;
  }
}
