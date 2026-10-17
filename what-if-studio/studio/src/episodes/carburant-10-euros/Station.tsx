import React, {useLayoutEffect, useMemo} from 'react';
import * as THREE from 'three';
import {random} from 'remotion';
import {RoundedBox} from '@react-three/drei';
import {RectAreaLightUniformsLib} from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import {pbr, texSet} from '../../lib/PbrMaterials';
import {DISPLAY_FONT, TEXT_FONT} from '../../lib/fonts';
import {CAR_FIRE, PALLET_FIRE, PUMP1, ROAD_Z, ROUNDABOUT, TOTEM, TOTEM_YAW} from './world';

RectAreaLightUniformsLib.init();

const fmt = (p: number, d = 2) => p.toFixed(d).replace('.', ',');

/* ---------------------------------------------------------------- ground, roads, markings */

const planeXZ = (w: number, d: number, seg = 1) => {
  const g = new THREE.PlaneGeometry(w, d, seg, seg);
  g.rotateX(-Math.PI / 2);
  return g;
};

export const Ground: React.FC = () => {
  const m = useMemo(() => ({
    soil: pbr('soil', {repeat: [160, 160], normalScale: 1.2}),
    grass: pbr('grass', {repeat: [60, 60], normalScale: 1}),
    verge: pbr('grass', {repeat: [20, 3], normalScale: 1}),
    forecourt: pbr('asphalt', {repeat: [17, 16.5], normalScale: 1.1, physical: {clearcoat: 0, sheen: 0}}),
    road: pbr('asphalt', {repeat: [200, 3.5], normalScale: 1.1}),
    roadNS: pbr('asphalt', {repeat: [3.5, 60], normalScale: 1.1}),
    ring: pbr('asphalt', {repeat: [15, 15], normalScale: 1.1}),
    island: pbr('grass', {repeat: [8, 8]}),
    concrete: pbr('concrete', {repeat: [2, 2]}),
    curb: pbr('concrete', {repeat: [1, 1], color: '#d8d6d0'}),
    paint: new THREE.MeshStandardMaterial({color: '#e8e6df', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4}),
  }), []);
  const ringGeo = useMemo(() => {
    const g = new THREE.RingGeometry(8, 15.5, 96, 1);
    g.rotateX(-Math.PI / 2);
    // planar UVs in metres / 2
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 30 + 0.5, p.getZ(i) / 30 + 0.5);
    return g;
  }, []);
  const islandGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(8, 64);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const curbRing = useMemo(() => new THREE.TorusGeometry(8.05, 0.12, 8, 96).rotateX(Math.PI / 2), []);
  const dashes = useMemo(() => {
    const a: [number, number][] = [];
    for (let x = -200; x < 200; x += 6) if (x < -40 || x > -9) a.push([x, ROAD_Z]);
    return a;
  }, []);
  return (
    <group>
      {/* farmland and meadow */}
      <mesh geometry={useMemo(() => planeXZ(1600, 1600), [])} material={m.soil} position={[0, -0.02, -400]} receiveShadow />
      <mesh geometry={useMemo(() => planeXZ(120, 120), [])} material={m.grass} position={[0, -0.012, -10]} receiveShadow />
      {/* forecourt */}
      <mesh geometry={useMemo(() => planeXZ(34, 33), [])} material={m.forecourt} position={[-1, 0, -4]} receiveShadow />
      {/* main road (east-west) and the north/south branches */}
      <mesh geometry={useMemo(() => planeXZ(400, 7), [])} material={m.road} position={[0, 0.004, ROAD_Z]} receiveShadow />
      <mesh geometry={useMemo(() => planeXZ(7, 120), [])} material={m.roadNS} position={[ROUNDABOUT.x, 0.004, ROUNDABOUT.z - 72]} receiveShadow />
      <mesh geometry={useMemo(() => planeXZ(7, 120), [])} material={m.roadNS} position={[ROUNDABOUT.x, 0.004, ROUNDABOUT.z + 72]} receiveShadow />
      <mesh geometry={ringGeo} material={m.ring} position={[ROUNDABOUT.x, 0.006, ROUNDABOUT.z]} receiveShadow />
      <mesh geometry={islandGeo} material={m.island} position={[ROUNDABOUT.x, 0.14, ROUNDABOUT.z]} receiveShadow />
      <mesh geometry={curbRing} material={m.curb} position={[ROUNDABOUT.x, 0.06, ROUNDABOUT.z]} castShadow receiveShadow />
      {/* road edge lines + centre dashes */}
      {dashes.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.012, z]} material={m.paint} receiveShadow>
          <boxGeometry args={[3, 0.004, 0.14]} />
        </mesh>
      ))}
      {[ROAD_Z - 3.25, ROAD_Z + 3.25].map((z, i) => (
        <mesh key={`e${i}`} position={[0, 0.011, z]} material={m.paint} receiveShadow>
          <boxGeometry args={[400, 0.004, 0.12]} />
        </mesh>
      ))}
      {/* curb between forecourt and road */}
      <mesh position={[-1, 0.07, ROAD_Z + 3.7]} material={m.curb} castShadow receiveShadow>
        <boxGeometry args={[34, 0.14, 0.25]} />
      </mesh>
    </group>
  );
};

