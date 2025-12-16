import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

"""
Images -> grayscale numbers (0–255)
width  -> frequency axis
height -> time axis (within each image)
time   -> image index (stacked slices)
pixel  -> signal power (intensity)
"""


def load_image_as_u8(path: Path, target_size: tuple[int, int] | None) -> np.ndarray:
    """
    Load an image and convert it to grayscale uint8 (0–255).
    If target_size is provided, resize to (width, height).
    """
    img = Image.open(path).convert("L")

    if target_size is not None:
        img = img.resize(target_size, Image.BILINEAR)

    arr = np.asarray(img, dtype=np.uint8)
    return arr


def main(input_dir: Path, output_dir: Path, max_images: int):
    if not input_dir.exists():
        raise RuntimeError(f"Input directory does not exist: {input_dir}")

    candidates = sorted([p for p in input_dir.rglob("*") if p.is_file()])

    if not candidates:
        raise RuntimeError("No files found in input directory.")

    # Find the first valid image so we can set a reference size.
    reference_path = None
    reference_img = None
    for p in candidates:
        try:
            reference_img = Image.open(p).convert("L")
            reference_path = p
            break
        except Exception:
            continue

    if reference_img is None or reference_path is None:
        raise RuntimeError(
            "No valid image files could be opened. "
            "Your folder may contain non-image files or corrupted images."
        )

    target_size = reference_img.size 
    print(f"Reference image: {reference_path.name}")
    print(f"Target size (width, height): {target_size}")

    # resize to target_size.
    slices = []
    used_paths = []

    for p in candidates:
        if len(slices) >= max_images:
            break

        try:
            arr = load_image_as_u8(p, target_size=target_size)
            slices.append(arr)
            used_paths.append(p)
        except Exception:
            continue

    if not slices:
        raise RuntimeError("No images were successfully loaded after filtering.")

    print(f"Using {len(slices)} images")

    # Stack images along time axis
    volume = np.stack(slices, axis=0)

    T, H, W = volume.shape
    print(f"Volume shape: time={T}, height={H}, width={W}")

    flat = volume.reshape(-1)

    output_dir.mkdir(parents=True, exist_ok=True)

    # Write binary file
    bin_path = output_dir / "power_u8.bin"
    flat.tofile(bin_path)

    # Metadata 
    meta = {
        "shape": {"time": int(T), "height": int(H), "width": int(W)},
        "dtype": "uint8",
        "value_range": [0, 255],
        "source": {
            "input_dir": str(input_dir),
            "reference_image": reference_path.name,
            "used_images": [p.name for p in used_paths]
        },
        "axes": {
            "x": "frequency_bins (image width)",
            "z": "time (image index + row index)",
            "y": "power (pixel intensity)"
        }
    }

    meta_path = output_dir / "meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print("Wrote:")
    print(f"  {bin_path}")
    print(f"  {meta_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-images", type=int, default=10)

    args = parser.parse_args()
    main(args.input, args.output, args.max_images)
