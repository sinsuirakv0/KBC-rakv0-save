from __future__ import annotations

import os
import re
from functools import cache
from pathlib import Path

MARKUP_RE = re.compile(r"<@[^>]+>|</>|{{[^}]+}}|{[^}]+}")

FALLBACK_LABELS = {
    "cc": "Country Code",
    "country_code": "Country Code",
    "game_version": "Game Version",
    "current_energy": "Current Energy",
    "rare_seed": "Rare Gacha Seed",
    "normal_seed": "Normal Gacha Seed",
    "event_seed": "Event Gacha Seed",
    "gamatoto.xp": "Gamatoto XP",
    "gamatoto.skin": "Gamatoto Skin",
    "ototo.engineers": "Engineers",
    "ototo.base_materials": "Base Materials",
    "cat_shrine.xp_offering": "Cat Shrine XP",
}

IMPORTANT_KEYS = [
    "inquiry_code",
    "game_version",
    "current_energy",
    "xp",
    "catfood",
    "normal_tickets",
    "rare_tickets",
    "platinum_tickets",
    "legend_tickets",
    "platinum_shards",
    "np",
    "leadership",
    "catamins",
    "catfruit",
    "catseyes",
    "battle_items",
    "base_materials",
    "rare_gatya_seed",
    "normal_gatya_seed",
    "event_gatya_seed",
    "gamatoto_xp",
    "gamatoto_level",
    "engineers",
    "cat_shrine",
    "shrine_xp",
]


def clean_label(value: str) -> str:
    value = MARKUP_RE.sub("", value)
    return " ".join(value.replace("\\n", " ").replace("\\t", " ").split())


@cache
def load_locale_labels() -> dict[str, str]:
    source_path = Path(os.getenv("KBC_BCSFE_JA_LOCALE_PATH", "D:/KBC/bcsfe-ja-locale"))
    files_path = source_path / "files"
    labels: dict[str, str] = {}
    if not files_path.exists():
        return labels

    for path in files_path.rglob("*.properties"):
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or line.startswith(">") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if value.strip():
                labels[key.strip()] = clean_label(value.strip())
    return labels


def humanize_key(key: str) -> str:
    return key.replace("_", " ").replace(".", " / ").strip()


def label_for_key(key: str) -> str:
    labels = load_locale_labels()
    if key in labels:
        return labels[key]
    if key in FALLBACK_LABELS:
        return FALLBACK_LABELS[key]

    last_key = key.rsplit(".", 1)[-1]
    if last_key in labels:
        return labels[last_key]
    if last_key in FALLBACK_LABELS:
        return FALLBACK_LABELS[last_key]
    return humanize_key(key)


def build_display_labels() -> dict[str, str]:
    labels = {key: label_for_key(key) for key in IMPORTANT_KEYS}
    labels.update(
        {
            "rare": label_for_key("rare_gatya_seed"),
            "normal": label_for_key("normal_gatya_seed"),
            "event": label_for_key("event_gatya_seed"),
        }
    )
    return labels
