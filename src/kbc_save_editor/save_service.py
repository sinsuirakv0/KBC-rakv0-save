from __future__ import annotations

from collections.abc import Mapping

from bcsfe import core

from kbc_save_editor.bcsfe_runtime import initialize_bcsfe
from kbc_save_editor.labels import build_display_labels, label_for_key
from kbc_save_editor.models import (
    EditableField,
    PatchedSave,
    SaveSummary,
    TransferCodeResult,
)

EDITABLE_FIELDS: dict[str, EditableField] = {
    "xp": EditableField("xp", "XP", "get_xp", "set_xp"),
    "catfood": EditableField("catfood", "Cat Food", "get_catfood", "set_catfood"),
    "normal_tickets": EditableField(
        "normal_tickets", "Normal Tickets", "get_normal_tickets", "set_normal_tickets"
    ),
    "rare_tickets": EditableField(
        "rare_tickets", "Rare Tickets", "get_rare_tickets", "set_rare_tickets"
    ),
    "platinum_tickets": EditableField(
        "platinum_tickets", "Platinum Tickets", "get_platinum_tickets", "set_platinum_tickets"
    ),
    "legend_tickets": EditableField(
        "legend_tickets", "Legend Tickets", "get_legend_tickets", "set_legend_tickets"
    ),
    "platinum_shards": EditableField(
        "platinum_shards", "Platinum Shards", "get_platinum_shards", "set_platinum_shards"
    ),
    "np": EditableField("np", "NP", "get_np", "set_np"),
    "leadership": EditableField(
        "leadership", "Leadership", "get_leadership", "set_leadership"
    ),
}

SUMMARY_VALUE_FIELDS = {
    "current_energy": "Current Energy",
}

EVENT_GATYA_ITEM_IDS = (
    23,
    24,
    25,
    26,
    27,
    28,
    45,
    46,
    47,
    48,
    49,
    75,
    111,
    137,
    158,
    162,
    163,
    185,
    166,
    172,
    173,
    178,
    185,
    200,
    195,
    163,
    196,
    198,
    199,
    202,
    178,
    203,
    204,
    205,
    206,
    199,
    208,
    213,
    214,
    215,
    216,
    220,
    221,
    220,
    227,
    231,
    235,
    242,
    243,
    248,
    255,
    259,
    267,
)

INVENTORY_ITEM_GROUP_IDS = {
    "resources": (22, 7, 157, 6),
    "tickets": (20, 21, 29, 145, 155, 156, 212),
    "battle_items": (0, 1, 2, 3, 4, 5),
    "catamins": (55, 56, 57),
    "base_materials": (
        85,
        86,
        87,
        88,
        89,
        90,
        91,
        140,
        187,
        188,
        189,
        190,
        191,
        192,
        193,
        194,
        92,
    ),
    "matatabi": (
        30,
        31,
        32,
        33,
        34,
        43,
        160,
        41,
        35,
        36,
        37,
        38,
        39,
        40,
        161,
        42,
        164,
        44,
    ),
    "beast_stones": (
        167,
        168,
        169,
        170,
        171,
        184,
        179,
        180,
        181,
        182,
        183,
    ),
    "catseyes": (50, 51, 52, 53, 54, 58),
    "abyss_medals": (174, 175, 176, 177),
    "treasure_chests": (
        209,
        210,
        211,
        217,
        218,
        219,
        224,
        225,
        226,
        228,
        229,
        230,
        232,
        233,
        234,
        236,
        237,
        238,
        239,
        240,
        241,
        244,
        245,
        246,
        249,
        250,
        251,
        252,
        253,
        254,
        256,
        257,
        258,
        261,
        262,
        263,
        264,
        265,
        266,
    ),
}

SPECIAL_ITEM_VALUE_KEYS = {
    6: "xp",
    7: "np",
    20: "normal_tickets",
    21: "rare_tickets",
    22: "catfood",
    29: "platinum_tickets",
    105: "leadership",
    145: "legend_tickets",
    157: "platinum_shards",
}

