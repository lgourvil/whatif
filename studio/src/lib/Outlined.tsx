import React from 'react';
import * as THREE from 'three';
import {outlineMaterial, toon} from './ToonMaterial';

type Props = {
	geometry: THREE.BufferGeometry;
	scale?: number | [number, number, number];
	color: THREE.ColorRepresentation;
	outline?: number;
	emissive?: THREE.ColorRepresentation;
	cast?: boolean;
} & Omit<React.ComponentProps<'group'>, 'children'>;

const matCache = new Map<string, THREE.MeshToonMaterial>();
const mat = (color: THREE.ColorRepresentation, emissive?: THREE.ColorRepresentation) => {
	const key = `${new THREE.Color(color).getHexString()}-${emissive ? new THREE.Color(emissive).getHexString() : ''}`;
	let m = matCache.get(key);
	if (!m) {
		m = toon(color, {flatShading: true, emissive: emissive ?? '#000000'});
		matCache.set(key, m);
	}
	return m;
};

const size = (g: THREE.BufferGeometry) => {
	if (!g.boundingBox) g.computeBoundingBox();
	const s = new THREE.Vector3();
	g.boundingBox!.getSize(s);
	return s;
};

/**
 * Toon mesh + inverted-hull outline (duplicate, BackSide, black). `outline` is a fraction of the
 * thinnest scaled dimension, applied as a constant world thickness on every axis, so long thin
 * parts (ladder rails, pilings) keep a clean line instead of ballooning.
 */
export const Outlined: React.FC<Props> = ({geometry, color, outline = 0.25, emissive, cast = true, scale = 1, ...rest}) => {
	const sc: [number, number, number] = typeof scale === 'number' ? [scale, scale, scale] : scale;
	const sz = size(geometry);
	const dims = [sz.x * sc[0], sz.y * sc[1], sz.z * sc[2]];
	const t = outline * Math.min(...dims);
	const oscale: [number, number, number] = [sc[0] + t / sz.x, sc[1] + t / sz.y, sc[2] + t / sz.z];
	return (
		<group {...rest}>
			<mesh geometry={geometry} material={mat(color, emissive)} castShadow={cast} receiveShadow scale={sc} />
			{outline > 0 ? <mesh geometry={geometry} material={outlineMaterial} scale={oscale} /> : null}
		</group>
	);
};
