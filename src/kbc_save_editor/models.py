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
    inquiry_code: str
    user_rank: int
    gacha_seeds: dict[str, int]
    values: dict[str, int]
    item_groups: dict[str, list[int]]
    detail_values: list[dict[str, object]]
    detail_lists: list[dict[str, object]]
    labels: dict[str, str]
    categories: dict[str, object]


@dataclass(frozen=True)
class PatchedSave:
    data: bytes
    summary: SaveSummary


@dataclass(frozen=True)
class TransferCodeResult:
    transfer_code: str
    confirmation_code: str
    data: bytes
    summary: SaveSummary
