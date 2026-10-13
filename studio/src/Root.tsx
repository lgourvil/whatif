import React from 'react';
import {Composition} from 'remotion';
import {OceanDrain} from './episodes/ocean-drain/Scene';
import T from './episodes/ocean-drain/timeline.json';

export const RemotionRoot: React.FC = () => (
  <Composition id="OceanDrain" component={OceanDrain} durationInFrames={T.total} fps={T.fps} width={1080} height={1920} />
);