/* ---------------------------------------------------------------- canopy + pumps */

const canvasTex = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return {c, ctx: c.getContext('2d')!, t};
};

export const Canopy: React.FC<{lightsOn: number}> = ({lightsOn}) => {
  const paint = useMemo(() => pbr('paint', {color: '#e9ebee', roughness: 1, repeat: [6, 4]}), []);
  const fascia = useMemo(() => {
    const {c, ctx, t} = canvasTex(2048, 128);
    ctx.fillStyle = '#f1f2f4'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#0d5c3b'; ctx.fillRect(0, 86, c.width, 42);
    ctx.fillStyle = '#e8b400'; ctx.fillRect(0, 78, c.width, 8);
    ctx.fillStyle = '#0d5c3b';
    ctx.font = `64px ${DISPLAY_FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('RELAIS DU ROND-POINT', 60, 42);
    ctx.fillText('CARBURANTS · BOUTIQUE · LAVAGE', 1150, 42);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({map: t, roughness: 0.4});
  }, []);
  const panel = useMemo(() => new THREE.MeshStandardMaterial({color: '#ffffff', emissive: new THREE.Color('#fff4e6'), emissiveIntensity: 0, roughness: 0.3}), []);
  useLayoutEffect(() => {
    panel.emissiveIntensity = 2.4 * lightsOn;
  });
  const pillars: [number, number][] = [[-0.95, -3.6], [-0.95, 1.8], [-6.5, -3.6], [-6.5, 1.8], [4.6, -3.6], [4.6, 1.8]];
  return (
    <group>
      <RoundedBox args={[17, 0.75, 11.5]} radius={0.06} smoothness={3} position={[-1, 5.05, -0.9]} material={paint} castShadow receiveShadow />
      {/* fascia band */}
      <mesh position={[-1, 5.05, -6.66]} material={fascia}>
        <planeGeometry args={[17, 0.75]} />
      </mesh>
      {/* recessed light panels under the canopy */}
      {[[-3.7, -0.9], [1.8, -0.9]].map(([x, z], i) => (
        <mesh key={i} position={[x, 4.66, z]} rotation={[Math.PI / 2, 0, 0]} material={panel}>
          <planeGeometry args={[1.4, 7.5]} />
        </mesh>
      ))}
      {pillars.map(([x, z], i) => (
        <RoundedBox key={i} args={[0.42, 4.7, 0.42]} radius={0.04} smoothness={2} position={[x, 2.35, z]} material={paint} castShadow receiveShadow />
      ))}
      {lightsOn > 0.01 && (
        <>
          <rectAreaLight position={[-3.7, 4.6, -0.9]} rotation={[-Math.PI / 2, 0, 0]} width={1.4} height={7.5} intensity={9 * lightsOn} color="#fff1df" />
          <rectAreaLight position={[1.8, 4.6, -0.9]} rotation={[-Math.PI / 2, 0, 0]} width={1.4} height={7.5} intensity={9 * lightsOn} color="#fff1df" />
        </>
      )}
    </group>
  );
};

/** Pump display canvas (price/L, volume, amount) — updated every frame. */
export const usePumpScreen = () => useMemo(() => {
  const {c, ctx, t} = canvasTex(512, 384);
  const mat = new THREE.MeshStandardMaterial({map: t, emissiveMap: t, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.1, roughness: 0.15});
  const draw = (price: number, litres: number, empty: boolean, frame: number) => {
    ctx.fillStyle = '#0b0f0c'; ctx.fillRect(0, 0, 512, 384);
    const rows: [string, string][] = [['MONTANT €', fmt(price * litres)], ['VOLUME L', fmt(litres)], ['PRIX / L', price.toFixed(3).replace('.', ',')]];
    rows.forEach(([lab, val], i) => {
      const y = 30 + i * 118;
      ctx.fillStyle = '#121a14'; ctx.fillRect(18, y, 476, 100);
      ctx.fillStyle = '#8fa196'; ctx.font = `24px ${TEXT_FONT}`; ctx.textBaseline = 'top';
      ctx.fillText(lab, 30, y + 8);
      ctx.fillStyle = i === 2 && price >= 3 ? '#ff6a3a' : '#c8ffb0';
      ctx.font = `68px ${DISPLAY_FONT}`; ctx.textAlign = 'right';
      ctx.fillText(empty && i < 2 ? '- - , - -' : val, 482, y + 22);
      ctx.textAlign = 'left';
    });
    if (empty && Math.floor(frame / 12) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,40,30,0.92)'; ctx.fillRect(18, 150, 476, 84);
      ctx.fillStyle = '#fff'; ctx.font = `60px ${DISPLAY_FONT}`; ctx.textAlign = 'center';
      ctx.fillText('HORS SERVICE', 256, 160); ctx.textAlign = 'left';
    }
    t.needsUpdate = true;
  };
  return {mat, draw};
}, []);

const nozzleGeo = (() => {
  let g: THREE.Group | null = null;
  return (mats: {body: THREE.Material; grip: THREE.Material; spout: THREE.Material}) => {
    const grp = new THREE.Group();
    // nozzle frame: +X forward (spout end), handle along X, lever below
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.1, 6, 16), mats.grip);
    handle.rotation.z = Math.PI / 2; grp.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.045), mats.body);
    head.position.set(0.08, 0.012, 0); grp.add(head);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.012, 0.21, 16), mats.spout);
    spout.position.set(0.17, -0.025, 0); spout.rotation.z = Math.PI / 2 + 0.38; grp.add(spout);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 8, 24, Math.PI), mats.body);
    guard.position.set(0.02, -0.02, 0); guard.rotation.z = Math.PI; grp.add(guard);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.02), mats.spout);
    lever.position.set(0.02, -0.03, 0); grp.add(lever);
    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.06, 16), mats.grip);
    boot.position.set(-0.08, -0.004, 0); boot.rotation.z = Math.PI / 2; grp.add(boot);
    grp.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g = grp;
    return grp;
  };
})();

export const useNozzleMats = (color: THREE.ColorRepresentation) => useMemo(() => ({
  body: new THREE.MeshPhysicalMaterial({color, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3}),
  grip: pbr('rubber', {color: '#3a3a3a', repeat: [2, 2]}),
  spout: new THREE.MeshStandardMaterial({color: '#b9bcc0', metalness: 1, roughness: 0.32}),
}), [color]);

export const Nozzle: React.FC<{mats: ReturnType<typeof useNozzleMats>; position?: THREE.Vector3; quaternion?: THREE.Quaternion}> = ({mats, position, quaternion}) => {
  const obj = useMemo(() => nozzleGeo(mats), [mats]);
  return <primitive object={obj} position={position} quaternion={quaternion} />;
};

/** Hose from the pump outlet to a nozzle, sagging under gravity; rebuilt per frame. */
export const Hose: React.FC<{from: THREE.Vector3; to: THREE.Vector3; sag?: number}> = ({from, to, sag = 0.6}) => {
  const mat = useMemo(() => pbr('rubber', {color: '#2b2b2b', repeat: [1, 20]}), []);
  const geo = useMemo(() => {
    const mid = from.clone().lerp(to, 0.5);
    const d = from.distanceTo(to);
    const low = Math.min(from.y, to.y) - sag * Math.max(0.2, 1.6 - d * 0.6);
    const c = new THREE.CatmullRomCurve3([
      from.clone(), from.clone().add(new THREE.Vector3(0.12, -0.25, 0)), new THREE.Vector3(mid.x, Math.max(0.12, low), mid.z),
      to.clone().add(new THREE.Vector3(-0.05, -0.18, 0.05)), to.clone(),
    ]);
    return new THREE.TubeGeometry(c, 60, 0.016, 10, false);
  }, [from.x, from.y, from.z, to.x, to.y, to.z, sag]);
  useLayoutEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={mat} castShadow receiveShadow />;
};

export const PumpUnit: React.FC<{position: THREE.Vector3; yaw: number; screen: THREE.Material; accent: THREE.ColorRepresentation; bagged: number}> = ({position, yaw, screen, accent, bagged}) => {
  const body = useMemo(() => pbr('paint', {color: '#dfe3e6', repeat: [1, 2], roughness: 1}), []);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({color: '#2a2e33', roughness: 0.55}), []);
  const acc = useMemo(() => pbr('paint', {color: accent, repeat: [1, 1]}), [accent]);
  const bag = useMemo(() => new THREE.MeshPhysicalMaterial({color: '#f4f4f0', roughness: 0.45, transmission: 0, transparent: true, opacity: 0.82, side: THREE.DoubleSide}), []);
  const mats = useNozzleMats(accent);
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {/* pump faces +X in local space */}
      <RoundedBox args={[0.5, 1.95, 1.05]} radius={0.05} smoothness={3} position={[0, 0.975, 0]} material={body} castShadow receiveShadow />
      <RoundedBox args={[0.52, 0.32, 1.07]} radius={0.05} smoothness={3} position={[0, 1.83, 0]} material={acc} castShadow />
      <RoundedBox args={[0.53, 0.12, 1.08]} radius={0.03} smoothness={2} position={[0, 0.06, 0]} material={dark} castShadow receiveShadow />
      <mesh position={[0.256, 1.36, 0]} rotation={[0, Math.PI / 2, 0]} material={screen}>
        <planeGeometry args={[0.46, 0.345]} />
      </mesh>
      {/* holster recesses + parked nozzles (front ones are visible) */}
      {[-0.32, 0.32].map((z, i) => (
        <group key={i} position={[0.29, 1.0, z]} rotation={[0, 0, -1.25]}>
          <Nozzle mats={mats} />
          {bagged > 0.5 && (
            <mesh position={[0.12, -0.02, 0]} material={bag}>
              <sphereGeometry args={[0.13, 12, 10]} />
            </mesh>
          )}
        </group>
      ))}
      <RoundedBox args={[0.06, 0.22, 0.85]} radius={0.02} smoothness={2} position={[0.27, 1.0, 0]} material={dark} />
    </group>
  );
};

export const PumpIsland: React.FC<{x: number; zc?: number}> = ({x, zc = -0.9}) => {
  const conc = useMemo(() => pbr('concrete', {repeat: [1, 4], color: '#cfcbc3'}), []);
  const yellow = useMemo(() => pbr('paint', {color: '#e0b300', repeat: [1, 1]}), []);
  return (
    <group>
      <RoundedBox args={[1.2, 0.18, 6.4]} radius={0.05} smoothness={3} position={[x, 0.09, zc]} material={conc} castShadow receiveShadow />
      {[-3.15, 3.15].map((dz, i) => (
        <mesh key={i} position={[x, 0.45, zc + dz]} material={yellow} castShadow receiveShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.75, 16]} />
        </mesh>
      ))}
    </group>
  );
};

/* ---------------------------------------------------------------- price totem */

export const Totem: React.FC<{price: number; frame: number; rupture: number; glitch: number; lightsOn: number}> = ({price, frame, rupture, glitch, lightsOn}) => {
  const {mat, draw} = useMemo(() => {
    const {c, ctx, t} = canvasTex(512, 1280);
    const mat = new THREE.MeshStandardMaterial({map: t, emissiveMap: t, emissive: new THREE.Color('#ffffff'), roughness: 0.2});
    const draw = (p: number, f: number, rup: number, gl: number) => {
      ctx.fillStyle = '#0e3d2a'; ctx.fillRect(0, 0, 512, 1280);
      // header
      ctx.fillStyle = '#f2f2ee'; ctx.fillRect(24, 24, 464, 250);
      ctx.fillStyle = '#0d5c3b'; ctx.font = `76px ${DISPLAY_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('RELAIS', 256, 92); ctx.fillText('DU ROND-POINT', 256, 186);
      ctx.fillStyle = '#e8b400'; ctx.fillRect(24, 250, 464, 24);
      const rows: [string, number][] = [['GAZOLE', p - 0.04], ['SP98', p + 0.08], ['SP95-E10', p]];
      rows.forEach(([lab, v], i) => {
        const y = 320 + i * 240;
        ctx.fillStyle = '#071a12'; ctx.fillRect(24, y, 464, 210);
        ctx.fillStyle = '#e9efe9'; ctx.font = `44px ${TEXT_FONT}`; ctx.textAlign = 'left';
        ctx.fillText(lab, 44, y + 40);
        let txt = v.toFixed(2).replace('.', ',');
        if (gl > 0) {
          const r = random(`gl${f}-${i}`);
          if (r < gl * 0.8) txt = (random(`gv${f}-${i}`) * 9.99).toFixed(2).replace('.', ',');
          if (r > 1 - gl * 0.3) txt = '- , - -';
        }
        const hot = v >= 2.5;
        ctx.fillStyle = hot ? (v >= 6 ? '#ff3b24' : '#ffb000') : '#ffd36a';
        ctx.font = `128px ${DISPLAY_FONT}`; ctx.textAlign = 'right';
        ctx.fillText(txt, 470, y + 132);
        ctx.font = `30px ${TEXT_FONT}`; ctx.fillStyle = '#9fb8a8';
        ctx.fillText('€ / L', 470, y + 190);
      });
      if (rup > 0.5) {
        ctx.fillStyle = Math.floor(f / 15) % 2 ? '#d01b12' : '#a01009';
        ctx.fillRect(24, 1060, 464, 190);
        ctx.fillStyle = '#ffffff'; ctx.font = `92px ${DISPLAY_FONT}`; ctx.textAlign = 'center';
        ctx.fillText('RUPTURE', 256, 1155);
      } else {
        ctx.fillStyle = '#f2f2ee'; ctx.font = `40px ${TEXT_FONT}`; ctx.textAlign = 'center';
        ctx.fillText('OUVERT 24H/24', 256, 1155);
      }
      t.needsUpdate = true;
    };
    return {mat, draw};
  }, []);
  const frameMat = useMemo(() => pbr('paint', {color: '#c9ced3', repeat: [1, 3]}), []);
  const base = useMemo(() => pbr('concrete', {repeat: [1, 1]}), []);
  useLayoutEffect(() => {
    draw(price, frame, rupture, glitch);
    const flick = glitch > 0 ? (random(`fl${frame}`) < glitch * 0.35 ? 0.15 : 1) : 1;
    mat.emissiveIntensity = (0.35 + 1.8 * lightsOn) * flick;
  });
  return (
    <group position={TOTEM} rotation={[0, TOTEM_YAW, 0]}>
      <RoundedBox args={[1.2, 0.5, 0.8]} radius={0.06} smoothness={2} position={[0, 0.25, 0]} material={base} castShadow receiveShadow />
      <RoundedBox args={[2.3, 5.9, 0.42]} radius={0.06} smoothness={3} position={[0, 3.45, 0]} material={frameMat} castShadow receiveShadow />
      <mesh position={[0, 3.45, 0.215]} material={mat}>
        <planeGeometry args={[2.05, 5.6]} />
      </mesh>
      <mesh position={[0, 3.45, -0.215]} rotation={[0, Math.PI, 0]} material={mat}>
        <planeGeometry args={[2.05, 5.6]} />
      </mesh>
      {lightsOn > 0.05 && <rectAreaLight position={[0, 3.45, 0.3]} width={2.0} height={5.4} intensity={1.6 * lightsOn} color="#ffd9a0" />}
    </group>
  );
};

