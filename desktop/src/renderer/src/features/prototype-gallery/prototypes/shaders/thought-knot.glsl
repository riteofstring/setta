#version 300 es

precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_listening_time;
uniform float u_thinking_time;
uniform float u_responding_time;
uniform float u_state;
uniform float u_progress;
uniform float u_quality;
uniform vec3 u_background;
uniform vec3 u_primary;
uniform vec3 u_secondary;
uniform vec3 u_tertiary;

float safeAngle(vec2 value) {
  return dot(value, value) > 0.00000001 ? atan(value.y, value.x) : 0.0;
}

mat2 rotate2d(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

float filament(float distanceToPath, float width) {
  float edge = fwidth(distanceToPath) * 1.6 + 0.001;
  return 1.0 - smoothstep(width, width + edge, abs(distanceToPath));
}

void main() {
  vec2 p = v_uv - 0.5;
  p.x *= u_resolution.x / max(u_resolution.y, 1.0);

  float listening = 1.0 - step(0.5, abs(u_state - 1.0));
  float thinking = 1.0 - step(0.5, abs(u_state - 2.0));
  float responding = 1.0 - step(0.5, abs(u_state - 3.0));
  float failed = 1.0 - step(0.5, abs(u_state - 5.0));
  float phaseGate = step(0.5, u_state) * (1.0 - step(4.5, u_state));
  float baseTime = u_time * phaseGate;
  float listeningTime = u_listening_time * phaseGate;
  float thinkingTime = u_thinking_time * phaseGate;
  float respondingTime = u_responding_time * phaseGate;
  float motion =
    baseTime * 0.12 +
    listeningTime * 0.08 +
    thinkingTime * 0.42 +
    respondingTime * 0.22;

  float strands = 0.0;
  float crossings = 0.0;
  vec3 strandColor = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 q = rotate2d(fi * 1.256 + motion * (0.3 + fi * 0.035)) * p;
    q.x += sin(q.y * (7.0 + fi) - motion * 2.0 + fi) * (0.035 + thinking * 0.015);
    q.y += cos(q.x * (6.0 + fi * 0.7) + motion * 1.7) * 0.024;
    float loop = length(vec2(q.x * (1.18 + fi * 0.035), q.y * 0.78)) - (0.205 + fi * 0.013);
    float strand = filament(loop, 0.004 + 0.0015 / u_quality);
    float depth = 0.42 + 0.58 * smoothstep(-0.8, 0.8, sin(safeAngle(q) * 3.0 + motion + fi));
    strands += strand * depth;
    crossings += strand * (1.0 - depth);
    strandColor += strand * depth * mix(u_primary, u_secondary, fract(fi * 0.37));
  }

  float radius = length(p);
  float innerGlow = exp(-radius * radius * (34.0 - responding * 8.0));
  float pulse =
    0.72 + 0.28 * sin(baseTime * 0.9 + listeningTime * 1.2 - radius * 15.0);
  float failureBreaks = mix(1.0, 0.3 + 0.7 * step(0.35, fract(safeAngle(p) * 1.9 + baseTime * 1.8)), failed);

  vec3 color = u_background * innerGlow * 0.1;
  color += strandColor * failureBreaks;
  color += u_tertiary * crossings * 0.48 * failureBreaks;
  color += mix(u_secondary, u_primary, 0.55) * innerGlow * pulse * (0.48 + responding * 0.22);
  color += u_tertiary * exp(-radius * 8.0) * thinking * 0.13;

  float alpha = clamp(strands * 0.62 + crossings * 0.34 + innerGlow * 0.36, 0.0, 0.95);
  alpha *= mix(1.0, 0.64, failed);
  outColor = vec4(color * alpha, alpha);
}
