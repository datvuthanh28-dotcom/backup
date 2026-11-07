from pathlib import Path
from PIL import Image


ROOT = Path("public/image/catalog")
QUALITY = 88


def convert(source: Path) -> Path:
    destination = source.with_suffix(".webp")
    with Image.open(source) as image:
        image.load()
        image.convert("RGB").save(
            destination,
            format="WEBP",
            quality=QUALITY,
            method=6,
        )

    with Image.open(destination) as verification:
        verification.verify()

    return destination


def main() -> None:
    sources = sorted(ROOT.rglob("*.png"))
    converted = []
    for source in sources:
        converted.append((source, convert(source)))

    for source, _ in converted:
        source.unlink()

    print(f"Converted and verified {len(converted)} PNG image(s) to WebP")


if __name__ == "__main__":
    main()
