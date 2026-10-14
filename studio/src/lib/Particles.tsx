import React, {useLayoutEffect, useRef} from 'react';
import * as THREE from 'three';

export type PlaceFn = (i: number, o: THREE.Object3D, color: THREE.Color) => void;

type Props = {
	count: number;
	geometry: THREE.BufferGeometry;
	material: THREE.Material;
	/** Closed-form placement: derive everything from (i, frame) — never accumulate state. */
	place: PlaceFn;
	frame: number;
	colored?: boolean;
	outlineMaterial?: THREE.Material;
	outlineScale?: number;
	/** constant world thickness added to every scale axis of the outline hull (use for stretched instances) */
	outlineAdd?: number;
	shadows?: boolean;
};

const dummy = new THREE.Object3D();
const col = new THREE.Color();

/** Generic deterministic InstancedMesh (rain, snow, embers, dust, droplets, rocks...). */
export const Particles: React.FC<Props> = ({count, geometry, material, place, frame, colored, outlineMaterial, outlineScale = 1.06, outlineAdd, shadows}) => {
	const ref = useRef<THREE.InstancedMesh>(null);
	const ref2 = useRef<THREE.InstancedMesh>(null);

	useLayoutEffect(() => {
		const m = ref.current;
		if (!m) return;
		for (let i = 0; i < count; i++) {
			dummy.position.set(0, 0, 0);
			dummy.rotation.set(0, 0, 0);
			dummy.scale.set(1, 1, 1);
			col.set('#ffffff');
			place(i, dummy, col);
			dummy.updateMatrix();
			m.setMatrixAt(i, dummy.matrix);
			if (colored) m.setColorAt(i, col);
			if (ref2.current) {
				if (outlineAdd !== undefined) dummy.scale.addScalar(outlineAdd);
				else dummy.scale.multiplyScalar(outlineScale);
				dummy.updateMatrix();
				ref2.current.setMatrixAt(i, dummy.matrix);
			}
		}
		m.instanceMatrix.needsUpdate = true;
		if (colored && m.instanceColor) m.instanceColor.needsUpdate = true;
		if (ref2.current) ref2.current.instanceMatrix.needsUpdate = true;
		m.computeBoundingSphere();
	});

	return (
		<>
			<instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} castShadow={shadows} receiveShadow={shadows} />
			{outlineMaterial ? <instancedMesh ref={ref2} args={[geometry, outlineMaterial, count]} frustumCulled={false} /> : null}
		</>
	);
};
