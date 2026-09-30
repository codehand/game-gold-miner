"""Align a processed RGBA sprite sheet to one shared visible-foot baseline."""

from argparse import ArgumentParser
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cell-size", type=int, required=True)
    parser.add_argument("--foot-bottom", type=int, required=True)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    size = args.cell_size
    if size <= 0 or source.width % size or source.height % size:
        parser.error("Input must be a grid of complete square cells.")
    if not 0 < args.foot_bottom < size:
        parser.error("Foot baseline must leave transparent room inside the cell.")

    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    for top in range(0, source.height, size):
        for left in range(0, source.width, size):
            frame = source.crop((left, top, left + size, top + size))
            bbox = frame.getchannel("A").getbbox()
            if bbox is None:
                parser.error(f"Empty frame at ({left // size}, {top // size}).")
            shift_y = args.foot_bottom - bbox[3]
            if bbox[1] + shift_y < 1 or bbox[3] + shift_y >= size:
                parser.error(f"Foot alignment would clip frame at ({left // size}, {top // size}).")
            output.paste(frame, (left, top + shift_y))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.output)


if __name__ == "__main__":
    main()
