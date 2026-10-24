import React from 'react';
import {Composition} from 'remotion';
import {JerseyReveal} from './JerseyReveal';
import {DURATION_S, FPS} from './timeline';

export const Root: React.FC = () => (
  <Composition id="jersey-reveal" component={JerseyReveal} durationInFrames={Math.round(DURATION_S * FPS)} fps={FPS} width={1080} height={1920} />
);
