// Schwarzschild black hole renderer. One ray per pixel is integrated along a
// null geodesic (units: rs = 1, M = 0.5) from the camera until it falls through
// the horizon or escapes to the sky. Thin accretion disk crossings, the falling
// probe and a procedural sky are accumulated front to back. Output is linear HDR.

precision highp float;

#define MAX_STEPS 400
#define PI 3.14159265359
#define TAU 6.28318530718

varying vec2 vUv;

uniform vec2 uResolution;
uniform float uTime;          // distant-observer time, rs/c
uniform vec3 uCamPos;         // world frame, rs units
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamForward;
uniform float uTanHalfFov;
uniform mat3 uWorldToDisk;
uniform mat3 uDiskToWorld;

uniform float uLensing;
uniform float uSpin;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskTemp;
uniform float uDiskDensity;
uniform float uCamDilation;   // sqrt(1 - 1/r_cam)
uniform float uStretch;       // radial star stretch, >= 1

uniform int uMaxSteps;
uniform float uStepScale;
uniform int uOctaves;

uniform vec3 uBeaconDir;
uniform vec3 uGalaxyNormal;
uniform vec3 uGalaxyCenter;

uniform float uProbeOn;
uniform vec3 uProbePos;       // disk frame, rs units
uniform vec3 uProbeAxis;      // disk frame, outward radial
uniform vec2 uProbeSize;      // (radial semi-axis, transverse semi-axis)
uniform float uProbeG;        // frequency ratio observed/emitted
uniform float uProbeBlink;

// ---------------------------------------------------------------- noise

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x),
        mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x),
        mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y),
    u.z);
}

float fbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += amp * vnoise(p);
    norm += amp;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- colour

// Approximate blackbody colour (linear RGB, max component ~1) for temperature in K.
vec3 blackbody(float kelvin) {
  float t = clamp(kelvin, 600.0, 40000.0) / 100.0;
  float r = t <= 66.0 ? 1.0 : clamp(1.29293618606 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
  float g = t <= 66.0 ? clamp(0.39008157876 * log(t) - 0.63184144378, 0.0, 1.0)
                      : clamp(1.12989086089 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
  float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.54320678911 * log(t - 10.0) - 1.19625408914, 0.0, 1.0));
  return pow(vec3(r, g, b), vec3(2.2));
}

// ---------------------------------------------------------------- sky

// Angular radius of one pixel, used as the minimum star footprint.
float pixelAngle() {
  return 2.0 * uTanHalfFov / uResolution.y;
}

// Gaussian width of a star of angular radius `size`, never narrower than a pixel.
float starSigma(float size) {
  return max(size, pixelAngle() * 0.75);
}

// Round Gaussian star of angular radius `size` centred on direction c, seen along d.
// Widening to the pixel footprint keeps the integrated flux constant.
float starProfile(vec3 d, vec3 c, float size) {
  vec3 o = d - c;
  float sigma = starSigma(size);
  return exp(-dot(o, o) / (sigma * sigma)) * (size * size) / (sigma * sigma);
}

// One star per populated cell of a 3D grid over directions. The star centre is
// kept at least 4 sigma from every cell face so its profile is never clipped
// by the cell boundary; layers whose cells are too small for that are empty.
vec3 starLayer(vec3 d, float scale, float density, float size) {
  float margin = 4.0 * starSigma(size) * scale;
  if (margin > 0.45) return vec3(0.0);
  vec3 p = d * scale;
  vec3 cell = floor(p);
  vec3 h = hash33(cell);
  if (h.x > density) return vec3(0.0);
  vec3 sp = cell + margin + (1.0 - 2.0 * margin) * hash33(cell + 17.0);
  vec3 c = normalize(sp);
  vec3 local = c * scale - cell;
  if (any(lessThan(local, vec3(margin))) || any(greaterThan(local, vec3(1.0 - margin)))) return vec3(0.0);
  float b = pow(h.y, 12.0) * 3.0 + 0.05;
  vec3 col = blackbody(mix(2800.0, 14000.0, h.z * h.z));
  float twinkle = 0.85 + 0.15 * sin(uTime * 0.7 + h.y * 50.0);
  return col * b * twinkle * starProfile(d, c, size);
}

