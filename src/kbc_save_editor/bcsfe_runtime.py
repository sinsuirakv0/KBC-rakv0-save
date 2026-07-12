from __future__ import annotations

import os
import shutil
from importlib import resources
from pathlib import Path

import bcsfe
from bcsfe import copy_to_data_dir, core

_INITIALIZED = False


def initialize_bcsfe() -> None:
    global _INITIALIZED
    if _INITIALIZED:
        return

    configure_bcsfe_paths()
    migrate_bcsfe_files()
    core.core_data.init_data()
    install_configured_japanese_locale()
    _INITIALIZED = True


def configure_bcsfe_paths() -> None:
    config_dir = Path(os.getenv("KBC_BCSFE_CONFIG_DIR", ".bcsfe"))
    config_dir.mkdir(parents=True, exist_ok=True)
    core.set_config_path(core.Path(str(config_dir / "config.yaml")))
    core.set_log_path(core.Path(str(config_dir / "log.txt")))


def migrate_bcsfe_files(force: bool = False) -> None:
    version_path = core.Path.get_data_folder().add("version.txt")
    current_version = version_path.read().to_str().strip() if version_path.exists() else None
    if not force and current_version == bcsfe.__version__:
        return

    files_path = resources.files(bcsfe.__app_name__).joinpath("files")
    copy_to_data_dir(files_path, files_path)
    version_path.write(core.Data(bcsfe.__version__))


def install_configured_japanese_locale() -> None:
    enabled = os.getenv("KBC_BCSFE_ENABLE_JA_LOCALE", "1").strip().lower()
    if enabled in {"0", "false", "no", "off"}:
        return

    source_path = Path(os.getenv("KBC_BCSFE_JA_LOCALE_PATH", "D:/KBC/bcsfe-ja-locale"))
    locale_code = os.getenv("KBC_BCSFE_LOCALE_CODE", "ja").strip() or "ja"
    install_japanese_locale(source_path, locale_code)


def install_japanese_locale(source_path: Path, locale_code: str = "ja") -> None:
    files_path = source_path / "files"
    if not files_path.exists():
        return

    target_path = Path(core.LocalManager.get_locale_folder(locale_code).path)
    target_path.mkdir(parents=True, exist_ok=True)
    shutil.copytree(files_path, target_path, dirs_exist_ok=True)
    core.core_data.config.set(core.ConfigKey.LOCALE, locale_code)
    core.core_data.local_manager = core.LocalManager(locale_code)
