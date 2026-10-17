# Credits — external assets

Every asset is stored locally in `studio/public/` (no remote asset at render time).

| Asset | Path | Source | Licence |
|---|---|---|---|
| HDRIs `sunset`, `night`, `dawn`, `park`, `sky`, `city` (512×256 EXR, DWAB) | `studio/public/hdri/*.exr` | [Poly Haven](https://polyhaven.com/hdris) via the npm package [`@pmndrs/assets@1.7.0`](https://www.npmjs.com/package/@pmndrs/assets) (Poly Haven itself is blocked from the session network; extracted from the package's base64 modules) | CC0 1.0 |
| Fonts Anton 400 (latin, latin-ext) | `studio/public/fonts/anton-*.woff2` | [`@fontsource/anton@5.1.0`](https://www.npmjs.com/package/@fontsource/anton) — Vernon Adams | SIL OFL 1.1 |
| Font Oswald 500/700 (latin) | `studio/public/fonts/oswald-*.woff2` | [`@fontsource/oswald@5.1.0`](https://www.npmjs.com/package/@fontsource/oswald) — Vernon Adams et al. | SIL OFL 1.1 |

Generated in code (no external source): PBR textures (`src/lib/PbrMaterials.ts`), rigged hands (`src/lib/PovHands.tsx`),
bodies (`src/lib/Characters.tsx`), cars (`src/lib/Vehicles.tsx`), soundtrack (`audio/synth.py`).
No CC0 rigged hand model was reachable from the session network (Poly Haven / ambientCG / CDNs blocked), so the hands use the code fallback (option B).