vec3 stars(vec3 d) {
  vec3 col = starLayer(d, 30.0, 0.45, 0.0016) * 1.5;
  col += starLayer(d, 60.0, 0.4, 0.0009);
  col += starLayer(d, 110.0, 0.35, 0.0006) * 0.6;
  // Bright "beacon" star used for Einstein-ring alignment.
  col += vec3(0.75, 0.85, 1.0) * 8.0 * starProfile(d, uBeaconDir, 0.0045);
  return col;
}

vec3 galaxy(vec3 d) {
  float lat = dot(d, uGalaxyNormal);
  float band = exp(-lat * lat / 0.018);
  float core = exp(-pow(distance(d, uGalaxyCenter), 2.0) * 3.5);
  float clumps = fbm(d * 6.0, 4);
  float fine = fbm(d * 22.0 + 4.0, 3);
  float dust = smoothstep(0.42, 0.72, fbm(d * 9.0 + 11.0, 4)) * exp(-lat * lat / 0.004);
  float glow = band * (0.35 + 0.9 * clumps * clumps + 0.4 * fine) + core * (0.8 + clumps);
  glow *= 1.0 - 0.85 * dust;
  vec3 col = mix(vec3(0.55, 0.62, 0.9), vec3(1.0, 0.78, 0.55), clamp(core * 1.4 + band * 0.25, 0.0, 1.0));
  // faint nebula tint off the plane
  float neb = pow(fbm(d * 3.0 + 40.0, 3), 3.0) * 0.18;
  return col * glow * 0.03 + vec3(0.25, 0.12, 0.35) * neb * 0.25;
}

vec3 sky(vec3 dWorld) {
  vec3 s;
  if (uStretch > 1.05) {
    // Deep in the well stars smear into streaks along the great circle through
    // the hole: average STREAK samples spread along that direction (flux-conserving).
    vec3 hole = -normalize(uCamPos);
    vec3 t = hole - dWorld * dot(hole, dWorld);
    float tl = length(t);
    t = tl > 1e-5 ? t / tl : vec3(0.0);
    float spread = (uStretch - 1.0) * 0.0035;
    s = vec3(0.0);
    for (int k = 0; k < 8; k++) {
      float o = (float(k) / 7.0 - 0.5) * spread;
      s += stars(normalize(dWorld + t * o));
    }
    s *= 1.0 / 8.0;
  } else {
    s = stars(dWorld);
  }
  // Soft highlight compression keeps point sources below ~4 so bloom stays round.
  s /= 1.0 + max(max(s.r, s.g), s.b) * 0.25;
  vec3 col = galaxy(dWorld) + s;
  // Blueshift and brightening of starlight for a camera hovering deep in the well.
  float boost = 1.0 / max(uCamDilation, 0.05);
  col *= mix(vec3(1.0), vec3(0.75, 0.95, 1.35), clamp((boost - 1.0) * 0.25, 0.0, 1.0)) * min(boost, 2.5);
  return col;
}

// ---------------------------------------------------------------- disk

