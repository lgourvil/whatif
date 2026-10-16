import * as THREE from 'three';

let grad: THREE.DataTexture | null = null;

/** 4-step toon gradient (nearest filtered => hard bands). */
export const gradientMap = (): THREE.DataTexture => {
  if (!grad) {
    const data = new Uint8Array([60, 125, 195, 255]);
    grad = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    grad.minFilter = THREE.NearestFilter;
    grad.magFilter = THREE.NearestFilter;
    grad.generateMipmaps = false;
    grad.needsUpdate = true;
  }
  return grad;
};

export const toonProps = (color: THREE.ColorRepresentation) => ({
  color,
  gradientMap: gradientMap(),
  flatShading: true,
});

let hull: THREE.MeshBasicMaterial | null = null;
/** Black back-face material for the inverted-hull outline. */
export const outlineMaterial = () =>
  (hull ??= new THREE.MeshBasicMaterial({color: '#000000', side: THREE.BackSide}));

const shells = new Map<string, THREE.MeshBasicMaterial>();
/**
 * Constant-width inverted hull: pushes vertices along their (smooth) normals by `width` metres in object space.
 * Use on smooth-normal geometry (capsules, spheres, lathes); keeps the outline the same thickness on small and big parts,
 * unlike the scale-based hull which bloats long thin parts at their tips.
 */
export const shellMaterial = (width: number, color: THREE.ColorRepresentation = '#000000') => {
  const key = `${width}-${new THREE.Color(color).getHexString()}`;
  let m = shells.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({color, side: THREE.BackSide});
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normalize(normal) * ${width.toFixed(5)};`);
    };
    m.customProgramCacheKey = () => `shell-${key}`;
    shells.set(key, m);
  }
  return m;
};

/**
 * Outline for transparent parts (glass, clear plastic): the hull is stencil-masked by the part's own silhouette so
 * the black back faces never show THROUGH the glass, only around it. Needs `gl={{stencil: true}}` on the canvas.
 * Returns [maskMaterial, hullMaterial]; render mask (renderOrder n) then hull (renderOrder n+1).
 */
let glassPair: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial] | null = null;
export const glassOutline = () => {
  if (!glassPair) {
    const mask = new THREE.MeshBasicMaterial({colorWrite: false, depthWrite: false});
    mask.stencilWrite = true; mask.stencilRef = 1; mask.stencilFunc = THREE.AlwaysStencilFunc;
    mask.stencilZPass = THREE.ReplaceStencilOp;
    const hull = new THREE.MeshBasicMaterial({color: '#000000', side: THREE.BackSide});
    hull.stencilWrite = true; hull.stencilRef = 1; hull.stencilFunc = THREE.NotEqualStencilFunc;
    hull.stencilZPass = THREE.KeepStencilOp;
    glassPair = [mask, hull];
  }
  return glassPair;
};