/* ---------------------------------------------------------------- shop, houses, church */

export const Shop: React.FC<{lightsOn: number}> = ({lightsOn}) => {
  const wall = useMemo(() => pbr('plaster', {repeat: [4, 2], color: '#e6e1d6'}), []);
  const roof = useMemo(() => pbr('paint', {color: '#5d6166', repeat: [3, 2]}), []);
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({color: '#1c2226', roughness: 0.05, metalness: 0, clearcoat: 1, emissive: new THREE.Color('#ffe7c2'), emissiveIntensity: 0}), []);
  useLayoutEffect(() => { glass.emissiveIntensity = 0.12 + lightsOn * 1.4; });
  return (
    <group position={[-13.5, 0, 1]}>
      <mesh position={[0, 2, 0]} material={wall} castShadow receiveShadow>
        <boxGeometry args={[10, 4, 9]} />
      </mesh>
      <RoundedBox args={[10.6, 0.4, 9.6]} radius={0.05} position={[0, 4.15, 0]} material={roof} castShadow receiveShadow />
      <mesh position={[5.01, 1.6, 0]} rotation={[0, Math.PI / 2, 0]} material={glass}>
        <planeGeometry args={[7, 2.6]} />
      </mesh>
    </group>
  );
};

const houseGeo = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (g) return g;
    const s = new THREE.Shape();
    s.moveTo(-4, 0); s.lineTo(4, 0); s.lineTo(0, 3.2); s.lineTo(-4, 0);
    g = new THREE.ExtrudeGeometry(s, {depth: 10, bevelEnabled: false});
    g.translate(0, 0, -5);
    return g;
  };
})();

