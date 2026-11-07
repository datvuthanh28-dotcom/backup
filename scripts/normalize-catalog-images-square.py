from pathlib import Path
from PIL import Image, ImageStat


TARGET = 1254
SAFE_AREA = 0.92
ROOT = Path("public/image/catalog")


def background_color(image: Image.Image) -> tuple[int, int, int]:
    rgb = image.convert("RGB")
    w, h = rgb.size
    sample = max(8, min(w, h) // 20)
    corners = [
        rgb.crop((0, 0, sample, sample)),
        rgb.crop((w - sample, 0, w, sample)),
        rgb.crop((0, h - sample, sample, h)),
        rgb.crop((w - sample, h - sample, w, h)),
    ]
    values = [ImageStat.Stat(corner).median for corner in corners]
    return tuple(round(sum(value[channel] for value in values) / len(values)) for channel in range(3))


def normalize(path: Path) -> bool:
    with Image.open(path) as source:
        source.load()
        if source.width == source.height == TARGET:
            return False

        image = source.convert("RGB")
        limit = round(TARGET * SAFE_AREA)
        scale = min(limit / image.width, limit / image.height)
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        contained = image.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (TARGET, TARGET), background_color(image))
        position = ((TARGET - size[0]) // 2, (TARGET - size[1]) // 2)
        canvas.paste(contained, position)

        temporary = path.with_suffix(path.suffix + ".tmp")
        canvas.save(temporary, format="PNG", optimize=True)
        temporary.replace(path)
        return True


def main() -> None:
    changed = []
    for path in sorted(ROOT.rglob("*.png")):
        with Image.open(path) as image:
            needs_normalization = image.width != image.height or image.width != TARGET
        if needs_normalization and normalize(path):
            changed.append(path)

    print(f"Normalized {len(changed)} image(s) to {TARGET}x{TARGET}")
    for path in changed:
        print(path)


if __name__ == "__main__":
    main()
