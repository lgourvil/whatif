import {ThreeCanvas} from '@remotion/three';
import React from 'react';
import {AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Cue, Flash, Grain, ShockLens, TextCue, Vignette, impactEnvelope} from '../../lib/Overlay';
import {SHADOWS} from '../../lib/ToonMaterial';
import {IMPACTS, Scene, redAt, tensionAt} from './Scene';
import timeline from './timeline.json';

export const TELEKINESIS_TIMELINE = timeline;

export const TelekinesisEpisode: React.FC = () => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const tension = tensionAt(frame);
	const hit = Math.max(
		...IMPACTS.map((i) => impactEnvelope(frame, [i.frame], 6) * i.strength),
	);
	const whoosh = impactEnvelope(frame, timeline.whooshes, 4);
	return (
		<AbsoluteFill style={{backgroundColor: '#120f24'}}>
			<ShockLens aberration={hit * 9 + Math.max(0, tension - 0.5) * 6} blur={hit * 2.2 + whoosh * 1.2}>
				<ThreeCanvas
					width={width}
					height={height}
					linear={false}
					flat={false}
					dpr={1}
					shadows={SHADOWS ? 'soft' : false}
					gl={{antialias: true, powerPreference: 'high-performance'}}
					camera={{fov: 70, near: 0.05, far: 4000, position: [0, 1.55, 2]}}
				>
					<Scene />
				</ThreeCanvas>
			</ShockLens>
			<Vignette strength={0.5 + tension * 0.25} tint={redAt(frame) > 0.3 ? '60,0,0' : '10,6,30'} />
			<Grain opacity={0.06} />
			<Flash amount={hit * 0.55} />
			{(timeline.texts as TextCue[]).map((c, i) => (
				<Cue key={i} cue={c} />
			))}
			<Audio src={staticFile('audio/telekinesis.wav')} />
		</AbsoluteFill>
	);
};