// Returns rgb emission (premultiplied) and alpha of the disk at a crossing point.
vec4 diskSample(vec3 pc, vec3 rayDir) {
  float r = length(pc.xz);
  if (r < uDiskInner * 0.96 || r > uDiskOuter) return vec4(0.0);

  float x = r / uDiskInner;
  float profile = pow(x, -0.75) * pow(max(1.0 - inversesqrt(x), 0.0), 0.25) / 0.4882;
  float tempEmit = uDiskTemp * profile;

  // Keplerian shear: noise rotates at Ω(r) = sqrt(M / r^3); two phases cross-fade
  // so the pattern never shears into thin streaks.
  float omega = sqrt(0.5 / (r * r * r));
  float phi = atan(pc.z, pc.x);
  float period = 60.0;
  float ph1 = fract(uTime / period);
  float ph2 = fract(uTime / period + 0.5);
  float w1 = 1.0 - abs(2.0 * ph1 - 1.0);
  float a1 = phi - omega * ph1 * period;
  float a2 = phi - omega * ph2 * period;
  float lr = log(r) * 5.0;
  vec3 q1 = vec3(cos(a1) * 3.0, sin(a1) * 3.0, lr);
  vec3 q2 = vec3(cos(a2) * 3.0, sin(a2) * 3.0, lr);
  float n1 = fbm(vec3(q1.xy * 1.6, q1.z * 1.3) + vec3(0.0, 0.0, 7.0), uOctaves);
  float n2 = fbm(vec3(q2.xy * 1.6, q2.z * 1.3) + vec3(5.0, 3.0, 7.0), uOctaves);
  float turb = mix(n2, n1, w1);
  float rings = 0.65 + 0.35 * sin(lr * 6.0 + turb * 6.0);
  float density = smoothstep(0.2, 0.8, turb) * rings;

  float inner = smoothstep(uDiskInner * 0.96, uDiskInner * 1.12, r);
  float outer = 1.0 - smoothstep(uDiskOuter * 0.55, uDiskOuter, r);
  density *= inner * outer;

  // Relativistic Doppler beaming + gravitational redshift (+ camera blueshift).
  float beta = min(sqrt(0.5 / max(r - 1.0, 0.01)), 0.95);
  vec3 vel = normalize(vec3(-pc.z, 0.0, pc.x));
  float cosT = dot(vel, -rayDir);
  float gamma = inversesqrt(1.0 - beta * beta);
  float doppler = 1.0 / (gamma * (1.0 - beta * cosT));
  float g = doppler * sqrt(max(1.0 - 1.0 / r, 0.0)) / max(uCamDilation, 0.05);

  float tObs = tempEmit * g;
  // Specific intensity at fixed observed frequency transforms as g^3 (I_nu / nu^3 is invariant);
  // brightness is normalised to the emitted peak so the temperature slider changes colour, not exposure.
  // The intensity factor is capped at g = 2 so extreme camera blueshift tints rather than saturates.
  float intensity = pow(profile, 4.0) * pow(min(g, 2.0), 3.0);
  vec3 col = blackbody(tObs) * intensity * (0.6 + 1.8 * density) * 1.1;

  float alpha = clamp((0.55 + 0.8 * density) * uDiskDensity * inner * outer, 0.0, 0.97);
  return vec4(col * alpha, alpha);
}

// ---------------------------------------------------------------- probe

// Segment p0 -> p1 against the stretched probe ellipsoid. Returns hit fraction or -1.
float probeHit(vec3 p0, vec3 p1, out vec3 localHit) {
  vec3 ax = uProbeAxis;
  vec3 t1 = normalize(abs(ax.y) < 0.9 ? cross(ax, vec3(0, 1, 0)) : cross(ax, vec3(1, 0, 0)));
  vec3 t2 = cross(ax, t1);
  vec3 a = p0 - uProbePos;
  vec3 b = p1 - uProbePos;
  // Segment endpoints in the frame where the ellipsoid is the unit sphere.
  vec3 A = vec3(dot(a, ax) / uProbeSize.x, dot(a, t1) / uProbeSize.y, dot(a, t2) / uProbeSize.y);
  vec3 B = vec3(dot(b, ax) / uProbeSize.x, dot(b, t1) / uProbeSize.y, dot(b, t2) / uProbeSize.y);
  vec3 D = B - A;
  float qa = dot(D, D);
  float qb = 2.0 * dot(A, D);
  float qc = dot(A, A) - 1.0;
  float disc = qb * qb - 4.0 * qa * qc;
  if (disc < 0.0 || qa < 1e-12) return -1.0;
  float t = (-qb - sqrt(disc)) / (2.0 * qa);
  if (t < 0.0 || t > 1.0) return -1.0;
  localHit = A + D * t;
  return t;
}

vec3 probeColor(vec3 local) {
  // local.x: -1 (horizon-facing nose) .. +1 (tail); unit-sphere normal = local
  vec3 n = normalize(local);
  float lambert = 0.35 + 0.65 * max(dot(n, normalize(vec3(-0.6, 0.6, 0.5))), 0.0);
  vec3 hull = vec3(0.85, 0.9, 1.0) * lambert;
  float panel = step(0.5, fract((local.x + 1.0) * 3.0)) * 0.15;
  hull *= 1.0 - panel;
  float engine = smoothstep(0.55, 0.95, local.x);
  float nav = smoothstep(-0.7, -0.95, local.x) * uProbeBlink;
  vec3 emit = hull * 0.9 + vec3(0.4, 0.8, 1.6) * engine * 3.0 + vec3(1.0, 0.3, 0.2) * nav * 5.0;
  // Redshift: emitted spectrum is treated as a 6500 K blackbody shifted by g;
  // brightness is scaled by g^0.75 (exposure-compensated; bolometric flux would fall as g^4).
  float g = clamp(uProbeG, 0.0, 1.5);
  vec3 tint = blackbody(6500.0 * g) / blackbody(6500.0);
  return emit * tint * pow(g, 0.75) * 2.0;
}

