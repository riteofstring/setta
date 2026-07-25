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

#define TAU 6.28318530718

float hash21(vec2 value) {
  return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
}

mat2 rotate2d(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

float sphereIntersection(vec3 rayOrigin, vec3 rayDirection, float radius, out float farHit) {
  float b = dot(rayOrigin, rayDirection);
  float c = dot(rayOrigin, rayOrigin) - radius * radius;
  float discriminant = b * b - c;
  if (discriminant < 0.0) {
    farHit = -1.0;
    return -1.0;
  }
  float root = sqrt(discriminant);
  farHit = -b + root;
  return -b - root;
}

float periodicLine(float phase, float width) {
  float value = abs(sin(phase));
  float edge = fwidth(phase) * 1.5 + 0.001;
  return 1.0 - smoothstep(width, width + edge, value);
}

float starField(vec2 p) {
  vec2 cell = floor(p * 150.0);
  vec2 local = fract(p * 150.0) - 0.5;
  float seed = hash21(cell);
  float star = step(0.986, seed) * exp(-dot(local, local) * 72.0);
  float distant = step(0.996, hash21(cell + 41.0)) * exp(-dot(local, local) * 18.0);
  return star * 0.55 + distant;
}

void main() {
  vec2 p = v_uv - 0.5;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  p.x *= aspect;

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
    baseTime * 0.05 +
    listeningTime * 0.07 +
    thinkingTime * 0.28 +
    respondingTime * 0.15;

  vec3 voidColor = u_background * 0.07;
  float nebula = exp(-dot(p - vec2(0.18, -0.08), p - vec2(0.18, -0.08)) * 2.4);
  vec3 color = voidColor + mix(u_tertiary, u_secondary, 0.45) * nebula * 0.025;
  color += mix(u_primary, u_secondary, hash21(floor(v_uv * 90.0))) * starField(v_uv) * 0.38;

  vec3 rayOrigin = vec3(0.0, 0.0, 2.7);
  vec3 rayDirection = normalize(vec3(p * 1.18, -1.85));
  float farHit = -1.0;
  float nearHit = sphereIntersection(rayOrigin, rayDirection, 0.56, farHit);

  if (nearHit > 0.0) {
    vec3 position = rayOrigin + rayDirection * nearHit;
    vec3 normal = normalize(position);
    normal.xz = rotate2d(motion * 0.72) * normal.xz;
    normal.yz = rotate2d(-0.48 + motion * 0.31) * normal.yz;

    float longitude = atan(normal.z, normal.x);
    float latitude = asin(clamp(normal.y, -1.0, 1.0));
    float density = 5.0 + thinking * 2.0;
    float longitudeGrid = periodicLine(longitude * density, 0.045 + 0.012 / u_quality);
    float latitudeGrid = periodicLine((latitude + 1.57079632679) * density, 0.045 + 0.012 / u_quality);
    float grid = max(longitudeGrid, latitudeGrid);

    vec3 lightDirection = normalize(vec3(-0.45, 0.72, 0.54));
    float diffuse = max(dot(normal, lightDirection), 0.0);
    float rim = pow(1.0 - max(dot(normal, -rayDirection), 0.0), 2.4);
    float depth = max(farHit - nearHit, 0.0);
    float innerVolume = 1.0 - exp(-depth * (1.8 + listening));
    float sweep = 0.5 + 0.5 * sin(longitude * 2.0 - motion * 3.0 + latitude * 3.0);
    float failureCut = mix(1.0, step(0.38, fract(latitude * 5.0 + baseTime * 2.0)), failed);

    vec3 shell = mix(u_background * 0.18, u_secondary * 0.28, diffuse);
    shell += mix(u_primary, u_secondary, sweep) * grid * (0.65 + thinking * 0.3);
    shell += u_primary * rim * (0.35 + responding * 0.26);
    shell += mix(u_tertiary, u_primary, 0.35) * innerVolume * 0.16;
    color = mix(color, shell * failureCut, 0.74 + rim * 0.2);

    const vec3 nodeDirections[6] = vec3[6](
      vec3(0.82, 0.31, 0.48),
      vec3(-0.62, 0.68, 0.39),
      vec3(0.18, -0.88, 0.44),
      vec3(-0.78, -0.19, 0.59),
      vec3(0.51, 0.76, -0.4),
      vec3(-0.12, -0.54, -0.83)
    );
    float nodes = 0.0;
    for (int index = 0; index < 6; index++) {
      vec3 direction = normalize(nodeDirections[index]);
      direction.xz = rotate2d(motion * (0.42 + float(index) * 0.025)) * direction.xz;
      float alignment = max(dot(normal, direction), 0.0);
      nodes += pow(alignment, 150.0 / max(u_quality, 0.5));
    }
    color += mix(u_primary, u_tertiary, 0.35) * nodes * (1.0 + responding * 0.5);
  }

  vec2 ringPoint = rotate2d(motion * 0.45) * p;
  ringPoint.y /= 0.34;
  float orbit = abs(length(ringPoint) - (0.48 - thinking * 0.025));
  float orbitEdge = fwidth(orbit) * 1.6 + 0.001;
  float orbitLine = 1.0 - smoothstep(0.003, 0.003 + orbitEdge, orbit);
  float dash = smoothstep(-0.2, 0.55, sin(atan(ringPoint.y, ringPoint.x) * 12.0 - motion * 5.0));
  color += mix(u_primary, u_secondary, 0.4) * orbitLine * mix(0.24, 0.82, dash);

  float vignette = smoothstep(0.95, 0.18, length(p));
  color *= 0.68 + vignette * 0.32;

  float effects = step(0.5, u_effects);
  float grain = hash21(gl_FragCoord.xy + floor(baseTime * 24.0)) - 0.5;
  float scanline = 0.985 + 0.015 * sin(gl_FragCoord.y * 1.7);
  float failureTear = mix(1.0, 0.72 + 0.28 * step(0.44, hash21(vec2(floor(gl_FragCoord.y * 0.08), 17.0))), failed);
  color = mix(color, color * scanline * failureTear + grain * 0.018, effects);
  outColor = vec4(color, 1.0);
}
