import * as THREE from 'three';

let _grad: THREE.DataTexture | null = null;
/** 4-step gradient map shared by every toon material. */
export const gradientMap = (steps = 4) => {
  if (_grad && steps === 4) return _grad;
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) data[i] = Math.round(70 + (185 * i) / (steps - 1));
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  if (steps === 4) _grad = tex;
  return tex;
};

export const makeToon = (color: THREE.ColorRepresentation, opts: THREE.MeshToonMaterialParameters = {}) =>
  new THREE.MeshToonMaterial({color, gradientMap: gradientMap(), ...opts});

export const outlineMaterial = new THREE.MeshBasicMaterial({color: '#07070d', side: THREE.BackSide, fog: false});
