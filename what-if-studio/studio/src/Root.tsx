import React from 'react';
import {Composition} from 'remotion';
import {OceanDrains} from './episodes/ocean-drains/Scene';
import {DURATION} from './episodes/ocean-drains/world';
import {GravityOff} from './episodes/gravity-off/Scene';
import {DURATION as GRAV} from './episodes/gravity-off/world';

export const Root: React.FC = () => (
  <>
  <Composition id="gravity-off" component={GravityOff} durationInFrames={GRAV} fps={30} width={1080} height={1920} />
  <Composition id="ocean-drains" component={OceanDrains} durationInFrames={DURATION} fps={30} width={1080} height={1920} />
  </>
);
