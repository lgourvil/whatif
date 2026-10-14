import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {Overlay, PostFx, TextItem} from '../../lib/Overlay';
import {PALETTE, SHADOWS, Scene, sceneState} from './Scene';
import tl from './timeline.json';

const texts = tl.texts as TextItem[];

export const OceanLeaves: React.FC = () => {
	const frame = useCurrentFrame();
	const [handle] = useState(() => delayRender('font'));
	useEffect(() => {
		const ff = new FontFace('InterXB', `url(${staticFile('fonts/Inter-ExtraBold.otf')})`);
		ff.load().then((f) => {
			(document.fonts as unknown as {add: (f: FontFace) => void}).add(f);
			continueRender(handle);
		}).catch(() => continueRender(handle));
	}, [handle]);
	const st = sceneState(frame);
	return (
		<AbsoluteFill style={{backgroundColor: '#05060d'}}>
			<PostFx shock={st.shock * 0.9 + st.tension * 0.12}>
				<ThreeCanvas
					width={1080} height={1920}
					linear={false} flat={false} dpr={1} shadows={SHADOWS}
					camera={{fov: 70, near: 0.05, far: 2500, position: [0, 3.3, 2]}}
					gl={{antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.92, outputColorSpace: THREE.SRGBColorSpace}}
				>
					<Scene frame={frame} />
				</ThreeCanvas>
			</PostFx>
			<Overlay
				frame={frame} texts={texts} flash={st.flash} shock={st.shock} alarm={PALETTE.alarm} tension={st.tension}
				tint={{color: 'rgba(20,110,140,1)', amount: st.sub * 0.38}}
			/>
			<Audio src={staticFile('audio/ocean-leaves.wav')} />
		</AbsoluteFill>
	);
};
