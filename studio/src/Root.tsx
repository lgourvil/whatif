import { Composition } from "remotion";
import { GuadeloupeEmpire } from "./episodes/guadeloupe-empire/Scene";
import timeline from "./episodes/guadeloupe-empire/timeline.json";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="GuadeloupeEmpire"
        component={GuadeloupeEmpire}
        durationInFrames={timeline.durationInFrames}
        fps={timeline.fps}
        width={1080}
        height={1920}
      />
    </>
  );
};
