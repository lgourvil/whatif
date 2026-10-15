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
