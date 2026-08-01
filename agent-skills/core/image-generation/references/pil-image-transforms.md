# PIL Image Transforms (fallback for image_generate)

The active `image_generate` backend is text-to-image only. When the user asks
to modify an existing photo (colour boost, illustration, filter), use PIL + numpy
via `/opt/hermes/.venv/bin/python3`.

## Environment

```bash
# Pillow is already in the venv. Install numpy if missing:
/opt/hermes/.venv/bin/pip install numpy -q
```

## 1. Saturation / Colour Boost

```python
from PIL import Image, ImageEnhance
import numpy as np

img = Image.open('input.jpg').convert('RGB')

# Step 1: PIL Color enhancer (2.5x)
img_s = ImageEnhance.Color(img).enhance(2.5)

# Step 2: HSV channel manipulation for finer control
h, s, v = img_s.convert('HSV').split()
s = s.point(lambda x: min(255, int(x * 1.4)))   # +40% saturation
v = v.point(lambda x: min(255, int(x * 1.15)))  # +15% brightness
img_vibrant = Image.merge('HSV', (h, s, v)).convert('RGB')

# Step 3: Slight contrast + sharpness
img_final = ImageEnhance.Contrast(img_vibrant).enhance(1.15)
img_final = ImageEnhance.Sharpness(img_final).enhance(1.1)

img_final.save('output.jpg', quality=95)
```

**Typical result:** Saturation mean ~60 -> ~128, 99% pixels changed.

## 2. Illustration / Cartoon Effect

```python
from PIL import Image, ImageEnhance, ImageFilter
import numpy as np

img = Image.open('input.jpg').convert('RGB')

# 1. Enhance colours
img_c = ImageEnhance.Color(img).enhance(2.0)
img_c = ImageEnhance.Contrast(img_c).enhance(1.3)

# 2. Smooth noise
img_smooth = img_c.filter(ImageFilter.MedianFilter(size=5))

# 3. Posterize (6 levels)
arr = np.array(img_smooth)
levels = 6
arr_post = (arr // (255 // levels)) * (255 // levels)
arr_post = np.clip(arr_post, 0, 255).astype(np.uint8)
img_post = Image.fromarray(arr_post)

# 4. Edge detection
gray = img_smooth.convert('L')
edges = gray.filter(ImageFilter.FIND_EDGES)
edges_arr = np.array(edges)
edges_strong = np.where(edges_arr > 40, 0, 255).astype(np.uint8)
edges_img = Image.fromarray(edges_strong).convert('RGB')

# 5. Composite: posterized fill + dark outlines
arr_final = np.array(img_post).astype(int)
arr_edges = np.array(edges_img).astype(int)
edge_mask = (arr_edges < 128)
arr_final[edge_mask] = arr_final[edge_mask] * 0.3
arr_final = np.clip(arr_final, 0, 255).astype(np.uint8)
img_ill = Image.fromarray(arr_final)

# 6. Final boosts
img_ill = ImageEnhance.Color(img_ill).enhance(1.4)
img_ill = ImageEnhance.Contrast(img_ill).enhance(1.2)

# 7. Oil painting effect
img_final = img_ill.filter(ImageFilter.ModeFilter(size=5))

img_final.save('output.jpg', quality=95)
```

**Key parameters to tune:**
- `levels` (posterize): 4 = very stylized, 8 = more realistic
- edge threshold: 30 = more edges, 60 = fewer/cleaner edges
- `edge_mask` darkening factor: 0.3 = strong outlines, 0.6 = subtle

## 3. Verifying an Edit Was Applied

When the user is skeptical ("are you sure you changed it?"):

```python
from PIL import Image
import numpy as np
import os

orig = Image.open('/opt/data/cache/images/img_XXXX.jpg')
edited = Image.open('/opt/marketing-planner/client/assets/filename.jpg')

a_o = np.array(orig.convert('HSV'))
a_e = np.array(edited.convert('HSV'))

print(f'Saturation: {a_o[:,:,1].mean():.1f} -> {a_e[:,:,1].mean():.1f}')
print(f'Brightness: {a_o[:,:,2].mean():.1f} -> {a_e[:,:,2].mean():.1f}')
print(f'File size:  {os.path.getsize(orig_path):,} -> {os.path.getsize(edited_path):,} bytes')

# Pixel diff on downscaled
r_o = np.array(orig.resize((100,100))).astype(int)
r_e = np.array(edited.resize((100,100))).astype(int)
diff = np.abs(r_o - r_e).mean()
changed = (np.abs(r_o - r_e).sum(axis=2) > 10).mean() * 100
print(f'Pixel diff: {diff:.1f}, {changed:.0f}% pixels changed')
```

Report the numbers directly -- measurable proof beats "yes I did it."

## Pitfalls

- **Do NOT install tesseract/OCR** to "see" what's in a user-provided image
  before posting it. The user already knows what it is. Just post it.
- **Write scripts to a writable path** (e.g. `/opt/data/script.py`), not `/tmp/`
  which may be protected by the cross-profile guard.
- **The venv python is `/opt/hermes/.venv/bin/python3`** -- system python3 does
  not have PIL/numpy installed.
- **Background `&` in shell commands is rejected** in foreground terminal --
  write a script file and run it instead of inlining complex Python in `-c`.
