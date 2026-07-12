from __future__ import annotations

import os
import subprocess
import sys

TRUE_VALUES = {"1", "true", "yes", "on"}


def should_auto_update() -> bool:
    value = os.getenv("KBC_SAVE_EDITOR_AUTO_UPDATE_BCSFE", "")
    return value.strip().lower() in TRUE_VALUES


def update_bcsfe() -> None:
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "--upgrade", "bcsfe"],
        check=True,
    )


def maybe_update_bcsfe() -> None:
    if should_auto_update():
        update_bcsfe()


def main() -> None:
    update_bcsfe()
