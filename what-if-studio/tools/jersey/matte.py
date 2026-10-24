import sys, cv2, numpy as np
from scipy import ndimage as ndi
src, outdir = sys.argv[1], sys.argv[2]
img = cv2.imread(src)
H, W = img.shape[:2]
# find split row: darkest horizontal band near middle
rows = img[int(H*0.4):int(H*0.6)].mean(axis=(1,2))
split = int(H*0.4) + int(np.argmin(rows))
print('split', split)
for name, (y0, y1) in {'front': (0, split), 'back': (split, H)}.items():
    im = img[y0:y1].copy()
    h, w = im.shape[:2]
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    S = hsv[...,1].astype(float); V = hsv[...,2].astype(float); Hh = hsv[...,0].astype(float)
    warm = ((Hh < 35) & (S > 110) & (V > 70)) | (V > 235)
    mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    rect_fg = np.zeros((h, w), bool)
    # jersey occupies roughly x in [0.1,0.9]
    mask[warm] = cv2.GC_BGD
    cx0, cx1 = int(w*0.33), int(w*0.67)
    mask[int(h*0.25):int(h*0.80), cx0:cx1] = cv2.GC_FGD
    nonwarm = ~warm
    mask[(nonwarm) & (mask == cv2.GC_PR_BGD)] = cv2.GC_PR_FGD
    mask[:, :int(w*0.04)] = cv2.GC_BGD; mask[:, -int(w*0.04):] = cv2.GC_BGD
    mask[:int(h*0.03)] = cv2.GC_BGD
    bg = np.zeros((1,65),np.float64); fg = np.zeros((1,65),np.float64)
    cv2.grabCut(im, mask, None, bg, fg, 6, cv2.GC_INIT_WITH_MASK)
    m = np.isin(mask, [cv2.GC_FGD, cv2.GC_PR_FGD])
    lab, n = ndi.label(m); sizes = ndi.sum(m, lab, range(1, n+1))
    m = lab == (1 + int(np.argmax(sizes)))
    m = ndi.binary_fill_holes(m)
    m = ndi.binary_opening(m, iterations=2)
    # cut floor reflection: below 80% height, rows that shrink sharply are pedestal
    ys_ = np.where(m.any(1))[0]; top, bot = ys_.min(), ys_.max()
    widths = m.sum(1).astype(float)
    ref = np.median(widths[int(top+(bot-top)*0.6):int(top+(bot-top)*0.8)])
    for y in range(int(top+(bot-top)*0.8), bot+1):
        if widths[y] < ref*0.8:
            m[y:] = False; break
    # symmetry repair: union with mirror around torso centre
    ys_ = np.where(m.any(1))[0]; top, bot = ys_.min(), ys_.max()
    band = m[int(top+(bot-top)*0.5):int(top+(bot-top)*0.85)]
    xs_ = np.where(band)[1]; cx = (np.percentile(xs_,1)+np.percentile(xs_,99))/2
    sh = int(round(2*cx - (w-1)))
    mir = np.roll(m[:, ::-1], sh, axis=1)
    if sh > 0: mir[:, :sh] = False
    elif sh < 0: mir[:, sh:] = False
    grow = mir & ~m
    m = m | mir
    # smooth outline
    m = ndi.binary_closing(m, structure=np.ones((9,9)))
    m = cv2.GaussianBlur(m.astype(np.float32), (0,0), 3.0) > 0.5
    m = ndi.binary_fill_holes(m)
    # recolour reclaimed + edge band from interior
    fix = (grow | (m & ndi.binary_dilation(~m, iterations=10))).astype(np.uint8)*255
    fix &= m.astype(np.uint8)*255
    hsv2 = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    hot = ((hsv2[...,1] > 80) & (hsv2[...,0] < 35)).astype(np.uint8)*255
    fix = np.maximum(fix & ndi.binary_dilation(hot>0, iterations=2).astype(np.uint8)*255, grow.astype(np.uint8)*255)
    im = cv2.inpaint(im, fix, 7, cv2.INPAINT_TELEA)
    lab, n = ndi.label(m); sizes = ndi.sum(m, lab, range(1, n+1)); m = lab == (1 + int(np.argmax(sizes)))
    a = cv2.GaussianBlur(m.astype(np.float32), (0,0), 1.2)
    a = np.clip((a - 0.5) * 2.2 + 0.5, 0, 1)
    # despill: pull warm tint out of edge pixels
    b, g, r = [im[...,i].astype(float) for i in range(3)]
    lum = 0.11*b + 0.59*g + 0.3*r
    edge = (a < 0.999) | ndi.binary_dilation(~m, iterations=6)
    for c in (0,1,2):
        ch = im[...,c].astype(float)
        im[...,c] = np.where(edge, np.minimum(ch, lum*1.02 + 4), ch).astype(np.uint8)
    # jersey is achromatic: any warm/saturated pixel is fire spill -> dark neutral
    hsv3 = cv2.cvtColor(im, cv2.COLOR_BGR2HSV).astype(float)
    lum3 = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(float)
    spill = np.clip((hsv3[...,1] - 35) / 60, 0, 1)
    dark = np.minimum(lum3 * 0.35, 38)
    for c in (0,1,2):
        ch = im[...,c].astype(float)
        im[...,c] = (ch*(1-spill) + dark*spill).astype(np.uint8)
    ys, xs = np.where(a > 0.05)
    pad = 12
    Y0, Y1 = max(ys.min()-pad,0), min(ys.max()+pad,h); X0, X1 = max(xs.min()-pad,0), min(xs.max()+pad,w)
    rgba = np.dstack([im, (a*255).astype(np.uint8)])[Y0:Y1, X0:X1]
    cv2.imwrite(f'{outdir}/{name}.png', rgba)
    print(name, rgba.shape, 'bbox', X0, Y0+y0, X1, Y1+y0)
