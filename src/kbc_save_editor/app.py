from __future__ import annotations

import base64
import os
from typing import Annotated

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from kbc_save_editor.save_service import (
    InvalidChangeError,
    SaveEditorError,
    build_summary,
    load_save,
    patch_save,
)

app = FastAPI(title="KBC Save Editor API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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

    return JSONResponse(
        {
            "country_code": summary.country_code,
            "game_version": summary.game_version,
            "values": summary.values,
        }
    )


@app.post("/api/save/patch")
async def patch_save_file(
    file: Annotated[UploadFile, File()],
    changes_json: Annotated[str, Form()],
    country_code: Annotated[str | None, Form()] = None,
) -> JSONResponse:
    import json

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
            "summary": {
                "country_code": patched.summary.country_code,
                "game_version": patched.summary.game_version,
                "values": patched.summary.values,
            },
        }
    )


def run() -> None:
    host = os.getenv("KBC_SAVE_EDITOR_HOST", "127.0.0.1")
    port = int(os.getenv("KBC_SAVE_EDITOR_PORT", "8010"))
    uvicorn.run("kbc_save_editor.app:app", host=host, port=port, reload=True)


if __name__ == "__main__":
    run()
