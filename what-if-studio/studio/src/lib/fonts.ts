import {useEffect, useState} from 'react';
import {continueRender, delayRender, staticFile} from 'remotion';

/** Local fonts (public/fonts, OFL via @fontsource). Canvas textures must wait for them: use useFontsReady(). */
const FONTS = [
  {family: 'Anton', url: 'fonts/anton-latin-400-normal.woff2', weight: '400'},
  {family: 'Anton', url: 'fonts/anton-latin-ext-400-normal.woff2', weight: '400'},
  {family: 'Oswald', url: 'fonts/oswald-latin-500-normal.woff2', weight: '500'},
  {family: 'Oswald', url: 'fonts/oswald-latin-700-normal.woff2', weight: '700'},
];

let ready: Promise<void> | null = null;
export const loadFonts = () => {
  if (!ready) {
    ready = Promise.all(FONTS.map(async (f) => {
      const ff = new FontFace(f.family, `url('${staticFile(f.url)}') format('woff2')`, {weight: f.weight});
      await ff.load();
      (document.fonts as unknown as {add: (f: FontFace) => void}).add(ff);
    })).then(() => undefined);
  }
  return ready;
};

export const useFontsReady = () => {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const h = delayRender('fonts');
    loadFonts().then(() => { setOk(true); continueRender(h); });
  }, []);
  return ok;
};

export const DISPLAY_FONT = `'Anton', 'Oswald', 'DejaVu Sans Condensed', sans-serif`;
export const TEXT_FONT = `'Oswald', 'Anton', 'DejaVu Sans', sans-serif`;
