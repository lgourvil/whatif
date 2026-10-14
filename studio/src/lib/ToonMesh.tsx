import React, {useMemo} from 'react';
import {BufferGeometry, Color, MeshToonMaterial} from 'three';
import {SHADOWS, hullGeometry, makeOutlineMaterial, makeToon} from './ToonMaterial';

type Vec3 = [number, number, number];

/**
 * A toon-shaded mesh with its inverted-hull outline.
 * Colour can change every frame (palette drift) without recreating materials.
 */
export const ToonMesh: React.FC<{
	geometry: BufferGeometry;
	color: string;
	position?: Vec3;
	rotation?: Vec3;
	scale?: number | Vec3;
	outline?: number; // thickness in local units, 0 = none
	emissive?: string;
	emissiveIntensity?: number;
	castShadow?: boolean;
	receiveShadow?: boolean;
	visible?: boolean;
	children?: React.ReactNode;
}> = ({
	geometry,
	color,
	position,
	rotation,
	scale,
	outline = 0.025,
	emissive,
	emissiveIntensity,
	castShadow = true,
	receiveShadow = true,
	visible = true,
	children,
}) => {
	const mat = useMemo<MeshToonMaterial>(() => makeToon(color), []); // eslint-disable-line react-hooks/exhaustive-deps
	const outlineMat = useMemo(() => makeOutlineMaterial(outline), [outline]);
	mat.color.set(color);
	mat.emissive = new Color(emissive ?? '#000000');
	mat.emissiveIntensity = emissiveIntensity ?? 1;
	const hull = outline > 0 ? hullGeometry(geometry) : null;
	return (
		<group position={position} rotation={rotation} scale={scale} visible={visible}>
			<mesh
				geometry={geometry}
				material={mat}
				castShadow={SHADOWS && castShadow}
				receiveShadow={SHADOWS && receiveShadow}
			/>
			{hull ? <mesh geometry={hull} material={outlineMat} /> : null}
			{children}
		</group>
	);
};
