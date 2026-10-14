import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {BufferGeometry, Color, InstancedMesh, Material, MeshBasicMaterial, Object3D} from 'three';
import {instanceRandoms} from './noise';
import {SHADOWS, hullGeometry, makeOutlineMaterial, makeToon} from './ToonMaterial';

/**
 * Per-instance placement. `r(k)` returns the k-th stable random [0,1) of this
 * instance. Write the transform into `o` and return false to hide it.
 * Must be a closed-form function of (i, frame): no accumulated simulation.
 */
export type Placer = (i: number, r: (k: number) => number, frame: number, o: Object3D) => boolean | void;

const dummy = new Object3D();

export const Particles: React.FC<{
	count: number;
	seed: string;
	frame: number;
	geometry: BufferGeometry;
	color: string;
	place: Placer;
	/** 'toon' (lit, shadowed), 'basic' (unlit, e.g. glows / rain). */
	shading?: 'toon' | 'basic';
	emissive?: string;
	emissiveIntensity?: number;
	opacity?: number;
	outline?: number;
	castShadow?: boolean;
	visible?: boolean;
	/** Optional per-instance colour (computed once, not per frame). */
	colorOf?: (i: number, r: (k: number) => number) => string;
}> = ({
	count,
	seed,
	frame,
	geometry,
	color,
	place,
	shading = 'toon',
	emissive,
	emissiveIntensity = 1,
	opacity = 1,
	outline = 0,
	castShadow = false,
	visible = true,
	colorOf,
}) => {
	const ref = useRef<InstancedMesh>(null);
	const hullRef = useRef<InstancedMesh>(null);
	const material = useMemo<Material>(
		() => (shading === 'toon' ? makeToon(color) : new MeshBasicMaterial({color, transparent: true, depthWrite: false})),
		[shading], // eslint-disable-line react-hooks/exhaustive-deps
	);
	(material as MeshBasicMaterial).color.set(color);
	if (shading === 'toon' && emissive) {
		const m = material as unknown as {emissive: Color; emissiveIntensity: number};
		m.emissive.set(emissive);
		m.emissiveIntensity = emissiveIntensity;
	}
	if (shading === 'basic') (material as MeshBasicMaterial).opacity = opacity;
	const outlineMat = useMemo(() => (outline > 0 ? makeOutlineMaterial(outline) : null), [outline]);
	const rands = instanceRandoms(seed, count, 8);

	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh || !colorOf) return;
		const c = new Color();
		for (let i = 0; i < count; i++) mesh.setColorAt(i, c.set(colorOf(i, (k) => rands[i * 8 + (k % 8)])));
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [count, seed]); // eslint-disable-line react-hooks/exhaustive-deps

	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh || !visible) return;
		for (let i = 0; i < count; i++) {
			dummy.position.set(0, 0, 0);
			dummy.rotation.set(0, 0, 0);
			dummy.scale.set(1, 1, 1);
			const shown = place(i, (k) => rands[i * 8 + (k % 8)], frame, dummy);
			if (shown === false) dummy.scale.set(0, 0, 0);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
			hullRef.current?.setMatrixAt(i, dummy.matrix);
		}
		mesh.instanceMatrix.needsUpdate = true;
		if (hullRef.current) hullRef.current.instanceMatrix.needsUpdate = true;
	});

	return (
		<group visible={visible}>
			<instancedMesh
				ref={ref}
				args={[geometry, material, count]}
				castShadow={SHADOWS && castShadow}
				receiveShadow={shading === 'toon'}
				frustumCulled={false}
			/>
			{outlineMat ? (
				<instancedMesh ref={hullRef} args={[hullGeometry(geometry), outlineMat, count]} frustumCulled={false} />
			) : null}
		</group>
	);
};
