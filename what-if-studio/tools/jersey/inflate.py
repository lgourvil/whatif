"""Balloon-inflation depth for each jersey face: smooth 0 at the silhouette -> 1 inside. Hem stays open."""
import sys, json, cv2, numpy as np
from scipy import ndimage as ndi
pub = sys.argv[1]
G = 161
meta = json.load(open(f'{pub}/silhouette.json'))
for n in ('front', 'back'):
    a = cv2.imread(f'{pub}/{n}.png', -1)[..., 3]
    a = cv2.resize(a, (a.shape[1] // 4, a.shape[0] // 4), interpolation=cv2.INTER_AREA) > 128
    h, w = a.shape
    ys = np.where(a.any(1))[0]; bot = ys.max()
    ext = np.zeros((h + h // 2, w), bool); ext[:h] = a
    # torso columns of the hem extend downward so the bottom edge is not treated as a closed seam
    hemrow = a[bot - 2]
    ext[bot - 2:, :] |= hemrow[None, :]
    d = ndi.distance_transform_edt(ext)[:h]
    d = cv2.GaussianBlur(d.astype(np.float32), (0, 0), 2.0)
    dmax = 0.27 * w
    x = np.clip(d / dmax, 0, 1)
    z = np.sqrt(1 - (1 - x) ** 2)
    z[~a] = 0
    zg = cv2.resize(z, (G, G), interpolation=cv2.INTER_AREA)[::-1]  # row 0 = v 0 (bottom)
    meta[n]['depth'] = [round(float(v), 3) for v in zg.ravel()]
meta['depthRes'] = G
json.dump(meta, open(f'{pub}/silhouette.json', 'w'))
print('ok')
