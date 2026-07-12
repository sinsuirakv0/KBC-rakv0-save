from __future__ import annotations

import pytest

from kbc_save_editor.save_service import InvalidChangeError, validate_changes


def test_validate_changes_accepts_known_integer_fields() -> None:
    assert validate_changes({"xp": 123, "catfood": 456}) == {"xp": 123, "catfood": 456}


def test_validate_changes_rejects_unknown_fields() -> None:
    with pytest.raises(InvalidChangeError):
        validate_changes({"unknown": 1})


def test_validate_changes_rejects_negative_values() -> None:
    with pytest.raises(InvalidChangeError):
        validate_changes({"xp": -1})


def test_validate_changes_rejects_non_integer_values() -> None:
    with pytest.raises(InvalidChangeError):
        validate_changes({"xp": "100"})  # type: ignore[arg-type]
