import React from 'react';
import {Composition} from 'remotion';
import {OceanDrains} from './episodes/ocean-drains/Scene';
import {DURATION} from './episodes/ocean-drains/world';

export const Root: React.FC = () => (
  <Composition id="ocean-drains" component={OceanDrains} durationInFrames={DURATION} fps={30} width={1080} height={1920} />
);