DETAIL_SKIP_KEYS = {
    "password_refresh_token",
    "transfer_code",
    "confirmation_code",
    "cats",
    "lineups",
    "story",
    "event_stages",
    "item_reward_stages",
    "timed_score_stages",
    "ex_stages",
    "dojo",
    "outbreaks",
    "unlock_popups",
    "tower",
    "missions",
    "challenge",
    "map_resets",
    "uncanny",
    "catamin_stages",
    "legend_quest",
    "gauntlets",
    "enigma_clears",
    "enigma",
    "collab_gauntlets",
    "behemoth_culling",
    "zero_legends",
    "dojo_chapters",
}


class SaveEditorError(Exception):
    pass


class InvalidChangeError(SaveEditorError):
    pass


class SaveLoadError(SaveEditorError):
    pass


class TransferDownloadError(SaveEditorError):
    pass


class TransferCodeCreateError(SaveEditorError):
    pass


def load_save(data: bytes, country_code: str | None = None) -> core.SaveFile:
    initialize_bcsfe()
    cc = core.CountryCode.from_code(country_code) if country_code else None
    try:
        return core.SaveFile(core.Data(data), cc)
    except Exception as exc:
        raise SaveLoadError(str(exc)) from exc


def build_summary(save_file: core.SaveFile) -> SaveSummary:
    values: dict[str, int] = {
        key: int(getattr(save_file, key, 0)) for key in SUMMARY_VALUE_FIELDS
    }
    detail_values, detail_lists = build_detail_data(save_file)
    for key, field in EDITABLE_FIELDS.items():
        getter = getattr(save_file, field.getter, None)
        if getter is None:
            values[key] = int(getattr(save_file, key, 0))
        else:
            values[key] = int(getter())

    return SaveSummary(
        country_code=save_file.cc.get_code(),
        game_version=int(save_file.game_version.game_version),
        inquiry_code=str(getattr(save_file, "inquiry_code", "")),
        user_rank=int(save_file.calculate_user_rank()),
        gacha_seeds=build_gacha_seeds(save_file),
        values=values,
        item_groups=build_item_groups(save_file),
        detail_values=detail_values,
        detail_lists=detail_lists,
        labels=build_display_labels(),
        categories=build_categories(save_file, values),
    )


def format_play_time(frames: int, capped: bool = False) -> str:
    total_minutes = max(0, int(frames)) // 30 // 60
    hours, minutes = divmod(total_minutes, 60)
    if capped and hours >= 10_000:
        hours, minutes = 9_999, 59
    return f"{hours}:{minutes:02}"


def count_nonzero(values: list[object]) -> int:
    return sum(1 for value in values if bool(value))


def count_nyanko_club_cat_guide(
    save_file: core.SaveFile,
    cats: list[object],
) -> tuple[int, int]:
    try:
        obtainable_cats = save_file.cats.get_cats_obtainable(save_file)
        if obtainable_cats is not None:
            return count_nonzero(
                [cat.unlocked for cat in obtainable_cats]
            ), len(obtainable_cats)
    except Exception:
        pass

    return count_nonzero(
        [getattr(cat, "catguide_collected", False) for cat in cats]
    ), len(cats)


def count_enemy_guide(save_file: core.SaveFile, enemies: list[object]) -> tuple[int, int]:
    try:
        valid_ids = core.EnemyDictionary(save_file).get_valid_enemies()
        if valid_ids is not None:
            seen = sum(
                1
                for enemy_id in valid_ids
                if 0 <= enemy_id < len(enemies) and int(enemies[enemy_id]) > 0
            )
            return seen, len(valid_ids)
    except Exception:
        pass

    return count_nonzero(enemies), len(enemies)


