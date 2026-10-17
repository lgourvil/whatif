// Render several stills of a composition with ONE bundle + ONE browser.
// usage: node scripts/stills.mjs <compositionId> <outDir> <frame,frame,...> [propsJson]
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';

const [id, outDir, framesArg, propsJson] = process.argv.slice(2);
const frames = framesArg.split(',').map(Number);
const inputProps = propsJson ? JSON.parse(propsJson) : {};
fs.mkdirSync(outDir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts'), publicDir: path.resolve('public')});
const browser = await openBrowser('chrome', {chromiumOptions: {gl: 'angle'}});
const composition = await selectComposition({serveUrl, id, inputProps, puppeteerInstance: browser, chromiumOptions: {gl: 'angle'}, timeoutInMilliseconds: 240000});
for (const frame of frames) {
  const t = Date.now();
  let output = path.join(outDir, `f${String(frame).padStart(4, '0')}.png`);
  if (fs.existsSync(output)) output = output.replace('.png', `-${Date.now()}.png`);
  await renderStill({serveUrl, composition, frame, output, inputProps, puppeteerInstance: browser, chromiumOptions: {gl: 'angle'}, timeoutInMilliseconds: 240000, overwrite: true});
  console.log(`frame ${frame} -> ${output} in ${Date.now() - t} ms`);
}
await browser.close({silent: true});
