"""Extract frames from WM 3D video and probe its properties."""
import imageio.v3 as iio
import os, json
import numpy as np
from PIL import Image

VIDEO = r"d:\Logo & Intro Video\WM 3D.......mp4"
OUT_DIR = r"c:\Users\choud\Desktop\print-id-craft\print-id-craft\public\hero-frames"
os.makedirs(OUT_DIR, exist_ok=True)

# Probe metadata
meta = iio.immeta(VIDEO)
print("META:", json.dumps({k: str(v) for k, v in meta.items()}, indent=2))

# Count frames first
print("Reading video...")
all_frames = list(iio.imiter(VIDEO))
total = len(all_frames)
print(f"Total frames: {total}")

# We want ~60 evenly distributed frames for smooth scroll-driven playback
TARGET = 60
indices = np.linspace(0, total - 1, TARGET, dtype=int)
print(f"Sampling {TARGET} frames at indices: {indices[:5]}...{indices[-5:]}")

# Determine output size — keep aspect, target ~600px width for web
sample = Image.fromarray(all_frames[0])
src_w, src_h = sample.size
print(f"Source size: {src_w}x{src_h}")
target_w = 600
target_h = int(src_h * target_w / src_w)
print(f"Target size: {target_w}x{target_h}")

# Save as web-optimized webp
saved = 0
for out_i, src_i in enumerate(indices):
    img = Image.fromarray(all_frames[src_i]).convert("RGB")
    img = img.resize((target_w, target_h), Image.LANCZOS)
    out_path = os.path.join(OUT_DIR, f"frame-{out_i:03d}.webp")
    img.save(out_path, format="WEBP", quality=80, method=6)
    saved += 1

# Total size on disk
total_size = sum(os.path.getsize(os.path.join(OUT_DIR, f)) for f in os.listdir(OUT_DIR) if f.endswith(".webp"))
print(f"Saved {saved} frames, total {total_size/1024:.1f} KB ({total_size/saved/1024:.1f} KB avg)")
print("DONE")
