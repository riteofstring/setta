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

float starField(vec2 p) {
  vec2 cell = floor(p * 190.0);
  vec2 local = fract(p * 190.0) - 0.5;
  float seed = hash21(cell);
  float star = step(0.988, seed) * exp(-dot(local, local) * 70.0);
  float bright = step(0.997, hash21(cell + 23.0)) * exp(-dot(local, local) * 20.0);
  return star * 0.44 + bright;
}

void main() {
  vec2 p = v_uv - 0.5;
  p.x *= u_resolution.x / max(u_resolution.y, 1.0);

  float listening = 1.0 - step(0.5, abs(u_state - 1.0));
  float thinking = 1.0 - step(0.5, abs(u_state - 2.0));
  float responding = 1.0 - step(0.5, abs(u_state - 3.0));
  float complete = 1.0 - step(0.5, abs(u_state - 4.0));
  float failed = 1.0 - step(0.5, abs(u_state - 5.0));
  float phaseGate = step(0.5, u_state) * (1.0 - step(4.5, u_state));
  float baseTime = u_time * phaseGate;
  float listeningTime = u_listening_time * phaseGate;
  float thinkingTime = u_thinking_time * phaseGate;
  float respondingTime = u_responding_time * phaseGate;
  float motion =
    baseTime * 0.025 +
    listeningTime * 0.035 +
    thinkingTime * 0.16 +
    respondingTime * 0.08;

  float radius = length(p);
  float gravity = 0.016 / max(radius * radius, 0.012);
  vec2 lensedUv = p * (1.0 + gravity * (0.34 + thinking * 0.18));
  lensedUv = rotate2d(motion * 0.08) * lensedUv;
  vec3 voidColor = u_background * 0.045;
  vec3 color = voidColor;
  color += mix(u_primary, u_secondary, hash21(floor(lensedUv * 74.0))) * starField(lensedUv + 0.5) * 0.42;

  vec3 rayOrigin = vec3(0.0, 0.0, 2.75);
  vec3 rayDirection = normalize(vec3(p * 1.18, -1.9));
  rayOrigin.yz = rotate2d(-0.34) * rayOrigin.yz;
  rayDirection.yz = rotate2d(-0.34) * rayDirection.yz;

  float farHit = -1.0;
  float nearHit = sphereIntersection(rayOrigin, rayDirection, 0.43 + listening * 0.012, farHit);
  float diskDenominator = abs(rayDirection.y) < 0.00001
    ? (rayDirection.y < 0.0 ? -0.00001 : 0.00001)
    : rayDirection.y;
  float diskHit = -rayOrigin.y / diskDenominator;
  vec3 diskPoint = rayOrigin + rayDirection * diskHit;
  float diskRadius = length(diskPoint.xz);
  float diskWidth = 0.16 - thinking * 0.035;
  float disk = 1.0 - smoothstep(diskWidth, diskWidth + 0.045, abs(diskRadius - 0.57));
  disk *= smoothstep(0.42, 0.48, diskRadius) * (1.0 - smoothstep(0.72, 0.82, diskRadius));
  disk *= step(0.0, diskHit);
  if (nearHit > 0.0 && nearHit < diskHit) {
    disk = 0.0;
  }

  float diskAngle = atan(diskPoint.z, diskPoint.x);
  float diskSignal = 0.5 + 0.5 * sin(diskAngle * 7.0 - motion * 11.0 + diskRadius * 34.0);
  float failureBreak = mix(1.0, step(0.48, fract(diskAngle * 1.8 + baseTime * 2.2)), failed);
  vec3 diskColor = mix(u_tertiary, u_primary, diskSignal);
  color += diskColor * disk * failureBreak * (0.38 + responding * 0.22);

  float photonRadius = 0.197 + thinking * 0.008;
  float photonRing = exp(-abs(radius - photonRadius) * (150.0 + 35.0 * u_quality));
  float outerHalo = exp(-abs(radius - 0.225) * 36.0) * 0.18;
  color += mix(u_primary, u_tertiary, 0.38) * photonRing * (0.72 + responding * 0.35);
  color += u_secondary * outerHalo * (0.42 + listening * 0.22);

  if (nearHit > 0.0) {
    vec3 position = rayOrigin + rayDirection * nearHit;
    vec3 normal = normalize(position);
    float rim = pow(1.0 - max(dot(normal, -rayDirection), 0.0), 3.4);
    float eclipse = smoothstep(-0.28, 0.52, normal.x * 0.8 + normal.y * 0.35);
    vec3 sphereColor = u_background * 0.012;
    sphereColor += mix(u_secondary, u_primary, eclipse) * rim * (0.24 + thinking * 0.16);
    sphereColor += u_tertiary * rim * rim * 0.18;
    color = sphereColor;
  }

  float focusPulse = complete * u_progress + responding * 0.35;
  color += u_primary * exp(-radius * radius * 125.0) * focusPulse * 0.12;
  float vignette = smoothstep(1.0, 0.16, radius);
  color *= 0.64 + vignette * 0.36;

  float effects = step(0.5, u_effects);
  float grain = hash21(gl_FragCoord.xy + floor(baseTime * 20.0)) - 0.5;
  float scanline = 0.987 + 0.013 * sin(gl_FragCoord.y * 1.8);
  float failureTear = mix(1.0, 0.66 + 0.34 * step(0.52, hash21(vec2(floor(gl_FragCoord.y * 0.07), 29.0))), failed);
  color = mix(color, color * scanline * failureTear + grain * 0.016, effects);
  outColor = vec4(color, 1.0);
}
