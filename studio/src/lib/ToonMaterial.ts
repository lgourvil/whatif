import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** 4-step gradient map -> hard toon bands. */
export const toonGradient = (steps = 4) => {
	if (gradient) return gradient;
	const data = new Uint8Array(steps * 4);
	for (let i = 0; i < steps; i++) {
		const v = Math.round(60 + (195 * i) / (steps - 1));
		data.set([v, v, v, 255], i * 4);
	}
	const t = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
	t.minFilter = THREE.NearestFilter;
	t.magFilter = THREE.NearestFilter;
	t.generateMipmaps = false;
	t.needsUpdate = true;
	gradient = t;
	return t;
};

type ToonOpts = Partial<THREE.MeshToonMaterialParameters> & {flatShading?: boolean};

/** MeshToonMaterial with a 4-step gradientMap; flatShading is honoured by the program cache even though the typings omit it. */
export const toon = (color: THREE.ColorRepresentation, opts: ToonOpts = {}) => {
	const {flatShading, ...rest} = opts;
	const m = new THREE.MeshToonMaterial({color, gradientMap: toonGradient(), ...rest});
	if (flatShading) (m as THREE.MeshToonMaterial & {flatShading: boolean}).flatShading = true;
	return m;
};

export const outlineMaterial = new THREE.MeshBasicMaterial({color: '#05060d', side: THREE.BackSide, fog: true});
