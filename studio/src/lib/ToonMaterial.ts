import {
	BufferGeometry,
	Color,
	DataTexture,
	MeshToonMaterial,
	NearestFilter,
	RedFormat,
	ShaderMaterial,
	UniformsLib,
	UniformsUtils,
} from 'three';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Shadows can be switched off globally if a render runs out of time. */
export const SHADOWS = true;

const gradientCache = new Map<number, DataTexture>();
/**
 * Stepped light ramp for MeshToonMaterial (3–4 bands looks best).
 * The darkest band is kept fairly bright so shadows stay readable.
 */
export const gradientMap = (steps = 4): DataTexture => {
	const hit = gradientCache.get(steps);
	if (hit) return hit;
	const data = new Uint8Array(steps);
	for (let i = 0; i < steps; i++) {
		const t = i / (steps - 1);
		data[i] = Math.round(255 * (0.38 + 0.62 * Math.pow(t, 0.85)));
	}
	const tex = new DataTexture(data, steps, 1, RedFormat);
	tex.minFilter = NearestFilter;
	tex.magFilter = NearestFilter;
	tex.generateMipmaps = false;
	tex.needsUpdate = true;
	gradientCache.set(steps, tex);
	return tex;
};

export const makeToon = (
	color: string,
	opts: {emissive?: string; emissiveIntensity?: number; steps?: number} = {},
) =>
	new MeshToonMaterial({
		color: new Color(color),
		gradientMap: gradientMap(opts.steps ?? 4),
		emissive: new Color(opts.emissive ?? '#000000'),
		emissiveIntensity: opts.emissiveIntensity ?? 1,
	});

/**
 * Inverted-hull outline: back faces pushed out along *smoothed* normals,
 * so flat-shaded low-poly meshes get an unbroken contour. Fog-aware and
 * instancing-aware.
 */
export const makeOutlineMaterial = (thickness = 0.02, color = '#14112a') =>
	new ShaderMaterial({
		uniforms: UniformsUtils.merge([
			UniformsLib.fog,
			{thickness: {value: thickness}, color: {value: new Color(color)}},
		]),
		vertexShader: /* glsl */ `
			#include <common>
			#include <fog_pars_vertex>
			uniform float thickness;
			void main() {
				vec3 p = position + normal * thickness;
				vec4 world = vec4(p, 1.0);
				#ifdef USE_INSTANCING
					world = instanceMatrix * world;
				#endif
				vec4 mvPosition = modelViewMatrix * world;
				gl_Position = projectionMatrix * mvPosition;
				#include <fog_vertex>
			}`,
		fragmentShader: /* glsl */ `
			#include <common>
			#include <fog_pars_fragment>
			uniform vec3 color;
			void main() {
				gl_FragColor = vec4(color, 1.0);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
				#include <fog_fragment>
			}`,
		side: 1, // BackSide
		fog: true,
	});

const hullCache = new WeakMap<BufferGeometry, BufferGeometry>();
/** Geometry copy with merged vertices + smooth normals, used only for outlines. */
export const hullGeometry = (geo: BufferGeometry): BufferGeometry => {
	const hit = hullCache.get(geo);
	if (hit) return hit;
	const g = geo.clone();
	for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
	const merged = mergeVertices(g, 1e-4);
	merged.computeVertexNormals();
	hullCache.set(geo, merged);
	return merged;
};

/** Low-poly geometries are flat-shaded by giving them non-indexed faces. */
export const flat = <T extends BufferGeometry>(g: T): BufferGeometry => {
	const n = g.index ? g.toNonIndexed() : g;
	n.computeVertexNormals();
	return n;
};