def build_gold_pass_summary(gold_pass: object | None) -> dict[str, object]:
    if gold_pass is None:
        return {
            "is_gold_member": False,
            "login_bonus_days": 0,
            "next_purchase_purchased": False,
            "next_purchase_visible": False,
            "expiry_epoch": None,
        }

    claimed_rewards = getattr(gold_pass, "claimed_rewards", {}) or {}
    if not isinstance(claimed_rewards, dict):
        claimed_rewards = {}

    total_renewal_times = int(getattr(gold_pass, "total_renewal_times", 0) or 0)
    start_date_now = float(getattr(gold_pass, "start_date_now", 0.0) or 0.0)
    end_date_now = float(getattr(gold_pass, "end_date_now", 0.0) or 0.0)
    start_date_next = float(getattr(gold_pass, "start_date_next", 0.0) or 0.0)
    end_date_next = float(getattr(gold_pass, "end_date_next", 0.0) or 0.0)
    login_bonus_days = len(claimed_rewards)
    has_next_purchase = total_renewal_times >= 2 and start_date_next > 0 and end_date_next > 0

    return {
        "is_gold_member": total_renewal_times > 0 and start_date_now > 0 and end_date_now > 0,
        "login_bonus_days": login_bonus_days,
        "next_purchase_purchased": has_next_purchase,
        "next_purchase_visible": has_next_purchase,
        "expiry_epoch": end_date_now if end_date_now > 0 else None,
        "total_renewal_times": total_renewal_times,
    }


def build_gamatoto_summary(save_file: core.SaveFile) -> dict[str, object]:
    gamatoto = save_file.gamatoto
    level: int | None = None
    try:
        level_data = core.core_data.get_gamatoto_levels(save_file).get_level_from_xp(
            int(gamatoto.xp)
        )
        if level_data is not None:
            level = int(level_data.level)
    except Exception:
        level = None

    is_exploring = float(gamatoto.remaining_seconds) > 0 and not gamatoto.return_flag
    helpers = [
        int(helper.id)
        for helper in gamatoto.helpers.helpers
        if helper.is_valid()
    ]
    return {
        "status": "exploring" if is_exploring else "waiting",
        "remaining_seconds": max(0, int(gamatoto.remaining_seconds)),
        "zone_remaining": max(0, int(gamatoto.recon_length)),
        "xp": int(gamatoto.xp),
        "level": level,
        "helpers": helpers,
        "helper_count": len(helpers),
    }


def resolve_event_item_amount(
    category: int,
    index: int,
    event_capsules: list[int],
    lucky_tickets: list[int],
    event_capsules_2: list[int],
) -> int | None:
    values_by_category = {
        1: event_capsules,
        8: lucky_tickets,
        10: event_capsules_2,
    }
    values = values_by_category.get(category)
    if values is None or index < 0 or index >= len(values):
        return None
    return int(values[index])


def build_event_gatya_items(save_file: core.SaveFile) -> list[dict[str, object]]:
    event_capsules = [int(value) for value in save_file.event_capsules]
    lucky_tickets = [int(value) for value in save_file.lucky_tickets]
    event_capsules_2 = [int(value) for value in save_file.event_capsules_2]

    try:
        item_buy = core.core_data.get_gatya_item_buy(save_file)
        item_names = core.core_data.get_gatya_item_names(save_file)
    except Exception:
        return [
            {
                "event_gatya_id": event_gatya_id,
                "item_id": item_id,
                "name": f"Item {item_id}",
                "amount": None,
            }
            for event_gatya_id, item_id in enumerate(EVENT_GATYA_ITEM_IDS)
        ]

    items: list[dict[str, object]] = []
    for event_gatya_id, item_id in enumerate(EVENT_GATYA_ITEM_IDS):
        item = item_buy.get(item_id)
        if item is None:
            items.append(
                {
                    "event_gatya_id": event_gatya_id,
                    "item_id": item_id,
                    "name": f"Item {item_id}",
                    "amount": None,
                }
            )
            continue

        category = int(item.category)
        index = int(item.index)
        items.append(
            {
                "event_gatya_id": event_gatya_id,
                "item_id": item_id,
                "name": str(item_names.get_name(item_id) or f"Item {item_id}"),
                "amount": resolve_event_item_amount(
                    category,
                    index,
                    event_capsules,
                    lucky_tickets,
                    event_capsules_2,
                ),
                "category": category,
                "index": index,
            }
        )
    return items


def build_inventory_sources(
    save_file: core.SaveFile,
    ototo_data: dict[str, object],
) -> dict[int, list[int]]:
    return {
        1: [int(value) for value in save_file.event_capsules],
        3: [int(item.amount) for item in save_file.battle_items.items],
        4: [int(value) for value in getattr(save_file, "catfruit", [])],
        5: [int(value) for value in getattr(save_file, "catseyes", [])],
        6: [int(value) for value in getattr(save_file, "catamins", [])],
        7: [int(value) for value in ototo_data.get("base_materials", [])],
        8: [int(value) for value in save_file.lucky_tickets],
        10: [int(value) for value in save_file.event_capsules_2],
        11: [int(value) for value in getattr(save_file, "labyrinth_medals", [])],
        12: [int(value) for value in getattr(save_file, "treasure_chests", [])],
    }


