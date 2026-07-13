from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from typing import Annotated

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from kbc_save_editor.asset_service import (
    LAYOUT_EXTRA_LABELS,
    LAYOUT_REFERENCE_IMAGES,
    get_nyanko_club_cuts,
    nyanko_club_abyss_medal_path,
    nyanko_club_assets_available,
    nyanko_club_image_path,
    nyanko_club_imgcut_path,
    nyanko_club_layout_cut_path,
    nyanko_club_layout_extra_path,
    nyanko_club_layout_model_path,
    nyanko_club_layout_preset_asset_path,
    nyanko_club_layout_reference_path,
    nyanko_club_profile_path,
    nyanko_club_ui_asset_path,
    project_root,
)
from kbc_save_editor.save_service import (
    InvalidChangeError,
    SaveEditorError,
    build_summary,
    create_transfer_codes,
    download_save_from_transfer_codes,
    load_save,
    patch_save,
)

app = FastAPI(title="KBC Save Editor API", version="0.1.0")

NYANKO_CLUB_PUBLIC_ASSET_ROOT = "/assets/nyanko-club"


def public_path(filename: str) -> Path:
    return project_root() / "public" / filename


def nyanko_club_public_url(relative_path: str) -> str:
    return f"{NYANKO_CLUB_PUBLIC_ASSET_ROOT}/{relative_path}"


app.mount("/assets", StaticFiles(directory=public_path("assets")), name="assets")


def nyanko_club_extra_metadata() -> list[dict[str, str]]:
    return [
        {
            "id": asset_id,
            "label": label,
            "url": nyanko_club_public_url(f"layout/extras/{asset_id}.png"),
        }
        for asset_id, label in LAYOUT_EXTRA_LABELS.items()
    ]


def summary_to_json(summary):
    return {
        "country_code": summary.country_code,
        "game_version": summary.game_version,
        "inquiry_code": summary.inquiry_code,
        "user_rank": summary.user_rank,
        "gacha_seeds": summary.gacha_seeds,
        "values": summary.values,
        "item_groups": summary.item_groups,
        "detail_values": summary.detail_values,
        "detail_lists": summary.detail_lists,
        "labels": summary.labels,
        "categories": summary.categories,
    }


@app.get("/")
def index() -> FileResponse:
    index_path = project_root() / "index.html"
    return FileResponse(index_path)


@app.get("/tools/nyanko-club-layout")
def nyanko_club_layout_editor() -> FileResponse:
    editor_path = Path(__file__).resolve().parents[2] / "public" / "nyanko-club-layout-editor.html"
    return FileResponse(editor_path)


@app.get("/tools/imgcut-mamodel")
def imgcut_mamodel_placer() -> FileResponse:
    tool_path = public_path("imgcut-mamodel-placer.html")
    return FileResponse(tool_path)


@app.get("/nyanko-club-forgery")
@app.get("/nyanko-club-forgery.html")
def nyanko_club_forgery() -> FileResponse:
    return FileResponse(public_path("nyanko-club-forgery.html"))


@app.get("/nyanko-club-forgery.css")
def nyanko_club_forgery_css() -> FileResponse:
    return FileResponse(public_path("nyanko-club-forgery.css"), media_type="text/css")


@app.get("/nyanko-club-forgery.js")
def nyanko_club_forgery_script() -> FileResponse:
    return FileResponse(public_path("nyanko-club-forgery.js"), media_type="text/javascript")


@app.get("/nyanko-club-renderer.js")
def nyanko_club_renderer_script() -> FileResponse:
    return FileResponse(public_path("nyanko-club-renderer.js"), media_type="text/javascript")


@app.get("/assets/kbc-logo.png")
def kbc_logo() -> FileResponse:
    return FileResponse(public_path("assets/kbc-logo.png"), media_type="image/png")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/assets/nyanko-club")
