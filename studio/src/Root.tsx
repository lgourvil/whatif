import React from 'react';
import {Composition} from 'remotion';
import {TelekinesisEpisode} from './episodes/telekinesis/Episode';
import tk from './episodes/telekinesis/timeline.json';

/** Every episode stays registered so older ones can be re-rendered. */
export const RemotionRoot: React.FC = () => (
	<>
		<Composition
			id="WhatIf-2026-10-14-Telekinesis"
			component={TelekinesisEpisode}
			durationInFrames={tk.durationInFrames}
			fps={tk.fps}
			width={1080}
			height={1920}
		/>
	</>
);
