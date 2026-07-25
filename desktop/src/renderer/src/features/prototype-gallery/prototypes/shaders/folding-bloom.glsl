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

#define PI 3.14159265359
#define TAU 6.28318530718

float safeAngle(vec2 value) {
  return dot(value, value) > 0.00000001 ? atan(value.y, value.x) : 0.0;
}

float band(float value, float center, float width) {
  float edge = fwidth(value) * 1.5 + 0.001;
  return 1.0 - smoothstep(width, width + edge, abs(value - center));
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

  float radius = length(p);
  float angle = safeAngle(p);
  float motion =
    baseTime * 0.08 +
    listeningTime * 0.09 +
    thinkingTime * 0.25 +
    respondingTime * 0.15;
  float opening = 0.68 + listening * 0.08 + responding * 0.14 - thinking * 0.06;
  opening += sin(baseTime * 0.65 + listeningTime * 1.25) * 0.035;

  float bloom = 0.0;
  float veins = 0.0;
  vec3 bloomColor = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float lobes = 5.0 + fi * 2.0;
    float foldedAngle = angle + motion * (fi - 1.0) + sin(radius * 15.0 - motion * 4.0) * 0.08;
    float petal = cos(foldedAngle * lobes) * (0.055 + fi * 0.012) * opening;
    float shell = radius - (0.17 + fi * 0.066 + petal);
    float layer = band(shell, 0.0, 0.014 + fi * 0.003 + 0.002 / u_quality);
    float fill = 1.0 - smoothstep(-0.018, 0.035, shell);
    float fold = pow(max(0.0, cos(foldedAngle * lobes + PI * 0.5)), 4.0);
    float translucentLayer = layer * 0.8 + fill * fold * 0.18;
    bloom += translucentLayer;
    bloomColor += translucentLayer * mix(u_primary, u_tertiary, fi * 0.34);
    veins += band(sin(foldedAngle * lobes) * radius, 0.0, 0.0035) * fill * 0.18;
  }

  float centerPulse = 0.84 + 0.16 * sin(baseTime + listeningTime);
  float center = exp(-radius * radius * (74.0 - responding * 18.0)) * centerPulse;
  float softVolume = exp(-radius * radius * 8.0) * (1.0 - smoothstep(0.12, 0.48, radius));
  float failureCut = mix(1.0, step(0.22, fract(angle / TAU * 12.0 + baseTime * 2.4)), failed);

  vec3 color = u_background * softVolume * 0.1;
  color += bloomColor * failureCut;
  color += u_secondary * veins * (0.8 + thinking * 0.6);
  color += mix(u_primary, u_secondary, 0.38) * center * (1.4 + responding * 0.25);
  color += u_tertiary * softVolume * 0.14;

  float alpha = clamp(bloom * 0.58 + veins + center * 0.78 + softVolume * 0.14, 0.0, 0.94);
  alpha *= mix(1.0, 0.68, failed);
  outColor = vec4(color * alpha, alpha);
}
