import React from 'react';
import {Composition} from 'remotion';
import {OceanLeaves} from './episodes/ocean-leaves/Composition';
import tl from './episodes/ocean-leaves/timeline.json';

export const Root: React.FC = () => (
	<>
		<Composition id="OceanLeaves" component={OceanLeaves} durationInFrames={tl.duration} fps={tl.fps} width={1080} height={1920} />
	</>
);
