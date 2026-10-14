import React, {useMemo} from 'react';
import * as THREE from 'three';
import {random} from 'remotion';
import {SkyState} from './palettes';
import {Particles} from './Particles';

const vert = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const frag = `
varying vec3 vDir;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uNight;
void main(){
  float h = clamp(vDir.y, -0.2, 1.0);
  float t = pow(max(h,0.0), 0.55);
  vec3 col = mix(uHorizon, uZenith, t);
  col = mix(col, uHorizon*0.7, smoothstep(0.0,-0.2,vDir.y));
  float sd = max(dot(normalize(vDir), uSunDir), 0.0);
  col += uSunColor * pow(sd, 6.0) * 0.35 * (1.0-uNight);
  float disc = smoothstep(0.9985, 0.9992, sd);
  col = mix(col, uSunColor*1.6, disc*(1.0-uNight*0.9));
  // toon banding of the gradient
  col = floor(col*10.0+0.5)/10.0*0.6 + col*0.4;
  gl_FragColor = vec4(col,1.0);
  #include <colorspace_fragment>
}`;

const starGeo = new THREE.OctahedronGeometry(1, 0);
const starMat = new THREE.MeshBasicMaterial({color: '#ffffff', fog: false});
const moonGeo = new THREE.IcosahedronGeometry(1, 2);
const haloGeo = new THREE.IcosahedronGeometry(1, 1);

type Props = {
	state: SkyState;
	camPos: THREE.Vector3;
	sunDir: THREE.Vector3;
	sunColor: THREE.ColorRepresentation;
	moonPos: THREE.Vector3;
	moonRadius: number;
	moonColor: THREE.ColorRepresentation;
	haloColor: THREE.ColorRepresentation;
	starCount?: number;
	frame: number;
};

/** Gradient dome + sun disc + low-poly moon + stars (InstancedMesh) that fade in at night. */
export const Sky: React.FC<Props> = ({state, camPos, sunDir, sunColor, moonPos, moonRadius, moonColor, haloColor, starCount = 1400, frame}) => {
	const uniforms = useMemo(
		() => ({
			uZenith: {value: new THREE.Color()}, uHorizon: {value: new THREE.Color()},
			uSunDir: {value: new THREE.Vector3()}, uSunColor: {value: new THREE.Color()}, uNight: {value: 0},
		}),
		[],
	);
	uniforms.uZenith.value.copy(state.zenith);
	uniforms.uHorizon.value.copy(state.horizon);
	uniforms.uSunDir.value.copy(sunDir).normalize();
	uniforms.uSunColor.value.set(sunColor);
	uniforms.uNight.value = state.night;

	const stars = useMemo(
		() => Array.from({length: starCount}, (_, i) => {
			const u = random(`sa${i}`) * Math.PI * 2;
			const v = Math.pow(random(`sb${i}`), 0.8) * 1.45 - 0.08;
			const r = Math.sqrt(Math.max(0, 1 - v * v * 0.55));
			return {x: Math.cos(u) * r, y: v, z: Math.sin(u) * r, s: 0.5 + random(`sc${i}`) * 1.6, tw: random(`sd${i}`) * 6};
		}),
		[starCount],
	);

	return (
		<group position={camPos}>
			<mesh frustumCulled={false} renderOrder={-10}>
				<sphereGeometry args={[900, 32, 24]} />
				<shaderMaterial vertexShader={vert} fragmentShader={frag} uniforms={uniforms} side={THREE.BackSide} depthWrite={false} fog={false} />
			</mesh>
			<Particles
				count={starCount}
				geometry={starGeo}
				material={starMat}
				frame={frame}
				place={(i, o) => {
					const s = stars[i];
					const vis = Math.max(0, state.night * 1.2 - 0.1 - Math.max(0, 0.5 - s.y) * 0.15);
					const tw = 0.75 + 0.25 * Math.sin(frame * 0.09 + s.tw);
					o.position.set(s.x * 800, s.y * 800, s.z * 800);
					o.scale.setScalar(s.s * 2.4 * vis * tw);
					o.lookAt(0, 0, 0);
				}}
			/>
			<group position={moonPos.clone().sub(camPos).setLength(700)}>
				<mesh geometry={moonGeo} scale={moonRadius * (700 / moonPos.clone().sub(camPos).length())}>
					<meshBasicMaterial color={moonColor} fog={false} />
				</mesh>
				<mesh geometry={haloGeo} scale={moonRadius * 1.5 * (700 / moonPos.clone().sub(camPos).length())}>
					<meshBasicMaterial color={haloColor} transparent opacity={0.16 + state.night * 0.14} fog={false} depthWrite={false} />
				</mesh>
			</group>
		</group>
	);
};