export const Houses: React.FC<{lightsOn: number}> = ({lightsOn}) => {
  const wall = useMemo(() => pbr('plaster', {repeat: [3, 1.5], color: '#e9dfcc'}), []);
  const roof = useMemo(() => pbr('roofTiles', {repeat: [3, 3]}), []);
  const win = useMemo(() => new THREE.MeshStandardMaterial({color: '#1d2023', emissive: new THREE.Color('#ffcf8a'), emissiveIntensity: 0, roughness: 0.2}), []);
  useLayoutEffect(() => { win.emissiveIntensity = lightsOn * 2.5; });
  const list: [number, number, number, number][] = [[30, -44, 0.2, 1], [44, -50, -0.1, 0.9], [-58, -66, 0.4, 1.1], [62, 6, 1.4, 1], [-40, 30, 0.9, 1]];
  const village = useMemo(() => {
    const a: [number, number, number, number][] = [];
    for (let i = 0; i < 26; i++) a.push([-210 + random(`vx${i}`) * 140, -280 - random(`vz${i}`) * 80, random(`vr${i}`) * 3, 0.8 + random(`vs${i}`) * 0.6]);
    return a;
  }, []);
  return (
    <group>
      {[...list, ...village].map(([x, z, r, s], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, r, 0]} scale={s}>
          <mesh position={[0, 2.8, 0]} material={wall} castShadow receiveShadow>
            <boxGeometry args={[8, 5.6, 10]} />
          </mesh>
          <mesh geometry={houseGeo()} position={[0, 5.6, 0]} scale={[1.08, 1, 1.04]} material={roof} castShadow receiveShadow />
          {[-2, 2].map((wx, k) => (
            <mesh key={k} position={[wx, 3.2, 5.01]} material={win}>
              <planeGeometry args={[1.1, 1.3]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* church tower + spire */}
      <group position={[-150, 0, -300]}>
        <mesh position={[0, 9, 0]} material={wall} castShadow><boxGeometry args={[6, 18, 6]} /></mesh>
        <mesh position={[0, 24, 0]} castShadow>
          <coneGeometry args={[4.4, 12, 4]} />
          <meshStandardMaterial color="#3a3f45" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
};

/* ---------------------------------------------------------------- vegetation + hills + street lights */

const foliageGeo = (seed: string) => {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + random(seed) * 9) * 0.12 + Math.sin(v.y * 4.3) * 0.1 + Math.sin(v.z * 5.7 + v.x * 2) * 0.08;
    v.multiplyScalar(1 + n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
};

export const Trees: React.FC = () => {
  const leafMat = useMemo(() => pbr('foliage', {repeat: [3, 3], normalScale: 1.2}), []);
  const bark = useMemo(() => pbr('bark', {repeat: [1, 3]}), []);
  const geos = useMemo(() => [foliageGeo('a'), foliageGeo('b'), foliageGeo('c')], []);
  const trees = useMemo(() => {
    const a: {x: number; z: number; h: number; r: number; k: number; poplar: boolean}[] = [];
    // plane trees along the main road (north side)
    for (let x = -120; x <= 140; x += 13) {
      if (Math.abs(x - ROUNDABOUT.x) < 22) continue;
      a.push({x: x + random(`tx${x}`) * 3, z: ROAD_Z - 7 - random(`tz${x}`) * 1.5, h: 7 + random(`th${x}`) * 3, r: 3 + random(`tr${x}`) * 1.2, k: x % 3 === 0 ? 0 : x % 3 === 1 ? 1 : 2, poplar: false});
    }
    // poplar windbreak across the fields
    for (let x = -260; x <= 260; x += 7) a.push({x, z: -110 - random(`pz${x}`) * 4, h: 14 + random(`ph${x}`) * 6, r: 1.8, k: (x / 7) % 3 | 0, poplar: true});
    for (let z = -100; z <= 60; z += 8) a.push({x: 70 + random(`qx${z}`) * 3, z, h: 13 + random(`qh${z}`) * 5, r: 1.7, k: 1, poplar: true});
    return a;
  }, []);
  return (
    <group>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          <mesh position={[0, t.h * 0.3, 0]} material={bark} castShadow>
            <cylinderGeometry args={[t.poplar ? 0.18 : 0.28, t.poplar ? 0.3 : 0.4, t.h * 0.6, 8]} />
          </mesh>
          <mesh geometry={geos[Math.abs(t.k) % 3]} material={leafMat} position={[0, t.h * (t.poplar ? 0.62 : 0.72), 0]}
            scale={t.poplar ? [t.r, t.h * 0.42, t.r] : [t.r, t.r * 0.85, t.r]} castShadow receiveShadow />
        </group>
      ))}
    </group>
  );
};

export const Hills: React.FC = () => {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(3000, 900, 160, 40);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const far = Math.min(1, Math.max(0, (-z + 450) / 400));
      const h = (Math.sin(x * 0.006) * 30 + Math.sin(x * 0.017 + 1) * 14 + Math.sin(x * 0.041) * 5 + 20) * far;
      p.setY(i, h - 4);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(() => pbr('grass', {repeat: [200, 60], color: '#9aa585'}), []);
  return <mesh geometry={geo} material={mat} position={[0, 0, -850]} receiveShadow />;
};

export const StreetLights: React.FC<{on: number}> = ({on}) => {
  const metal = useMemo(() => new THREE.MeshStandardMaterial({color: '#6d7175', metalness: 0.8, roughness: 0.45}), []);
  const lamp = useMemo(() => new THREE.MeshStandardMaterial({color: '#222', emissive: new THREE.Color('#ff9c3a'), emissiveIntensity: 0}), []);
  useLayoutEffect(() => { lamp.emissiveIntensity = on * 14; });
  const xs = useMemo(() => [-70, -46, 2, 26, 50, 74], []);
  return (
    <group>
      {xs.map((x, i) => (
        <group key={i} position={[x, 0, ROAD_Z + 4.4]}>
          <mesh position={[0, 4, 0]} material={metal} castShadow><cylinderGeometry args={[0.07, 0.1, 8, 10]} /></mesh>
          <mesh position={[0, 7.9, -0.9]} rotation={[Math.PI / 2, 0, 0]} material={metal}><cylinderGeometry args={[0.05, 0.05, 1.8, 8]} /></mesh>
          <mesh position={[0, 7.82, -1.7]} material={lamp}><boxGeometry args={[0.35, 0.1, 0.6]} /></mesh>
        </group>
      ))}
    </group>
  );
};

/* ---------------------------------------------------------------- barricade props */

export const Barricade: React.FC<{burn: number; frame: number}> = ({burn}) => {
  const wood = useMemo(() => pbr('wood', {repeat: [1, 1]}), []);
  const burnt = useMemo(() => pbr('wood', {repeat: [1, 1], color: '#2a201a'}), []);
  const tyre = useMemo(() => pbr('rubber', {repeat: [4, 1]}), []);
  const pallets = useMemo(() => {
    const a: [number, number, number, number, number][] = [];
    for (let i = 0; i < 9; i++) a.push([(random(`px${i}`) - 0.5) * 1.6, 0.08 + Math.floor(i / 3) * 0.16, (random(`pz${i}`) - 0.5) * 1.4, random(`pr${i}`) * 3, (random(`pt${i}`) - 0.5) * 0.4]);
    return a;
  }, []);
  return (
    <group position={PALLET_FIRE}>
      {pallets.map(([x, y, z, r, t], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[t, r, t * 0.5]} material={burn > 0.6 ? burnt : wood} castShadow receiveShadow>
          <boxGeometry args={[1.2, 0.14, 0.8]} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={`t${i}`} position={[1.6 + (i % 2) * 0.1, 0.13 + i * 0.24, -0.6]} rotation={[Math.PI / 2, 0, 0]} material={tyre} castShadow receiveShadow>
          <torusGeometry args={[0.3, 0.12, 10, 24]} />
        </mesh>
      ))}
    </group>
  );
};

export const BannerSheet: React.FC<{a: THREE.Vector3; b: THREE.Vector3; text: string; frame: number; seed: number}> = ({a, b, text, frame, seed}) => {
  const mat = useMemo(() => {
    const {c, ctx, t} = canvasTex(1024, 256);
    ctx.fillStyle = '#efeee8'; ctx.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(120,110,90,${random(`bn${seed}${i}`) * 0.05})`; ctx.fillRect(random(`bx${seed}${i}`) * 1024, random(`by${seed}${i}`) * 256, 40, 8); }
    ctx.fillStyle = '#111'; ctx.font = `150px ${DISPLAY_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(512, 132); ctx.rotate(-0.02); ctx.fillText(text, 0, 0); ctx.restore();
    t.needsUpdate = true;
    return new THREE.MeshPhysicalMaterial({map: t, side: THREE.DoubleSide, roughness: 0.9, sheen: 0.6, sheenColor: new THREE.Color('#ffffff')});
  }, [text, seed]);
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1, 24, 6), []);
  useLayoutEffect(() => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    const w = a.distanceTo(b);
    for (let i = 0; i < p.count; i++) {
      const u = (i % 25) / 24, v = Math.floor(i / 25) / 6;
      const sag = Math.sin(u * Math.PI) * 0.12;
      const wave = Math.sin(u * 7 + frame * 0.15 + seed) * 0.05 * (0.3 + v);
      p.setXYZ(i, (u - 0.5) * w, -v * 0.9 - sag * (1 - v), wave);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  });
  const mid = a.clone().lerp(b, 0.5);
  const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
  return <mesh geometry={geo} material={mat} position={mid} rotation={[0, yaw, 0]} castShadow receiveShadow />;
};

export {CAR_FIRE, PUMP1, texSet};
