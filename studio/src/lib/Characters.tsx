import React, { useMemo } from "react";
import { ConeGeometry, CylinderGeometry, IcosahedronGeometry, MeshToonMaterial, SphereGeometry } from "three";
import { gradientMap, toon } from "./ToonMaterial";
import { Toon } from "./Toon";
import { madrasTexture } from "./textures";

// Recurring original cast (low-poly silhouettes + one signature detail each).
export type Signature = "madrasWrap" | "conch" | "strawHat" | "none";

export type Pose = {
  walk?: number; // 0..1 amount
  phase?: number; // steps elapsed
  armL?: { raise?: number; swing?: number; fwd?: number }; // radians
  armR?: { raise?: number; swing?: number; fwd?: number };
  headYaw?: number;
  headPitch?: number;
  bounce?: number; // vertical hop (m)
  lean?: number;
};

type Props = {
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
  skin?: string;
  shirt?: string;
  pants?: string;
  signature?: Signature;
  pose?: Pose;
  outline?: number;
};

const G = {
  leg: new CylinderGeometry(0.1, 0.085, 0.9, 6).translate(0, -0.45, 0),
  torso: new CylinderGeometry(0.27, 0.21, 0.62, 7).translate(0, 0.31, 0),
  head: new IcosahedronGeometry(0.17, 1),
  arm: new CylinderGeometry(0.075, 0.065, 0.66, 6).translate(0, -0.33, 0),
  hand: new IcosahedronGeometry(0.075, 0),
  foot: new SphereGeometry(0.1, 6, 4).scale(1, 0.55, 1.6),
  wrap: new IcosahedronGeometry(0.2, 1).scale(1.05, 0.75, 1.1),
  knot: new ConeGeometry(0.09, 0.22, 5),
  hatBrim: new CylinderGeometry(0.38, 0.4, 0.04, 10),
  hatTop: new ConeGeometry(0.2, 0.32, 8),
  conch: new ConeGeometry(0.09, 0.32, 7),
};

let madrasMat: MeshToonMaterial | null = null;
const madras = () => {
  if (!madrasMat) {
    madrasMat = new MeshToonMaterial({ map: madrasTexture(), gradientMap: gradientMap(3) });
  }
  return madrasMat;
};

export const Character: React.FC<Props> = ({
  position = [0, 0, 0], rotationY = 0, scale = 1, skin = "#5b3624", shirt = "#f4f1e8", pants = "#2d3a66",
  signature = "none", pose = {}, outline = 0.025,
}) => {
  const { walk = 0, phase = 0, armL = {}, armR = {}, headYaw = 0, headPitch = 0, bounce = 0, lean = 0 } = pose;
  const s = Math.sin(phase * Math.PI);
  const legSwing = s * 0.55 * walk;
  const bob = Math.abs(Math.cos(phase * Math.PI)) * 0.05 * walk + bounce;
  const armSwing = s * 0.5 * walk;
  const ol = outline / scale;
  const sig = useMemo(() => signature, [signature]);

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <group position={[0, bob, 0]} rotation={[lean, 0, 0]}>
        {/* legs */}
        <group position={[-0.12, 0.95, 0]} rotation={[legSwing, 0, 0]}>
          <Toon geometry={G.leg} color={pants} outline={ol} />
          <Toon geometry={G.foot} color="#1d1a22" outline={ol} position={[0, -0.9, 0.06]} />
        </group>
        <group position={[0.12, 0.95, 0]} rotation={[-legSwing, 0, 0]}>
          <Toon geometry={G.leg} color={pants} outline={ol} />
          <Toon geometry={G.foot} color="#1d1a22" outline={ol} position={[0, -0.9, 0.06]} />
        </group>
        {/* torso */}
        <Toon geometry={G.torso} color={shirt} outline={ol} position={[0, 0.92, 0]} />
        {/* arms: x = swing/forward, z = raise sideways */}
        <group position={[-0.33, 1.48, 0]} rotation={[-armSwing - (armL.swing ?? 0) - (armL.fwd ?? 0), 0, -(armL.raise ?? 0) - 0.08]}>
          <Toon geometry={G.arm} color={skin} outline={ol} />
          <Toon geometry={G.hand} color={skin} outline={ol} position={[0, -0.7, 0]} />
          {sig === "conch" ? <Toon geometry={G.conch} color="#f3b3a6" outline={ol} position={[0, -0.82, 0.05]} rotation={[0.4, 0, 0]} /> : null}
        </group>
        <group position={[0.33, 1.48, 0]} rotation={[armSwing - (armR.swing ?? 0) - (armR.fwd ?? 0), 0, (armR.raise ?? 0) + 0.08]}>
          <Toon geometry={G.arm} color={skin} outline={ol} />
          <Toon geometry={G.hand} color={skin} outline={ol} position={[0, -0.7, 0]} />
        </group>
        {/* head + signature */}
        <group position={[0, 1.72, 0]} rotation={[headPitch, headYaw, 0]}>
          <Toon geometry={G.head} color={skin} outline={ol} />
          {sig === "madrasWrap" ? (
            <>
              <Toon geometry={G.wrap} material={madras()} outline={ol} position={[0, 0.1, -0.02]} />
              <Toon geometry={G.knot} material={madras()} outline={ol} position={[0.08, 0.27, 0.02]} rotation={[0, 0, -0.5]} />
            </>
          ) : null}
          {sig === "strawHat" ? (
            <>
              <Toon geometry={G.hatBrim} color="#e8c46a" outline={ol} position={[0, 0.13, 0]} />
              <Toon geometry={G.hatTop} color="#d9ae4c" outline={ol} position={[0, 0.3, 0]} />
            </>
          ) : null}
        </group>
      </group>
    </group>
  );
};

// First-person hands: placed in camera space by the caller (see PovHands in the episode).
export const handGeo = {
  forearm: new CylinderGeometry(0.045, 0.04, 0.42, 7).rotateX(Math.PI / 2).translate(0, 0, -0.21),
  fist: new IcosahedronGeometry(0.06, 1).scale(1, 0.85, 1.25),
  sleeve: new CylinderGeometry(0.065, 0.06, 0.16, 7).rotateX(Math.PI / 2).translate(0, 0, -0.02),
};
export const skinMat = (skin: string) => toon(skin, { steps: 4 });
