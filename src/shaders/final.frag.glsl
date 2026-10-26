// Final pass: ACES tone mapping, vignette, chromatic fringe, film grain,
// optional cinematic letterbox, sRGB encode.

precision highp float;

varying vec2 vUv;

uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uGrain;
uniform float uLetterbox; // 0..1 animated bar amount

vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);

  // Slight radial chromatic fringe towards the frame edge.
  vec2 off = c * r2 * 0.012;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + off).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - off).b;

  col = acesFilm(col * uExposure);

  float vignette = smoothstep(0.95, 0.25, r2 * 1.6);
  col *= mix(0.55, 1.0, vignette);

  col = pow(col, vec3(1.0 / 2.2));

  // Luminance-weighted animated grain (stronger in mid-tones).
  vec2 px = uv * uResolution;
  float n = hash12(px + fract(uTime * 13.37) * 1000.0) + hash12(px * 1.37 + fract(uTime * 7.1) * 500.0) - 1.0;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col += n * uGrain * (0.35 + 0.65 * (1.0 - abs(lum * 2.0 - 1.0)));

  float bar = uLetterbox * 0.12;
  if (uv.y < bar || uv.y > 1.0 - bar) col = vec3(0.0);

  gl_FragColor = vec4(col, 1.0);
}