def build_special_item_values(
    save_file: core.SaveFile,
    values: dict[str, int],
    ototo: object,
) -> dict[int, int]:
    item_values = {
        item_id: values.get(key, 0)
        for item_id, key in SPECIAL_ITEM_VALUE_KEYS.items()
    }
    item_values[92] = int(getattr(ototo, "engineers", 0))
    item_values[212] = int(getattr(save_file, "hundred_million_ticket", 0))
    return item_values


def resolve_inventory_item_amount(
    item_id: int,
    category: int | None,
    index: int | None,
    inventory_sources: dict[int, list[int]],
    special_item_values: dict[int, int],
) -> int | None:
    if item_id in special_item_values:
        return int(special_item_values[item_id])
    if category is None or index is None:
        return None
    values = inventory_sources.get(category)
    if values is None or index < 0 or index >= len(values):
        return None
    return int(values[index])


def build_inventory_items(
    item_ids: tuple[int, ...],
    item_buy: object | None,
    item_names: object | None,
    inventory_sources: dict[int, list[int]],
    special_item_values: dict[int, int],
) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for item_id in item_ids:
        item = item_buy.get(item_id) if item_buy is not None else None
        category = int(item.category) if item is not None else None
        index = int(item.index) if item is not None else None
        name = (
            str(item_names.get_name(item_id) or f"Item {item_id}")
            if item_names is not None
            else f"Item {item_id}"
        )
        items.append(
            {
                "item_id": item_id,
                "name": name,
                "amount": resolve_inventory_item_amount(
                    item_id,
                    category,
                    index,
                    inventory_sources,
                    special_item_values,
                ),
                "category": category,
                "index": index,
            }
        )
    return items


def build_inventory_groups(
    save_file: core.SaveFile,
    values: dict[str, int],
    ototo: object,
    ototo_data: dict[str, object],
) -> dict[str, list[dict[str, object]]]:
    inventory_sources = build_inventory_sources(save_file, ototo_data)
    special_item_values = build_special_item_values(save_file, values, ototo)
    try:
        item_buy = core.core_data.get_gatya_item_buy(save_file)
        item_names = core.core_data.get_gatya_item_names(save_file)
    except Exception:
        item_buy = None
        item_names = None

    return {
        key: build_inventory_items(
            item_ids,
            item_buy,
            item_names,
            inventory_sources,
            special_item_values,
        )
        for key, item_ids in INVENTORY_ITEM_GROUP_IDS.items()
    }