def nyanko_club_assets() -> JSONResponse:
    has_local_assets = nyanko_club_assets_available()
    cuts = [cut.to_dict() for cut in get_nyanko_club_cuts()] if has_local_assets else []

    return JSONResponse(
        {
            "available": True,
            "image_url": nyanko_club_public_url("img061_00_nyankoClub.png"),
            "menu_frame_url": nyanko_club_public_url("img008_ja.png"),
            "common_buttons_url": nyanko_club_public_url("img006_ja.png"),
            "item_icons_url": nyanko_club_public_url("img060_02.png"),
            "cuts": cuts,
            "layout": {
                "model_url": nyanko_club_public_url(
                    "layout/presets/nyanko-club/img061_00_nyankoClub-native.mamodel"
                ),
                "preset": {
                    "id": "nyanko-club",
                    "label": "にゃんこクラブ",
                    "image": {
                        "name": "img061_00_nyankoClub.png",
                        "url": nyanko_club_public_url(
                            "layout/presets/nyanko-club/img061_00_nyankoClub.png"
                        ),
                    },
                    "imgcut": {
                        "name": "img061_00_nyankoClub.imgcut",
                        "url": nyanko_club_public_url(
                            "layout/presets/nyanko-club/img061_00_nyankoClub.imgcut"
                        ),
                    },
                    "model": {
                        "name": "img061_00_nyankoClub-native.mamodel",
                        "url": nyanko_club_public_url(
                            "layout/presets/nyanko-club/img061_00_nyankoClub-native.mamodel"
                        ),
                    },
                    "textures": [
                        {
                            "id": "img001",
                            "image": {
                                "name": "img001_ja.png",
                                "url": nyanko_club_public_url(
                                    "layout/presets/nyanko-club/img001_ja.png"
                                ),
                            },
                            "imgcut": {
                                "name": "img001_ja.imgcut",
                                "url": nyanko_club_public_url(
                                    "layout/presets/nyanko-club/img001_ja.imgcut"
                                ),
                            },
                        },
                        {
                            "id": "img006",
                            "image": {
                                "name": "img006_ja.png",
                                "url": nyanko_club_public_url(
                                    "layout/presets/nyanko-club/img006_ja.png"
                                ),
                            },
                            "imgcut": {
                                "name": "img006_ja.imgcut",
                                "url": nyanko_club_public_url(
                                    "layout/presets/nyanko-club/img006_ja.imgcut"
                                ),
                            },
                        },
                        {
                            "id": "img008",
                            "image": {
                                "name": "img008_ja.png",
                                "url": nyanko_club_public_url(
                                    "layout/presets/nyanko-club/img008_ja.png"
                                ),
                            },
                            "imgcut": {
                                "name": "img008_ja.imgcut",
                                "url": nyanko_club_public_url(
                                    "layout/presets/nyanko-club/img008_ja.imgcut"
                                ),
                            },
                        },
                    ],
                },
                "references": [
                    {
                        "id": reference_id,
                        "label": label,
                        "url": f"/api/assets/nyanko-club/layout/reference/{reference_id}",
                    }
                    for reference_id, (label, _) in LAYOUT_REFERENCE_IMAGES.items()
                ],
                "extras": [
                    {
                        **extra,
                        "url": f"/api/assets/nyanko-club/layout/extra/{extra['id']}",
                    }
                    for extra in nyanko_club_extra_metadata()
                ],
            },
        }
    )


@app.get("/api/assets/nyanko-club/image")
def nyanko_club_image() -> FileResponse:
    if not nyanko_club_assets_available():
        return RedirectResponse(nyanko_club_public_url("img061_00_nyankoClub.png"))
    return FileResponse(nyanko_club_image_path())


@app.get("/api/assets/nyanko-club/imgcut")
def nyanko_club_imgcut() -> FileResponse:
    if not nyanko_club_assets_available():
        return RedirectResponse(nyanko_club_public_url("img061_00_nyankoClub.imgcut"))
    return FileResponse(nyanko_club_imgcut_path(), media_type="text/plain; charset=utf-8")


@app.get("/api/assets/nyanko-club/layout/cut/{cut_id}")
def nyanko_club_layout_cut(cut_id: int) -> FileResponse:
    cut_path = nyanko_club_layout_cut_path(cut_id)
    if cut_path is None or not cut_path.is_file():
        raise HTTPException(status_code=404, detail="Nyanko Club cut is missing.")
    return FileResponse(cut_path)


@app.get("/api/assets/nyanko-club/layout/model")
def nyanko_club_layout_model() -> FileResponse:
    model_path = nyanko_club_layout_model_path()
    if not model_path.is_file():
        return RedirectResponse(
            nyanko_club_public_url(
                "layout/presets/nyanko-club/img061_00_nyankoClub-native.mamodel"
            )
        )
    return FileResponse(model_path, media_type="text/plain; charset=utf-8")


@app.get("/api/assets/nyanko-club/layout/preset/{asset_name}")
def nyanko_club_layout_preset_asset(asset_name: str) -> FileResponse:
    asset_path = nyanko_club_layout_preset_asset_path(asset_name)
    if asset_path is None or not asset_path.is_file():
        raise HTTPException(status_code=404, detail="Nyanko Club layout preset asset is missing.")
    media_type = "image/png" if asset_name.endswith("image") else "text/plain; charset=utf-8"
    return FileResponse(asset_path, media_type=media_type)


@app.get("/api/assets/nyanko-club/layout/reference/{reference_id}")
def nyanko_club_layout_reference(reference_id: str) -> FileResponse:
    reference_path = nyanko_club_layout_reference_path(reference_id)
    if reference_path is None or not reference_path.is_file():
        raise HTTPException(status_code=404, detail="Nyanko Club reference is missing.")
    return FileResponse(reference_path)


