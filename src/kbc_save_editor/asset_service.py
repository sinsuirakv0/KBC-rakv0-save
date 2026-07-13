from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass(frozen=True)
class ImageCut:
    id: int
    x: int
    y: int
    width: int
    height: int
    name: str

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "name": self.name,
        }


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def nyanko_club_asset_dir() -> Path:
    return project_root() / "public" / "assets" / "nyanko-club"


def nyanko_club_image_path() -> Path:
    return nyanko_club_asset_dir() / "img061_00_nyankoClub.png"


def nyanko_club_imgcut_path() -> Path:
    return nyanko_club_asset_dir() / "img061_00_nyankoClub.imgcut"


def nyanko_club_profile_path(cat_id: int, cat_form: int) -> Path:
    return nyanko_club_asset_dir() / "profiles" / f"{cat_id}_{cat_form}.png"


def nyanko_club_layout_dir() -> Path:
    return nyanko_club_asset_dir() / "layout"


def nyanko_club_layout_preset_dir() -> Path:
    return nyanko_club_layout_dir() / "presets" / "nyanko-club"


def nyanko_club_layout_model_path() -> Path:
    return nyanko_club_layout_preset_dir() / "img061_00_nyankoClub-native.mamodel"


LAYOUT_PRESET_ASSETS = {
    "image": "img061_00_nyankoClub.png",
    "imgcut": "img061_00_nyankoClub.imgcut",
    "model": "img061_00_nyankoClub-native.mamodel",
    "number-image": "img001_ja.png",
    "number-imgcut": "img001_ja.imgcut",
    "common-image": "img006_ja.png",
    "common-imgcut": "img006_ja.imgcut",
}


def nyanko_club_layout_preset_asset_path(asset_name: str) -> Path | None:
    filename = LAYOUT_PRESET_ASSETS.get(asset_name)
    if filename is None:
        return None
    return nyanko_club_layout_preset_dir() / filename


def nyanko_club_layout_cut_path(cut_id: int) -> Path | None:
    cuts = get_nyanko_club_cuts()
    if cut_id < 0 or cut_id >= len(cuts):
        return None
    cut = cuts[cut_id]
    if cut.width <= 0 or cut.height <= 0:
        return None
    return nyanko_club_layout_dir() / "cuts" / f"cut-{cut_id:03d}.png"


LAYOUT_REFERENCE_IMAGES = {
    "normal": ("通常会員", "nyanko-club-normal.jpg"),
    "gold": ("ゴールド会員", "nyanko-club-gold.jpg"),
}


LAYOUT_EXTRA_LABELS = {
    "profile-709-0": "会員アイコン 709_0",
    "abyss-medal-174": "ブロンズ勲章",
    "abyss-medal-175": "シルバー勲章",
    "abyss-medal-176": "ゴールド勲章",
    "abyss-medal-177": "プラチナ勲章",
}


def nyanko_club_layout_reference_path(reference_id: str) -> Path | None:
    item = LAYOUT_REFERENCE_IMAGES.get(reference_id)
    if item is None:
        return None
    return nyanko_club_layout_dir() / "references" / item[1]


def nyanko_club_layout_extra_path(asset_id: str) -> Path | None:
    if not re.fullmatch(r"[a-z0-9-]+", asset_id):
        return None
    path = nyanko_club_layout_dir() / "extras" / f"{asset_id}.png"
    return path if path.is_file() else None


def get_nyanko_club_layout_extras() -> list[dict[str, str]]:
    extras_dir = nyanko_club_layout_dir() / "extras"
    if not extras_dir.is_dir():
        return []
    extras = []
    for path in sorted(extras_dir.glob("*.png")):
        asset_id = path.stem
        if re.fullmatch(r"[a-z0-9-]+", asset_id):
            extras.append({"id": asset_id, "label": LAYOUT_EXTRA_LABELS.get(asset_id, asset_id)})
    return extras


def nyanko_club_abyss_medal_path(item_id: int) -> Path | None:
    if item_id not in {174, 175, 176, 177}:
        return None
    return nyanko_club_asset_dir() / "abyss-medals" / f"{item_id}.png"


NYANKO_CLUB_UI_ASSETS = {
    "menu-frame": "img008_ja.png",
    "common-buttons": "img006_ja.png",
    "item-icons": "img060_02.png",
}


def nyanko_club_ui_asset_path(asset_name: str) -> Path | None:
    filename = NYANKO_CLUB_UI_ASSETS.get(asset_name)
    if filename is None:
        return None
    return nyanko_club_asset_dir() / filename


IMG_CUT_ROW_START = re.compile(r"(?<!\d)(\d+),(\d+),(\d+),(\d+)(?:,|$)")


def parse_imgcut(data: str) -> list[ImageCut]:
    lines = [line.strip() for line in data.splitlines() if line.strip()]
    if len(lines) < 4 or lines[0] != "[imgcut]":
        raise ValueError("Invalid imgcut header.")

    try:
        count = int(lines[3])
    except ValueError as exc:
        raise ValueError("Invalid imgcut count.") from exc

    rows: list[tuple[int, int, int, int, str]] = []
    for line in lines[4:]:
        matches = list(IMG_CUT_ROW_START.finditer(line))
        if not matches:
            raise ValueError(f"Invalid imgcut row: {line}")
        for index, match in enumerate(matches):
            name_end = matches[index + 1].start() if index + 1 < len(matches) else len(line)
            x, y, width, height = (int(value) for value in match.groups())
            rows.append((x, y, width, height, line[match.end() : name_end]))

    if len(rows) < count:
        raise ValueError(f"Invalid imgcut count: expected {count}, got {len(rows)}")

    cuts: list[ImageCut] = []
    for cut_id, (x, y, width, height, name) in enumerate(rows[:count]):
        cuts.append(ImageCut(cut_id, x, y, width, height, name))

    return cuts


@lru_cache(maxsize=1)
def get_nyanko_club_cuts() -> list[ImageCut]:
    return parse_imgcut(nyanko_club_imgcut_path().read_text(encoding="utf-8"))


def nyanko_club_assets_available() -> bool:
    return nyanko_club_image_path().is_file() and nyanko_club_imgcut_path().is_file()
