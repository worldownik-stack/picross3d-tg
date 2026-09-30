import { Color, ShaderMaterial, Vector2, Vector3, Vector4, type Texture } from 'three';
import { COLS, GLYPH_CRACK, ROWS } from './glyphAtlas';

/** Флаги состояния инстанса (атрибут aState, §7). */
export const ST_HIDDEN = 1;
export const ST_MARKED = 2;
export const ST_CRACKED = 4;
export const ST_HOVER = 8;
export const ST_LINE = 16;
export const ST_DIM_X = 32;
export const ST_DIM_Y = 64;
export const ST_DIM_Z = 128;
export const ST_FLASH = 256;
export const ST_HINT = 512;

/** Направление основного света (мир). */
export const LIGHT_DIR = [0.62, 0.72, 0.32] as const;

export const CUBE_COLORS = {
  stone: '#f1e6d0',
  marked: '#3cb8a8',
  ink: '#4b3323',
  crack: '#d9392b',
  hover: '#ffffff',
  sky: '#fff9ee',
  ground: '#b99a78',
  light: '#fff3e0',
};

const vertexShader = /* glsl */ `
attribute vec3 aClue;
attribute float aState;
attribute vec3 aColor;
attribute float aReveal;

uniform float uRevealT;

varying vec3 vLocal;
varying vec3 vObj;
varying vec3 vN;
flat varying vec3 vClue;
flat varying float vState;
flat varying vec3 vColor;
flat varying float vRevealK;
flat varying float vSeed;

void main() {
  if (mod(aState, 2.0) >= 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vLocal = position;
  vN = normal;
  vClue = aClue;
  vState = aState;
  vColor = aColor;
  vRevealK = aReveal < 0.0 ? 0.0 : clamp((uRevealT - aReveal) / 0.35, 0.0, 1.0);
  vec4 obj = instanceMatrix * vec4(position, 1.0);
  vObj = obj.xyz;
  vec3 c = instanceMatrix[3].xyz;
  vSeed = fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * obj;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec2 uCells;
uniform vec4 uTopBasis;
uniform vec3 uLightDir;
uniform vec3 uUp;
uniform vec3 uLightColor;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uStone;
uniform vec3 uMarked;
uniform vec3 uCrack;
uniform float uCrackGlyph;
uniform float uBevel;
uniform float uTime;

varying vec3 vLocal;
varying vec3 vObj;
varying vec3 vN;
flat varying vec3 vClue;
flat varying float vState;
flat varying vec3 vColor;
flat varying float vRevealK;
flat varying float vSeed;

float bit(float v, float b) { return mod(floor(v / b), 2.0); }

vec4 glyph(float g, vec2 uv, vec2 gdx, vec2 gdy) {
  vec2 cell = vec2(mod(g, uCells.x), floor(g / uCells.x));
  vec2 guv = (cell + vec2(uv.x, 1.0 - uv.y)) / uCells;
  vec2 s = vec2(1.0, -1.0) / uCells;
  return textureGrad(uAtlas, guv, gdx * s, gdy * s);
}

void main() {
  vec3 an = abs(vN);
  float axis;
  vec3 uDir;
  vec3 vDir;
  if (an.x > 0.5) {
    axis = 0.0;
    uDir = vec3(0.0, 0.0, -sign(vN.x));
    vDir = vec3(0.0, 1.0, 0.0);
  } else if (an.y > 0.5) {
    axis = 1.0;
    vec2 up = vN.y > 0.0 ? uTopBasis.zw : -uTopBasis.zw;
    uDir = vec3(uTopBasis.x, 0.0, uTopBasis.y);
    vDir = vec3(up.x, 0.0, up.y);
  } else {
    axis = 2.0;
    uDir = vec3(sign(vN.z), 0.0, 0.0);
    vDir = vec3(0.0, 1.0, 0.0);
  }
  vec2 uv = vec2(dot(vLocal, uDir), dot(vLocal, vDir)) + 0.5;
  vec3 dx = dFdx(vObj);
  vec3 dy = dFdy(vObj);
  vec2 gdx = vec2(dot(dx, uDir), dot(dx, vDir));
  vec2 gdy = vec2(dot(dy, uDir), dot(dy, vDir));

  // Фаска: нормаль скруглённого куба вблизи рёбер.
  vec3 q = vLocal - clamp(vLocal, vec3(-0.5 + uBevel), vec3(0.5 - uBevel));
  vec3 n = normalize(q + vN * 1e-4);

  // Флаги и индексы глифов — целые; flat-varying + округление защищают от ошибок
  // интерполяции (иначе 6.0 может прийти как 5.9999995 и бит «мигает» по пикселям).
  float st = floor(vState + 0.5);
  float marked = bit(st, 2.0);
  float cracked = bit(st, 4.0);
  float hover = bit(st, 8.0);
  float lineHi = bit(st, 16.0);
  float flash = bit(st, 256.0);
  float hint = bit(st, 512.0);
  float dim = axis < 0.5 ? bit(st, 32.0) : axis < 1.5 ? bit(st, 64.0) : bit(st, 128.0);

  vec3 stone = uStone * (0.975 + 0.05 * vSeed);
  vec3 base = mix(stone, uMarked, marked);
  base = mix(base, vColor, vRevealK);

  float hemi = dot(n, uUp) * 0.5 + 0.5;
  float diff = max(dot(n, uLightDir), 0.0);
  vec3 light = mix(uGround, uSky, hemi) + uLightColor * diff;
  vec3 col = base * light;

  // Затемнение к рёбрам грани («шов» между кубами).
  float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float seam = smoothstep(0.0, 0.05, e);
  col *= mix(0.8, 1.0, seam);

  // Глиф подсказки.
  float g = floor((axis < 0.5 ? vClue.x : axis < 1.5 ? vClue.y : vClue.z) + 0.5);
  if (g > 0.5) {
    vec4 gl = glyph(g, uv, gdx, gdy);
    float a = gl.a * (1.0 - vRevealK) * (1.0 - 0.62 * dim);
    vec3 ink = gl.rgb * mix(0.85, 1.05, diff);
    col = mix(col, ink, a);
  }

  if (cracked > 0.5) {
    vec4 cr = glyph(uCrackGlyph, uv, gdx, gdy);
    col = mix(col, uCrack * mix(0.8, 1.1, diff), cr.a * (1.0 - vRevealK));
  }

  // Ховер и подсветка линий.
  col = mix(col, col * 1.08 + vec3(0.05, 0.045, 0.03), lineHi * 0.9);
  float rim = 1.0 - smoothstep(0.02, 0.1, e);
  col = mix(col, col * 1.12 + 0.06, hover);
  col = mix(col, vec3(1.0), hover * rim * 0.85);
  float pulse = 0.5 + 0.5 * sin(uTime * 7.0);
  col = mix(col, vec3(1.0, 0.93, 0.55), hint * (0.25 + 0.3 * pulse));
  col = mix(col, vec3(1.0, 0.95, 0.85), flash * 0.45);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createCubeMaterial(atlas: Texture): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uAtlas: { value: atlas },
      uCells: { value: new Vector2(COLS, ROWS) },
      uTopBasis: { value: new Vector4(1, 0, 0, -1) },
      uLightDir: { value: new Vector3(0.62, 0.72, 0.32).normalize() },
      uUp: { value: new Vector3(0, 1, 0) },
      uLightColor: { value: new Color(CUBE_COLORS.light).multiplyScalar(0.38) },
      uSky: { value: new Color(CUBE_COLORS.sky).multiplyScalar(0.8) },
      uGround: { value: new Color(CUBE_COLORS.ground).multiplyScalar(0.72) },
      uStone: { value: new Color(CUBE_COLORS.stone) },
      uMarked: { value: new Color(CUBE_COLORS.marked) },
      uCrack: { value: new Color(CUBE_COLORS.crack) },
      uCrackGlyph: { value: GLYPH_CRACK },
      uBevel: { value: 0.07 },
      uRevealT: { value: -1 },
      uTime: { value: 0 },
    },
  });
}
