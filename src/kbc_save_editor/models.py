from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EditableField:
    key: str
    label: str
    getter: str
    setter: str
    min_value: int = 0
    max_value: int = 2_147_483_647


@dataclass(frozen=True)
class SaveSummary:
    country_code: str
    game_version: int
    values: dict[str, int]


@dataclass(frozen=True)
class PatchedSave:
    data: bytes
    summary: SaveSummary