@app.get("/api/assets/nyanko-club/layout/extra/{asset_id}")
def nyanko_club_layout_extra(asset_id: str) -> FileResponse:
    asset_path = nyanko_club_layout_extra_path(asset_id)
    if asset_path is None:
        if asset_id not in LAYOUT_EXTRA_LABELS:
            raise HTTPException(status_code=404, detail="Nyanko Club layout asset is missing.")
        return RedirectResponse(nyanko_club_public_url(f"layout/extras/{asset_id}.png"))
    return FileResponse(asset_path)


@app.get("/api/assets/nyanko-club/profile/{cat_id}/{cat_form}")
def nyanko_club_profile(cat_id: int, cat_form: int) -> FileResponse:
    profile_path = nyanko_club_profile_path(cat_id, cat_form)
    if not profile_path.is_file():
        return RedirectResponse(nyanko_club_public_url(f"profiles/{cat_id}_{cat_form}.png"))
    return FileResponse(profile_path)


@app.get("/api/assets/nyanko-club/abyss-medal/{item_id}")
def nyanko_club_abyss_medal(item_id: int) -> FileResponse:
    medal_path = nyanko_club_abyss_medal_path(item_id)
    if medal_path is None or not medal_path.is_file():
        if item_id not in {174, 175, 176, 177}:
            raise HTTPException(status_code=404, detail="Nyanko Club abyss medal is missing.")
        return RedirectResponse(nyanko_club_public_url(f"abyss-medals/{item_id}.png"))
    return FileResponse(medal_path)


@app.get("/api/assets/nyanko-club/ui/{asset_name}")
def nyanko_club_ui_asset(asset_name: str) -> FileResponse:
    asset_path = nyanko_club_ui_asset_path(asset_name)
    if asset_path is None or not asset_path.is_file():
        ui_assets = {
            "menu-frame": "img008_ja.png",
            "common-buttons": "img006_ja.png",
            "item-icons": "img060_02.png",
        }
        filename = ui_assets.get(asset_name)
        if filename is None:
            raise HTTPException(status_code=404, detail="Nyanko Club UI asset is missing.")
        return RedirectResponse(nyanko_club_public_url(filename))
    return FileResponse(asset_path)


@app.post("/api/save/inspect")
async def inspect_save(
    file: Annotated[UploadFile, File()],
    country_code: Annotated[str | None, Form()] = None,
) -> JSONResponse:
    data = await file.read()
    try:
        summary = build_summary(load_save(data, country_code))
    except SaveEditorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return JSONResponse(summary_to_json(summary))


@app.post("/api/save/download")
async def download_save(
    transfer_code: Annotated[str, Form()],
    confirmation_code: Annotated[str, Form()],
    country_code: Annotated[str, Form()],
) -> JSONResponse:
    try:
        downloaded = download_save_from_transfer_codes(
            transfer_code,
            confirmation_code,
            country_code,
        )
    except SaveEditorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return JSONResponse(
        {
            "file_base64": base64.b64encode(downloaded.data).decode("ascii"),
            "summary": summary_to_json(downloaded.summary),
        }
    )


@app.post("/api/save/create-transfer")
async def create_transfer(
    file: Annotated[UploadFile, File()],
    country_code: Annotated[str | None, Form()] = None,
    inquiry_mode: Annotated[str, Form()] = "keep",
    inquiry_code: Annotated[str | None, Form()] = None,
) -> JSONResponse:
    data = await file.read()
    try:
        result = create_transfer_codes(data, country_code, inquiry_mode, inquiry_code)
    except SaveEditorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return JSONResponse(
        {
            "transfer_code": result.transfer_code,
            "confirmation_code": result.confirmation_code,
            "file_base64": base64.b64encode(result.data).decode("ascii"),
            "summary": summary_to_json(result.summary),
        }
    )


@app.post("/api/save/patch")
async def patch_save_file(
    file: Annotated[UploadFile, File()],
    changes_json: Annotated[str, Form()],
    country_code: Annotated[str | None, Form()] = None,
) -> JSONResponse:
    try:
        changes = json.loads(changes_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="changes_json must be valid JSON") from exc

    if not isinstance(changes, dict):
        raise HTTPException(status_code=400, detail="changes_json must be an object")

    data = await file.read()
    try:
        patched = patch_save(data, changes, country_code)
    except InvalidChangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except SaveEditorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return JSONResponse(
        {
            "file_base64": base64.b64encode(patched.data).decode("ascii"),
            "summary": summary_to_json(patched.summary),
        }
    )


def run() -> None:
    host = os.getenv("KBC_SAVE_EDITOR_HOST", "127.0.0.1")
    port = int(os.getenv("KBC_SAVE_EDITOR_PORT", "8010"))
    uvicorn.run("kbc_save_editor.app:app", host=host, port=port, reload=True)


if __name__ == "__main__":
    run()
