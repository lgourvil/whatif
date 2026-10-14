import {useThree} from '@react-three/fiber';
import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {
	BackSide,
	Quaternion,
	Color,
	FogExp2,
	IcosahedronGeometry,
	InstancedMesh,
	MeshBasicMaterial,
	Object3D,
	OctahedronGeometry,
	ShaderMaterial,
	SphereGeometry,
	Vector3,
} from 'three';
import {instanceRandoms} from './noise';

/** Sun direction for a time of day (0 = midnight, .25 sunrise, .5 noon, .75 sunset). */
export const sunDirection = (dayTime: number, tilt = 0.35): Vector3 => {
	const a = (dayTime - 0.25) * Math.PI * 2;
	return new Vector3(Math.cos(a) * 0.9, Math.sin(a), -0.45 - tilt * Math.sin(a) * 0.3).normalize();
};

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = normalize(position);
	vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	gl_Position = p.xyww; // always at the far plane
}`;
const frag = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 ground;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float sunGlow;
varying vec3 vDir;
void main() {
	float h = vDir.y;
	// soft banding keeps the toon look while staying smooth near the horizon
	float t = pow(clamp(h, 0.0, 1.0), 0.55);
	vec3 col = mix(horizon, zenith, t);
	col = mix(col, ground, smoothstep(0.0, -0.12, h));
	float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
	col += sunColor * (pow(d, 9.0) * 0.45 + pow(d, 90.0) * 0.6) * sunGlow;
	gl_FragColor = vec4(col, 1.0);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`;

export const Sky: React.FC<{
	center: Vector3;
	zenith: string;
	horizon: string;
	ground: string;
	sunDir: Vector3;
	sunColor: string;
	sunVisible: number; // 0..1
	moonDir: Vector3;
	moonScale?: number;
	moonColor?: string;
	moonVisible: number;
	stars: number; // 0..1
	radius?: number;
}> = ({
	center,
	zenith,
	horizon,
	ground,
	sunDir,
	sunColor,
	sunVisible,
	moonDir,
	moonScale = 1,
	moonColor = '#f4f1ff',
	moonVisible,
	stars,
	radius = 1800,
}) => {
	const dome = useMemo(
		() =>
			new ShaderMaterial({
				uniforms: {
					zenith: {value: new Color()},
					horizon: {value: new Color()},
					ground: {value: new Color()},
					sunColor: {value: new Color()},
					sunDir: {value: new Vector3()},
					sunGlow: {value: 1},
				},
				vertexShader: vert,
				fragmentShader: frag,
				side: BackSide,
				depthWrite: false,
				fog: false,
			}),
		[],
	);
	dome.uniforms.zenith.value.set(zenith);
	dome.uniforms.horizon.value.set(horizon);
	dome.uniforms.ground.value.set(ground);
	dome.uniforms.sunColor.value.set(sunColor);
	dome.uniforms.sunDir.value.copy(sunDir);
	dome.uniforms.sunGlow.value = sunVisible;

	const domeGeo = useMemo(() => new SphereGeometry(radius, 48, 24), [radius]);
	const discGeo = useMemo(() => new IcosahedronGeometry(1, 2), []);
	const sunMat = useMemo(() => new MeshBasicMaterial({fog: false, transparent: true}), []);
	sunMat.color.set(sunColor).multiplyScalar(1.6);
	sunMat.opacity = sunVisible;
	const moonMat = useMemo(() => new MeshBasicMaterial({fog: false, transparent: true}), []);
	moonMat.color.set(moonColor);
	moonMat.opacity = moonVisible;
	const craterMat = useMemo(() => new MeshBasicMaterial({fog: false, transparent: true}), []);
	craterMat.color.set(moonColor).multiplyScalar(0.78);
	craterMat.opacity = moonVisible;

	// Stars: one InstancedMesh, fixed positions on the upper hemisphere.
	const STAR_COUNT = 900;
	const starRef = useRef<InstancedMesh>(null);
	const starGeo = useMemo(() => new OctahedronGeometry(1, 0), []);
	const starMat = useMemo(() => new MeshBasicMaterial({color: '#ffffff', fog: false, transparent: true, depthWrite: false}), []);
	starMat.opacity = stars;
	useLayoutEffect(() => {
		const mesh = starRef.current;
		if (!mesh) return;
		const r = instanceRandoms('stars', STAR_COUNT, 3);
		const d = new Object3D();
		for (let i = 0; i < STAR_COUNT; i++) {
			const az = r[i * 3] * Math.PI * 2;
			const el = Math.asin(0.05 + r[i * 3 + 1] * 0.95);
			const R = radius * 0.9;
			d.position.set(Math.cos(az) * Math.cos(el) * R, Math.sin(el) * R, Math.sin(az) * Math.cos(el) * R);
			d.scale.setScalar(1.2 + r[i * 3 + 2] * r[i * 3 + 2] * 3.5);
			d.rotation.set(az, el, 0);
			d.updateMatrix();
			mesh.setMatrixAt(i, d.matrix);
		}
		mesh.instanceMatrix.needsUpdate = true;
	}, [radius]);

	const sunPos = sunDir.clone().multiplyScalar(radius * 0.8);
	const moonPos = moonDir.clone().multiplyScalar(radius * 0.7);
	// craters sit on local +Z: turn that face towards the viewer
	const moonQuat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), moonDir.clone().normalize().negate());
	return (
		<group position={center}>
			<mesh geometry={domeGeo} material={dome} renderOrder={-10} frustumCulled={false} />
			<instancedMesh
				ref={starRef}
				args={[starGeo, starMat, STAR_COUNT]}
				visible={stars > 0.01}
				frustumCulled={false}
				renderOrder={-9}
			/>
			<mesh geometry={discGeo} material={sunMat} position={sunPos} scale={38} visible={sunVisible > 0.01} renderOrder={-8} />
			<group position={moonPos} quaternion={moonQuat} scale={36 * moonScale} visible={moonVisible > 0.01}>
				<mesh geometry={discGeo} material={moonMat} renderOrder={-8} />
				{[
					[0.35, 0.3, 0.88, 0.22],
					[-0.4, -0.15, 0.9, 0.17],
					[0.05, -0.45, 0.89, 0.13],
					[-0.15, 0.45, 0.88, 0.1],
				].map(([x, y, z, s], i) => (
					<mesh key={i} geometry={discGeo} material={craterMat} position={[x, y, z]} scale={[s, s, 0.05]} renderOrder={-7} />
				))}
			</group>
		</group>
	);
};

/** Exponential fog whose colour/density are re-applied every frame (palette drift). */
export const Fog: React.FC<{color: string; density: number}> = ({color, density}) => {
	const scene = useThree((s) => s.scene);
	useLayoutEffect(() => {
		if (!(scene.fog instanceof FogExp2)) scene.fog = new FogExp2(color, density);
		const fog = scene.fog as FogExp2;
		fog.color.set(color);
		fog.density = density;
	});
	return null;
};
