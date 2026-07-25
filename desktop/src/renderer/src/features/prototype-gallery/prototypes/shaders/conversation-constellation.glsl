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

#define TAU 6.28318530718

float hash11(float value) {
  return fract(sin(value * 127.1) * 43758.5453123);
}

float safeAngle(vec2 value) {
  return dot(value, value) > 0.00000001 ? atan(value.y, value.x) : 0.0;
}

vec2 nodePosition(float index, float motion, float activity) {
  float seed = hash11(index + 1.0);
  float angle = index * 2.39996323 + motion * (0.12 + seed * 0.14);
  float radius = 0.08 + 0.24 * sqrt((index + 0.8) / 9.8);
  radius += sin(motion * 0.7 + index * 1.91) * 0.012 * activity;
  return vec2(cos(angle), sin(angle)) * radius;
}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 segment = b - a;
  float projection = clamp(dot(p - a, segment) / max(dot(segment, segment), 0.00001), 0.0, 1.0);
  return length(p - a - segment * projection);
}

vec2 edgeContribution(
  vec2 p,
  vec2 a,
  vec2 b,
  float travel,
  float quality
) {
  float span = length(b - a);
  float connection = 1.0 - smoothstep(0.18, 0.43, span);
  float line = exp(-segmentDistance(p, a, b) * (190.0 + 55.0 * quality));
  vec2 signalPosition = mix(a, b, travel);
  float signal = exp(-length(p - signalPosition) * (125.0 + 30.0 * quality));
  return vec2(line * connection * 0.23, signal * connection);
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
  float activity = 0.32 + listening * 0.38 + thinking * 0.68 + responding * 0.5;
  float motion =
    baseTime * 0.16 +
    listeningTime * 0.13 +
    thinkingTime * 0.5 +
    respondingTime * 0.27;

  vec2 nodePositions[9];
  for (int i = 0; i < 9; i++) {
    nodePositions[i] = nodePosition(float(i), motion, activity);
  }

  float signalPhase = baseTime * 0.15 + thinkingTime * 0.55 + respondingTime * 0.32;
  vec2 topology = vec2(0.0);
  topology += edgeContribution(p, nodePositions[0], nodePositions[1], fract(signalPhase + 0.07), u_quality);
  topology += edgeContribution(p, nodePositions[0], nodePositions[2], fract(signalPhase + 0.19), u_quality);
  topology += edgeContribution(p, nodePositions[1], nodePositions[3], fract(signalPhase + 0.31), u_quality);
  topology += edgeContribution(p, nodePositions[1], nodePositions[4], fract(signalPhase + 0.43), u_quality);
  topology += edgeContribution(p, nodePositions[2], nodePositions[4], fract(signalPhase + 0.53), u_quality);
  topology += edgeContribution(p, nodePositions[2], nodePositions[5], fract(signalPhase + 0.61), u_quality);
  topology += edgeContribution(p, nodePositions[3], nodePositions[6], fract(signalPhase + 0.71), u_quality);
  topology += edgeContribution(p, nodePositions[4], nodePositions[6], fract(signalPhase + 0.79), u_quality);
  topology += edgeContribution(p, nodePositions[4], nodePositions[7], fract(signalPhase + 0.87), u_quality);
  topology += edgeContribution(p, nodePositions[5], nodePositions[7], fract(signalPhase + 0.11), u_quality);
  topology += edgeContribution(p, nodePositions[6], nodePositions[8], fract(signalPhase + 0.37), u_quality);
  topology += edgeContribution(p, nodePositions[7], nodePositions[8], fract(signalPhase + 0.67), u_quality);
  float filaments = topology.x;
  float signals = topology.y;

  float nodes = 0.0;
  vec3 nodeColor = vec3(0.0);
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    vec2 position = nodePositions[i];
    float distanceToNode = length(p - position);
    float node = exp(-distanceToNode * (105.0 + 35.0 * u_quality));
    float halo = exp(-distanceToNode * 28.0) * 0.18;
    float pulse =
      0.72 + 0.28 * sin(baseTime * 0.9 + listeningTime * 1.5 + fi * 1.37);
    nodes += node * pulse + halo;
    nodeColor += (node * pulse + halo) * mix(u_primary, u_secondary, hash11(fi + 4.0));
  }

  float center = exp(-length(p) * (52.0 - responding * 8.0));
  float failureDrop = mix(1.0, 0.42 + 0.58 * step(0.48, fract(safeAngle(p) / TAU * 11.0 + baseTime * 2.0)), failed);
  vec3 color = u_background * exp(-length(p) * 5.0) * 0.08;
  color += nodeColor * failureDrop;
  color += mix(u_secondary, u_tertiary, 0.45) * filaments * failureDrop;
  color += u_primary * signals * (0.55 + responding * 0.55);
  color += mix(u_primary, u_secondary, 0.5) * center * 0.7;
  color += u_tertiary * filaments * thinking * 0.22;

  float alpha = clamp(nodes * 0.55 + filaments * 0.8 + signals * 0.65 + center * 0.58, 0.0, 0.95);
  alpha *= mix(1.0, 0.68, failed);
  outColor = vec4(color * alpha, alpha);
}
