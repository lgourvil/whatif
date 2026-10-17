import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import {Sky} from '@react-three/drei';
import {EXRLoader} from 'three/examples/jsm/loaders/EXRLoader.js';
import {continueRender, delayRender, random, staticFile} from 'remotion';

/** Local HDRIs (public/hdri, CC0 Poly Haven via @pmndrs/assets) — loaded once, render blocked until ready. */
const cache = new Map<string, Promise<THREE.DataTexture>>();
const loadHdri = (name: string) => {
  let p = cache.get(name);
  if (!p) {
    p = new Promise((res, rej) => new EXRLoader().load(staticFile(`hdri/${name}.exr`), (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      res(t);
    }, undefined, rej));
    cache.set(name, p);
  }
  return p;
};

export const useHdris = (names: string[]) => {
  const [handle] = useState(() => delayRender(`hdri ${names.join(',')}`));
  const [tex, setTex] = useState<Record<string, THREE.DataTexture> | null>(null);
  useLayoutEffect(() => {
    Promise.all(names.map(loadHdri)).then((ts) => {
      const o: Record<string, THREE.DataTexture> = {};
      names.forEach((n, i) => (o[n] = ts[i]));
      setTex(o);
      continueRender(handle);
    });
  }, []);
  return tex;
};

/** Image-based lighting: environment map, intensity and rotation driven per frame. */
export const SceneEnv: React.FC<{map: THREE.Texture | null; intensity: number; rotationY?: number; background?: boolean}> = ({map, intensity, rotationY = 0, background}) => {
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    scene.environment = map;
    scene.environmentIntensity = intensity;
    scene.environmentRotation.set(0, rotationY, 0);
    if (background) {
      scene.background = map;
      scene.backgroundRotation.set(0, rotationY, 0);
    }
  });
  return null;
};

/** Sun direction from elevation/azimuth (degrees). Azimuth 0 = -Z (north, in front), 90 = +X. */
export const sunDir = (elevDeg: number, azDeg: number) => {
  const e = (elevDeg * Math.PI) / 180, a = (azDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
};

/** Physical (Preetham) sky dome; static drei component, parameters fed by frame. */
export const PhysicalSky: React.FC<{dir: THREE.Vector3; turbidity: number; rayleigh: number; mie?: number; mieG?: number; center: THREE.Vector3}> = ({dir, turbidity, rayleigh, mie = 0.005, mieG = 0.8, center}) => (
  <group position={center}>
    <Sky distance={4000} sunPosition={dir.clone().multiplyScalar(1000).toArray()} turbidity={turbidity} rayleigh={rayleigh}
      mieCoefficient={mie} mieDirectionalG={mieG} />
  </group>
);

/** Night sky stars (instanced, deterministic), faded by `opacity`. */
export const Stars: React.FC<{count?: number; opacity: number; center: THREE.Vector3; frame: number}> = ({count = 2500, opacity, center, frame}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => {
    const a: {p: THREE.Vector3; s: number; tw: number}[] = [];
    for (let i = 0; i < count; i++) {
      const u = random(`st${i}`), v = random(`sv${i}`);
      const th = u * Math.PI * 2, y = 0.04 + v * 0.96;
      const r = Math.sqrt(1 - y * y);
      a.push({p: new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).multiplyScalar(1500), s: 0.6 + random(`ss${i}`) ** 6 * 4, tw: random(`stw${i}`) * 6.28});
    }
    return a;
  }, [count]);
  useLayoutEffect(() => {
    const m = ref.current!;
    const o = new THREE.Object3D();
    data.forEach((d, i) => {
      o.position.copy(d.p);
      o.lookAt(0, 0, 0);
      o.scale.setScalar(d.s * (0.85 + 0.15 * Math.sin(frame * 0.2 + d.tw)));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [frame]);
  return (
    <group position={center}>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false} visible={opacity > 0.01}>
        <circleGeometry args={[1, 6]} />
        <meshBasicMaterial color={new THREE.Color(3, 3, 3.3)} transparent opacity={opacity} fog={false} depthWrite={false} toneMapped />
      </instancedMesh>
    </group>
  );
};

/** Sun/moon key light with soft shadows; shadow camera kept tight around `focus`. */
export const KeyLight: React.FC<{dir: THREE.Vector3; color: THREE.ColorRepresentation; intensity: number; focus: THREE.Vector3; extent?: number; mapSize?: number}> = ({dir, color, intensity, focus, extent = 22, mapSize = 2048}) => {
  const target = useMemo(() => new THREE.Object3D(), []);
  const ref = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    target.position.copy(focus);
    target.updateMatrixWorld();
    const l = ref.current!;
    l.position.copy(focus).addScaledVector(dir, 120);
    l.target = target;
    l.shadow.camera.updateProjectionMatrix();
  });
  return (
    <>
      <primitive object={target} />
      <directionalLight ref={ref} color={color} intensity={intensity} castShadow={intensity > 0.02}
        shadow-mapSize-width={mapSize} shadow-mapSize-height={mapSize} shadow-bias={-0.00025} shadow-normalBias={0.025}
        shadow-radius={4} shadow-camera-left={-extent} shadow-camera-right={extent} shadow-camera-top={extent} shadow-camera-bottom={-extent}
        shadow-camera-near={10} shadow-camera-far={260} />
    </>
  );
};
