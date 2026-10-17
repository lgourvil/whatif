import React from 'react';
import {Composition} from 'remotion';
import {OceanDrains} from './episodes/ocean-drains/Scene';
import {DURATION} from './episodes/ocean-drains/world';
import {HandLab} from './episodes/_lab/HandLab';
import {Carburant, DURATION as CARB_DURATION} from './episodes/carburant-10-euros/Scene';

export const Root: React.FC = () => (
  <>
    <Composition id="ocean-drains" component={OceanDrains} durationInFrames={DURATION} fps={30} width={1080} height={1920} />
    <Composition id="carburant-10-euros" component={Carburant} durationInFrames={CARB_DURATION} fps={30} width={1080} height={1920} />
    <Composition id="hand-lab" component={HandLab} durationInFrames={24} fps={30} width={1080} height={1920} />
  </>
);