// ---------------------------------------------------------------- main

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  float aspect = uResolution.x / uResolution.y;
  vec3 dirWorld = normalize(uCamForward + ndc.x * aspect * uTanHalfFov * uCamRight + ndc.y * uTanHalfFov * uCamUp);

  vec3 p = uWorldToDisk * uCamPos;
  vec3 v = uWorldToDisk * dirWorld;

  vec3 col = vec3(0.0);
  float alpha = 0.0;
  float rMin = 1e9;
  bool captured = false;
  vec3 spinAxis = vec3(0.0, 1.0, 0.0);
  // Beyond exitR nothing but the sky remains: no disk, no probe.
  float exitR = max(max(uDiskOuter, 4.0), uProbeOn > 0.5 ? length(uProbePos) + 1.0 : 0.0) * 1.05;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (i >= uMaxSteps) break;
    float r = length(p);
    rMin = min(rMin, r);
    if (r < 1.0) { captured = true; break; }
    if (alpha > 0.985) break;
    if (r > exitR && (dot(p, v) > 0.0 || length(cross(p, v)) > exitR)) break;

    float dt = uStepScale * clamp(0.09 * (r - 0.9) * (r - 0.9) / r + 0.012 * r, 0.01, 4.0);

    // Null geodesic in Schwarzschild: a = -3M h^2 r_hat / r^4 = -1.5 h^2 p / r^5.
    vec3 hv = cross(p, v);
    float h2 = dot(hv, hv);
    float r2 = r * r;
    vec3 acc = -1.5 * h2 * p / (r2 * r2 * r) * uLensing;
    // Frame-dragging approximation (gravitomagnetic term ~ J x v / r^3).
    acc += uSpin * 0.6 * cross(spinAxis, v) / (r2 * r) * uLensing;

    vec3 vHalf = v + acc * (dt * 0.5);
    vec3 pNew = p + vHalf * dt;
    float rn = length(pNew);
    vec3 hvn = cross(pNew, vHalf);
    float rn2 = rn * rn;
    vec3 accN = -1.5 * dot(hvn, hvn) * pNew / (rn2 * rn2 * rn) * uLensing
              + uSpin * 0.6 * cross(spinAxis, vHalf) / (rn2 * rn) * uLensing;
    vec3 vNew = normalize(vHalf + accN * (dt * 0.5));

    if (uProbeOn > 0.5) {
      vec3 lh;
      float th = probeHit(p, pNew, lh);
      if (th >= 0.0) {
        col += (1.0 - alpha) * probeColor(lh);
        alpha = 1.0;
        break;
      }
    }

    if (p.y * pNew.y < 0.0) {
      float t = p.y / (p.y - pNew.y);
      vec3 pc = mix(p, pNew, t);
      vec4 ds = diskSample(pc, normalize(mix(v, vNew, t)));
      col += (1.0 - alpha) * ds.rgb;
      alpha += (1.0 - alpha) * ds.a;
    }

    p = pNew;
    v = vNew;
  }

  if (!captured && alpha < 0.999) {
    // Remaining weak-field deflection from here to infinity along the
    // straight-line path: Δ = (2M / b) (1 - p·v / r), with M = 0.5.
    float r = length(p);
    vec3 perp = p - v * dot(p, v);
    float b = length(perp);
    if (b > 1e-4) {
      float defl = uLensing * (1.0 - dot(p, v) / r) / b;
      v = normalize(v - perp / b * defl);
    }
    vec3 skyCol = sky(uDiskToWorld * v);
    // Photon ring: rays that skimmed the photon sphere (r = 1.5) before escaping.
    float ring = exp(-max(rMin - 1.5, 0.0) * 28.0) * step(1.5, rMin);
    vec3 ringCol = blackbody(uDiskTemp * 1.1) * ring * 1.6 * (0.3 + uDiskDensity);
    col += (1.0 - alpha) * (skyCol + ringCol);
  }

  gl_FragColor = vec4(col, 1.0);
}
