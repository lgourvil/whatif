import React from 'react';
import {Composition} from 'remotion';
import {OceanDrains} from './episodes/ocean-drains/Scene';
import {DURATION as D1} from './episodes/ocean-drains/world';
import {ShadowsNoon} from './episodes/shadows-noon/Scene';
import {DURATION as D2} from './episodes/shadows-noon/world';
import {HandLab} from './episodes/everyone-vapes/HandLab';
import {EveryoneVapes} from './episodes/everyone-vapes/Scene';
import {DURATION as D3} from './episodes/everyone-vapes/world';

export const Root: React.FC = () => (
  <>
    <Composition id="ocean-drains" component={OceanDrains} durationInFrames={D1} fps={30} width={1080} height={1920} />
    <Composition id="shadows-noon" component={ShadowsNoon} durationInFrames={D2} fps={30} width={1080} height={1920} />
    <Composition id="everyone-vapes" component={EveryoneVapes} durationInFrames={D3} fps={30} width={1080} height={1920} />
    <Composition id="hand-lab" component={HandLab} durationInFrames={100} fps={30} width={1080} height={1920} />
  </>
);
