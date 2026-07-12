from __future__ import annotations

from collections.abc import Mapping

from bcsfe import core

from kbc_save_editor.bcsfe_runtime import initialize_bcsfe
from kbc_save_editor.models import EditableField, PatchedSave, SaveSummary

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


class SaveEditorError(Exception):
    pass


class InvalidChangeError(SaveEditorError):
    pass


class SaveLoadError(SaveEditorError):
    pass


def load_save(data: bytes, country_code: str | None = None) -> core.SaveFile:
    initialize_bcsfe()
    cc = core.CountryCode.from_code(country_code) if country_code else None
    try:
        return core.SaveFile(core.Data(data), cc)
    except Exception as exc:
        raise SaveLoadError(str(exc)) from exc


def build_summary(save_file: core.SaveFile) -> SaveSummary:
    values: dict[str, int] = {}
    for key, field in EDITABLE_FIELDS.items():
        getter = getattr(save_file, field.getter)
        values[key] = int(getter())

    return SaveSummary(
        country_code=save_file.cc.get_code(),
        game_version=int(save_file.game_version.game_version),
        values=values,
    )


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