def build_categories(
    save_file: core.SaveFile, values: dict[str, int]
) -> dict[str, object]:
    cats = list(save_file.cats.cats)
    enemies = list(getattr(save_file, "enemy_guide", []))
    medals = list(getattr(save_file.medals, "medal_data_1", []))
    talent_orbs = list(getattr(save_file.talent_orbs, "orbs", {}).values())
    play_time_frames = int(getattr(save_file.officer_pass, "play_time", 0))
    gold_pass = getattr(save_file.officer_pass, "gold_pass", None)
    member_number = int(
        getattr(gold_pass, "officer_id", -1)
    )
    ototo = save_file.ototo
    ototo_data = ototo.serialize()
    catfruit = [int(value) for value in getattr(save_file, "catfruit", [])]
    labyrinth_medals = [
        int(value) for value in getattr(save_file, "labyrinth_medals", [])
    ]
    inventory_groups = build_inventory_groups(save_file, values, ototo, ototo_data)
    cat_guide_count, cat_guide_total = count_nyanko_club_cat_guide(save_file, cats)
    enemy_guide_count, enemy_guide_total = count_enemy_guide(save_file, enemies)

    return {
        "user_status": {
            "energy_current": int(getattr(save_file, "current_energy", 0)),
            "energy_max": None,
            "hundred_million_ticket": int(
                getattr(save_file, "hundred_million_ticket", 0)
            ),
            "resources": {
                key: values.get(key, 0)
                for key in ("catfood", "xp", "np", "platinum_shards")
            },
            "tickets": {
                key: values.get(key, 0)
                for key in (
                    "normal_tickets",
                    "rare_tickets",
                    "platinum_tickets",
                    "legend_tickets",
                )
            },
        },
        "allies": {
            "unlocked": count_nonzero([cat.unlocked for cat in cats]),
            "total": len(cats),
        },
        "enemies": {
            "unlocked": enemy_guide_count,
            "total": enemy_guide_total,
            "raw_total": len(enemies),
        },
        "talent_orbs": {
            "types": len(talent_orbs),
            "total": sum(max(0, int(getattr(orb, "value", 0))) for orb in talent_orbs),
        },
        "special_talent_orbs": {"types": 0, "total": 0, "pending": True},
        "event_items": {
            "items": build_event_gatya_items(save_file),
            "event_capsules": [int(value) for value in save_file.event_capsules],
            "lucky_tickets": [int(value) for value in save_file.lucky_tickets],
            "event_capsules_2": [int(value) for value in save_file.event_capsules_2],
        },
        "treasure_chests": [
            int(value) for value in getattr(save_file, "treasure_chests", [])
        ],
        "inventory_groups": inventory_groups,
        "gamatoto": build_gamatoto_summary(save_file),
        "ototo": {
            "status": (
                "developing"
                if float(ototo.remaining_seconds) > 0 and not ototo.return_flag
                else "waiting"
            ),
            "remaining_seconds": max(0, int(ototo.remaining_seconds)),
            "engineers": int(ototo.engineers),
        },
        "account": {
            "play_time": format_play_time(play_time_frames),
            "play_time_frames": play_time_frames,
            "member_number": member_number,
            "is_banned": bool(getattr(save_file, "show_ban_message", False)),
        },
        "medals": {"owned": len(set(medals)), "ids": medals},
        "nyanko_club": {
            "play_time": format_play_time(play_time_frames, capped=True),
            "cat_guide": cat_guide_count,
            "cat_guide_total": cat_guide_total,
            "enemy_guide": enemy_guide_count,
            "enemy_guide_total": enemy_guide_total,
            "member_number": member_number,
            "profile_cat_id": int(getattr(save_file.officer_pass, "cat_id", -1)),
            "profile_cat_form": int(getattr(save_file.officer_pass, "cat_form", 0)),
            "medal_count": len(set(medals)),
            "abyss_medals": labyrinth_medals,
            "gold_pass": build_gold_pass_summary(gold_pass),
        },
        "item_groups": {
            "matatabi": catfruit[:18],
            "beast_stones": catfruit[18:],
            "abyss_medals": labyrinth_medals,
        },
    }


def build_gacha_seeds(save_file: core.SaveFile) -> dict[str, int]:
    return {
        "rare": int(getattr(save_file.gatya, "rare_seed", 0)),
        "normal": int(getattr(save_file.gatya, "normal_seed", 0)),
        "event": int(getattr(save_file.gatya, "event_seed", 0)),
    }


def build_item_groups(save_file: core.SaveFile) -> dict[str, list[int]]:
    ototo = save_file.ototo.serialize()
    return {
        "battle_items": [int(item.amount) for item in save_file.battle_items.items],
        "catfruit": [int(value) for value in getattr(save_file, "catfruit", [])],
        "catseyes": [int(value) for value in getattr(save_file, "catseyes", [])],
        "catamins": [int(value) for value in getattr(save_file, "catamins", [])],
        "base_materials": [int(value) for value in ototo.get("base_materials", [])],
    }


def is_scalar(value: object) -> bool:
    return isinstance(value, (str, int, float, bool)) or value is None


def scalar_type(value: object) -> str:
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if value is None:
        return "none"
    return "str"


def is_scalar_list(value: object) -> bool:
    return isinstance(value, list) and all(is_scalar(item) for item in value)


