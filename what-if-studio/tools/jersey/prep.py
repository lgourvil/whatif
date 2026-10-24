"""Build GPU textures for the jersey: aligned 2x colour+alpha, fabric normal map, silhouette extents."""
import sys, json, cv2, numpy as np
from scipy import ndimage as ndi
mdir, out = sys.argv[1], sys.argv[2]
SC = 2  # upscale for close-ups
imgs = {n: cv2.imread(f'{mdir}/{n}.png', -1) for n in ('front', 'back')}
# common canvas: same height for both, horizontally centred on torso centre
def torso_cx(a):
    m = a[..., 3] > 128; ys = np.where(m.any(1))[0]; t, b = ys.min(), ys.max()
    xs = np.where(m[int(t + (b - t) * .55):int(t + (b - t) * .85)])[1]
    return (np.percentile(xs, 1) + np.percentile(xs, 99)) / 2
Ht = max(a.shape[0] for a in imgs.values())
half = int(max(max(torso_cx(a), a.shape[1] - torso_cx(a)) for a in imgs.values())) + 8
W0 = 2 * half
meta = {}
for n, a in imgs.items():
    cx = torso_cx(a)
    canvas = np.zeros((Ht, W0, 4), np.uint8)
    ox = int(round(half - cx)); oy = Ht - a.shape[0]
    canvas[oy:oy + a.shape[0], ox:ox + a.shape[1]] = a
    big = cv2.resize(canvas, (W0 * SC, Ht * SC), interpolation=cv2.INTER_LANCZOS4)
    rgb = big[..., :3].astype(np.float32)
    blur = cv2.GaussianBlur(rgb, (0, 0), 2.0)
    rgb = np.clip(rgb + 0.6 * (rgb - blur), 0, 255)
    al = big[..., 3]
    # bleed colour outward under transparent pixels so mip/filter edges stay dark, not black-fringed
    inv = al < 10
    idx = ndi.distance_transform_edt(inv, return_distances=False, return_indices=True)
    rgb = rgb[idx[0], idx[1]]
    big = np.dstack([rgb.astype(np.uint8), al])
    cv2.imwrite(f'{out}/{n}.png', big)
    # normal map: macro relief from luminance (prints, seams, folds) + fine knit mesh
    lum = cv2.cvtColor(big[..., :3], cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    h = cv2.GaussianBlur(lum, (0, 0), 3.0) * 6.0 + cv2.GaussianBlur(lum, (0, 0), 1.0) * 1.2
    yy, xx = np.mgrid[0:h.shape[0], 0:h.shape[1]].astype(np.float32)
    p = 7.0  # knit cell in texels
    knit = (np.abs(np.sin(np.pi * (xx + yy) / p)) * np.abs(np.sin(np.pi * (xx - yy) / p))) ** 0.5
    h = h + knit * 0.35
    gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3)
    nz = np.ones_like(h) * 1.0
    nrm = np.dstack([-gx, gy, nz]); nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    nm = ((nrm * 0.5 + 0.5) * 255).astype(np.uint8)
    cv2.imwrite(f'{out}/{n}_n.jpg', cv2.cvtColor(nm, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 92])
    # silhouette: per-row L/R and per-column top, in uv (v=0 bottom like three.js)
    m = cv2.resize((canvas[..., 3] > 128).astype(np.uint8), (W0, Ht), interpolation=cv2.INTER_NEAREST) > 0
    R = 128
    rows = []
    for i in range(R):
        y = int((1 - (i + .5) / R) * Ht); xs = np.where(m[min(y, Ht - 1)])[0]
        rows.append([round(xs.min() / W0, 4), round(xs.max() / W0, 4)] if len(xs) else None)
    cols = []
    for j in range(R):
        x = int((j + .5) / R * W0); ys = np.where(m[:, x])[0]
        cols.append([round(1 - ys.min() / Ht, 4), round(1 - ys.max() / Ht, 4)] if len(ys) else None)
    meta[n] = {'rows': rows, 'cols': cols}
meta['aspect'] = W0 / Ht
json.dump(meta, open(f'{out}/silhouette.json', 'w'))
print('canvas', W0 * SC, Ht * SC, 'aspect', W0 / Ht)
