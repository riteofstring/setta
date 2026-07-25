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
uniform float u_effects;
uniform vec3 u_background;
uniform vec3 u_primary;
uniform vec3 u_secondary;
uniform vec3 u_tertiary;

float hash21(vec2 value) {
  return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
}

mat2 rotate2d(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

float boxDistance(vec3 p, vec3 halfSize) {
  vec3 q = abs(p) - halfSize;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float octahedronDistance(vec3 p, float size) {
  p = abs(p);
  return (p.x + p.y + p.z - size) * 0.57735026919;
}

float sceneDistance(vec3 point, float motion, float thinking) {
  vec3 q = point;
  q.xz = rotate2d(0.34 + motion * 0.38) * q.xz;
  q.xy = rotate2d(-0.16 + motion * 0.17) * q.xy;

  float distanceToScene = 10.0;
  for (int index = 0; index < 5; index++) {
    float fi = float(index) - 2.0;
    vec3 slabPoint = q - vec3(
      sin(fi * 1.7 + motion) * (0.018 + thinking * 0.026),
      fi * 0.185,
      cos(fi * 1.2 - motion * 0.7) * thinking * 0.018
    );
    float slab = boxDistance(slabPoint, vec3(0.255 - abs(fi) * 0.012, 0.071, 0.19));
    distanceToScene = min(distanceToScene, slab);
  }

  for (int index = 0; index < 3; index++) {
    float fi = float(index);
    float angle = fi * 2.094 + motion * (0.3 + fi * 0.05);
    vec3 shardCenter = vec3(cos(angle) * 0.49, sin(angle * 1.3) * 0.27, sin(angle) * 0.34);
    vec3 shardPoint = q - shardCenter;
    shardPoint.xy = rotate2d(angle + motion * 0.8) * shardPoint.xy;
    distanceToScene = min(distanceToScene, octahedronDistance(shardPoint, 0.075 + thinking * 0.018));
  }
  return distanceToScene;
}

vec3 sceneNormal(vec3 point, float motion, float thinking) {
  vec2 offset = vec2(0.0015, -0.0015);
  return normalize(
    offset.xyy * sceneDistance(point + offset.xyy, motion, thinking) +
    offset.yyx * sceneDistance(point + offset.yyx, motion, thinking) +
    offset.yxy * sceneDistance(point + offset.yxy, motion, thinking) +
    offset.xxx * sceneDistance(point + offset.xxx, motion, thinking)
  );
}

float starField(vec2 p) {
  vec2 cell = floor(p * 170.0);
  vec2 local = fract(p * 170.0) - 0.5;
  float seed = hash21(cell);
  return step(0.991, seed) * exp(-dot(local, local) * 64.0);
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
    baseTime * 0.04 +
    listeningTime * 0.05 +
    thinkingTime * 0.22 +
    respondingTime * 0.11;

  vec3 voidColor = u_background * 0.055;
  float thresholdBeam = exp(-abs(p.x + sin(p.y * 1.7) * 0.025) * 18.0) * exp(-abs(p.y) * 0.75);
  vec3 color = voidColor + mix(u_tertiary, u_secondary, 0.25) * thresholdBeam * 0.055;
  color += mix(u_primary, u_tertiary, hash21(floor(v_uv * 80.0))) * starField(v_uv) * 0.3;

  vec3 rayOrigin = vec3(0.0, 0.02, 2.8);
  vec3 rayDirection = normalize(vec3(p * 1.16, -1.9));
  float travel = 0.0;
  float distanceToScene = 0.0;
  bool hit = false;
  int maximumSteps = u_quality < 0.8 ? 38 : (u_quality < 1.4 ? 48 : 58);
  for (int stepIndex = 0; stepIndex < 58; stepIndex++) {
    if (stepIndex >= maximumSteps) {
      break;
    }
    vec3 samplePoint = rayOrigin + rayDirection * travel;
    distanceToScene = sceneDistance(samplePoint, motion, thinking);
    if (distanceToScene < 0.0015) {
      hit = true;
      break;
    }
    travel += distanceToScene * 0.82;
    if (travel > 5.5) {
      break;
    }
  }

  if (hit) {
    vec3 position = rayOrigin + rayDirection * travel;
    vec3 normal = sceneNormal(position, motion, thinking);
    vec3 lightDirection = normalize(vec3(-0.55, 0.78, 0.38));
    vec3 fillDirection = normalize(vec3(0.68, -0.22, 0.66));
    float diffuse = max(dot(normal, lightDirection), 0.0);
    float fill = max(dot(normal, fillDirection), 0.0);
    float rim = pow(1.0 - max(dot(normal, -rayDirection), 0.0), 2.2);
    float specular = pow(max(dot(reflect(-lightDirection, normal), -rayDirection), 0.0), 42.0);
    float seams = exp(-abs(fract((position.y + 0.55) / 0.185) - 0.5) * 42.0);
    float signal = 0.5 + 0.5 * sin(position.y * 28.0 - motion * 7.0 + position.x * 6.0);
    float failureCut = mix(1.0, step(0.32, fract(position.y * 11.0 + baseTime * 2.5)), failed);

    vec3 stone = mix(u_background * 0.16, u_secondary * 0.24, diffuse);
    stone += u_primary * fill * 0.1;
    stone += mix(u_primary, u_tertiary, signal) * seams * (0.26 + thinking * 0.32);
    stone += u_primary * rim * (0.22 + responding * 0.24);
    stone += mix(u_primary, vec3(1.0), 0.42) * specular * 0.48;
    color = stone * failureCut;
  }

  float floorGlow = exp(-abs(p.y + 0.39) * 42.0) * exp(-abs(p.x) * 1.6);
  color += mix(u_tertiary, u_primary, 0.18) * floorGlow * (0.025 + listening * 0.018);
  float vignette = smoothstep(1.05, 0.2, length(p));
  color *= 0.62 + vignette * 0.38;

  float effects = step(0.5, u_effects);
  float grain = hash21(gl_FragCoord.xy + floor(baseTime * 18.0)) - 0.5;
  float scanline = 0.982 + 0.018 * sin(gl_FragCoord.y * 1.55);
  float failedBand = step(0.5, hash21(vec2(floor(gl_FragCoord.y * 0.065), 73.0)));
  vec3 failedGrade = mix(color, vec3(color.r * 1.16, color.g * 0.58, color.b * 0.72), failedBand * failed);
  color = mix(color, failedGrade * scanline + grain * 0.022, effects);
  outColor = vec4(color, 1.0);
}