def add_detail_rows(
    key: str,
    value: object,
    detail_values: list[dict[str, object]],
    detail_lists: list[dict[str, object]],
    depth: int = 0,
) -> None:
    if is_scalar(value):
        detail_values.append(
            {
                "key": key,
                "label": label_for_key(key),
                "value": value,
                "type": scalar_type(value),
            }
        )
        return

    if is_scalar_list(value):
        values = list(value)
        detail_lists.append(
            {
                "key": key,
                "label": label_for_key(key),
                "values": values,
                "count": len(values),
                "type": "list",
            }
        )
        return

    if isinstance(value, dict) and depth < 2:
        for child_key, child_value in value.items():
            if isinstance(child_key, int):
                child_name = str(child_key)
            else:
                child_name = child_key
            add_detail_rows(
                f"{key}.{child_name}",
                child_value,
                detail_values,
                detail_lists,
                depth + 1,
            )


def build_detail_data(
    save_file: core.SaveFile,
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    detail_values: list[dict[str, object]] = []
    detail_lists: list[dict[str, object]] = []
    data = save_file.to_dict()

    for key, value in data.items():
        if key in DETAIL_SKIP_KEYS:
            continue
        add_detail_rows(key, value, detail_values, detail_lists)

    detail_values.sort(key=lambda row: str(row["key"]))
    detail_lists.sort(key=lambda row: str(row["key"]))
    return detail_values, detail_lists


def validate_changes(changes: Mapping[str, int]) -> dict[str, int]:
    validated: dict[str, int] = {}
    for key, value in changes.items():
        if key not in EDITABLE_FIELDS:
            raise InvalidChangeError(f"Unknown editable field: {key}")
        if not isinstance(value, int):
            raise InvalidChangeError(f"Value must be an integer: {key}")

        field = EDITABLE_FIELDS[key]
        if value < field.min_value or value > field.max_value:
            raise InvalidChangeError(
                f"Value out of range: {key} must be between {field.min_value} and {field.max_value}"
            )
        validated[key] = value

    return validated


def patch_save(
    data: bytes,
    changes: Mapping[str, int],
    country_code: str | None = None,
) -> PatchedSave:
    save_file = load_save(data, country_code)
    for key, value in validate_changes(changes).items():
        field = EDITABLE_FIELDS[key]
        setter = getattr(save_file, field.setter)
        setter(value)

    patched_data = bytes(save_file.to_data())
    return PatchedSave(data=patched_data, summary=build_summary(save_file))


def download_save_from_transfer_codes(
    transfer_code: str,
    confirmation_code: str,
    country_code: str,
) -> PatchedSave:
    initialize_bcsfe()
    cc = core.CountryCode.from_code(country_code)
    game_version = core.GameVersion(120200)
    server_handler, result = core.ServerHandler.from_codes(
        transfer_code.strip(),
        confirmation_code.strip(),
        cc,
        game_version,
        print=False,
        save_backup=False,
    )
    if server_handler is None:
        if result is None or result.response is None:
            raise TransferDownloadError("Failed to connect to the game server.")
        raise TransferDownloadError(f"Invalid transfer response: {result.response.status_code}")

    data = bytes(server_handler.save_file.to_data())
    return PatchedSave(data=data, summary=build_summary(server_handler.save_file))


def create_transfer_codes(
    data: bytes,
    country_code: str | None = None,
    inquiry_mode: str = "keep",
    inquiry_code: str | None = None,
) -> TransferCodeResult:
    save_file = load_save(data, country_code)
    server_handler = core.ServerHandler(save_file)

    if inquiry_mode == "new":
        if not server_handler.create_new_account():
            raise TransferCodeCreateError("Failed to create a new inquiry code.")
    elif inquiry_mode == "custom":
        if not inquiry_code:
            raise TransferCodeCreateError("Inquiry code is required.")
        save_file.inquiry_code = inquiry_code.strip()
        server_handler.remove_stored_auth_token()
        server_handler.remove_stored_save_key_data()
        server_handler.remove_stored_password()
    elif inquiry_mode != "keep":
        raise TransferCodeCreateError(f"Unknown inquiry mode: {inquiry_mode}")

    codes = server_handler.get_codes()
    if codes is None:
        raise TransferCodeCreateError("Failed to create transfer codes.")

    transfer_code, confirmation_code = codes
    return TransferCodeResult(
        transfer_code=transfer_code,
        confirmation_code=confirmation_code,
        data=bytes(save_file.to_data()),
        summary=build_summary(save_file),
    )
