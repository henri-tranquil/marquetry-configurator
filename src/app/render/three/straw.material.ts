import { DoubleSide, ShaderMaterial, Texture, Vector3 } from 'three';

/**
 * Paille fendue = métal brossé : modèle anisotrope de Kajiya-Kay.
 * Spéculaire = sin(T, H)^p, diffus pondéré par sin(T, L) : la paille brille quand
 * la lumière arrive EN TRAVERS des brins. Ne pas inverser.
 *
 * Gestion des couleurs : l'albedo est une texture sRGB, décodée en linéaire par le GPU ;
 * le calcul se fait en linéaire et <colorspace_fragment> convertit vers l'outputColorSpace
 * du renderer. La correction gamma manuelle du prototype (r128) est donc retirée.
 */
const vertexShader = /* glsl */ `
attribute vec2 aU;
attribute float aT;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
varying vec2 vU;
varying float vT;
void main() {
  vUv = uv;
  vU = aU;
  vT = aT;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D uAlb;
uniform sampler2D uDir;
uniform vec3 uL;
uniform vec3 uCam;
uniform float uGloss;
uniform float uSpec;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
varying vec2 vU;
varying float vT;
void main() {
  vec4 a = texture2D(uAlb, vUv);
  if (a.a < 0.5) discard;
  vec4 d = texture2D(uDir, vUv);
  vec2 t = d.rg * 2.0 - 1.0;
  vec3 N = normalize(vN);
  // tangente du fil (la texture est en repère panneau, y vers le bas)
  vec3 T0 = normalize(vec3(t.x, -t.y, 0.0) + 1e-4);
  // sur un profil, la tangente se courbe : T = (T0.e)e + (T0.u)(u cos t - z sin t)
  vec3 U = normalize(vec3(vU, 0.0) + 1e-5);
  vec3 E = vec3(-U.y, U.x, 0.0);
  vec3 T = normalize(dot(T0, E) * E + dot(T0, U) * (U * cos(vT) - vec3(0.0, 0.0, 1.0) * sin(vT)) + 1e-4);
  vec3 L = normalize(uL);
  vec3 V = normalize(uCam - vP);
  vec3 Hv = normalize(L + V);
  // léger décalage par brin (canal B) pour que les brins ne brillent pas en bloc
  vec3 Ts = normalize(T + (d.b - 0.5) * 0.3 * N);
  float nl = max(dot(N, L), 0.0);
  float tl = dot(T, L);
  float diff = nl * (0.6 + 0.4 * sqrt(max(1.0 - tl * tl, 0.0)));
  float th = dot(Ts, Hv);
  float spec = pow(sqrt(max(1.0 - th * th, 0.0)), uGloss) * smoothstep(0.0, 0.15, nl);
  vec3 alb = a.rgb;
  vec3 col = alb * (0.22 + 1.05 * diff) + spec * uSpec * mix(vec3(1.0), alb * 1.5 + 0.15, 0.6);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export interface StrawUniforms extends Record<string, { value: unknown }> {
  uAlb: { value: Texture | null };
  uDir: { value: Texture | null };
  uL: { value: Vector3 };
  uCam: { value: Vector3 };
  uGloss: { value: number };
  uSpec: { value: number };
}

export function createStrawMaterial(): ShaderMaterial & { uniforms: StrawUniforms } {
  const uniforms: StrawUniforms = {
    uAlb: { value: null },
    uDir: { value: null },
    uL: { value: new Vector3(0, 0, 1) },
    uCam: { value: new Vector3() },
    uGloss: { value: 60 },
    uSpec: { value: 0.8 },
  };
  const m = new ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: DoubleSide });
  return m as ShaderMaterial & { uniforms: StrawUniforms };
}

/** Exposant et force du spéculaire, comme le prototype. */
export function glossUniforms(gloss: number, contrast: number): { gloss: number; spec: number } {
  return { gloss: 6 + 90 * gloss ** 1.5, spec: (0.15 + 0.6 * contrast) * (0.45 + 0.55 * gloss) };
}
