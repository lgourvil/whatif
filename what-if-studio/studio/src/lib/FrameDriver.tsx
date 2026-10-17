import React, {useLayoutEffect} from 'react';
import {useThree} from '@react-three/fiber';

/**
 * Use with <ThreeCanvas frameloop="never">: renders synchronously once per Remotion frame,
 * after every other layout effect of the scene has applied this frame's state. Must be the LAST child.
 */
export const FrameDriver: React.FC<{frame: number; fps: number}> = ({frame, fps}) => {
  const advance = useThree((s) => s.advance);
  useLayoutEffect(() => {
    advance((frame * 1000) / fps, true);
  });
  return null;
};
