from __future__ import annotations

from kbc_save_editor.bcsfe_update import maybe_update_bcsfe


def run_api() -> None:
    maybe_update_bcsfe()

    from kbc_save_editor.app import run

    run()
