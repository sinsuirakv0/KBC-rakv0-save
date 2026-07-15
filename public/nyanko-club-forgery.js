import { loadNyankoClubAssets, NyankoClubRenderer } from "./nyanko-club-renderer.js";

const THEME_STORAGE_KEY = "kbc-theme";
const THEMES = new Set(["original", "dark", "light"]);
const elements = Object.fromEntries([...document.querySelectorAll("[id]")].map((element) => [element.id, element]));
const valueInputs = [...document.querySelectorAll("[data-value]")];
const LAYER_LABELS = {
  character: "キャラアイコン",
  card: "カード背景",
  brown: "茶色背景",
};
let renderer = null;
let mode = "normal";
let activeLayerId = "character";
let pointerGesture = null;
let pointerMoved = false;
const activePointers = new Map();

function readStoredTheme() {
  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.has(storedTheme) ? storedTheme : "original";
  } catch {
    return "original";
  }
}

function renderTheme(theme) {
  if (theme === "original") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
  document.querySelectorAll("[data-theme-value]").forEach((button) => {
    const active = button.dataset.themeValue === theme;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setTheme(theme) {
  if (!THEMES.has(theme)) return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 保存できない環境でも現在のページには反映する
  }
  renderTheme(theme);
}

function inputValue(input) {
  return input.type === "checkbox" ? input.checked : Number(input.value);
}

function collectValues() {
  const values = Object.fromEntries(valueInputs.map((input) => [input.dataset.value, inputValue(input)]));
  if (!elements.expiryTimeUnlocked.checked) {
    values.expiryHour = 0;
    values.expiryMinute = 0;
  }
  return values;
}

function renderClub() {
  if (!renderer) return;
  renderer.setMode(mode);
  renderer.setStampDays(elements.stampDays.value);
  renderer.setValues(collectValues());
  renderer.setNativeCardOpacity(Number(elements.nativeCardOpacity.value) / 100);
  renderer.render();
}

function setMode(nextMode) {
  mode = nextMode === "gold" ? "gold" : "normal";
  [elements.normalModeButton, elements.goldModeButton].forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.goldSettings.hidden = mode !== "gold";
  renderClub();
}

function updateStampOutput() {
  elements.stampDaysOutput.value = `${elements.stampDays.value}日目まで`;
  renderClub();
}

function updateExpiryTimeLock() {
  const unlocked = elements.expiryTimeUnlocked.checked;
  elements.expiryHour.disabled = !unlocked;
  elements.expiryMinute.disabled = !unlocked;
  if (!unlocked) {
    elements.expiryHour.value = "0";
    elements.expiryMinute.value = "0";
  }
  renderClub();
}

function updateExportOptions() {
  if (!renderer) return;
  [...elements.exportScale.options].forEach((option) => {
    const scale = Number(option.value);
    option.textContent = `${renderer.width * scale} × ${renderer.height * scale}`;
  });
}

function updateAspectRatio() {
  if (!renderer) return;
  renderer.setAspectRatio(elements.aspectRatio.value);
  const ratio = renderer.width / renderer.height;
  elements.previewFrame.style.setProperty("--club-aspect-ratio", `${renderer.width} / ${renderer.height}`);
  elements.previewFrame.style.setProperty("--club-fullscreen-width", `${ratio * 100}vh`);
  updateExportOptions();
  renderClub();
}

function customLayerState() {
  return renderer?.customLayerState(activeLayerId) ?? null;
}

function updateCustomImageControls() {
  document.querySelectorAll("[data-layer]").forEach((button) => {
    const active = button.dataset.layer === activeLayerId;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const state = customLayerState();
  const hasImage = Boolean(state);
  elements.customImageStatus.textContent = `${LAYER_LABELS[activeLayerId]}: ${hasImage ? "設定済み" : "未選択"}`;
  elements.customImageScale.value = String(Math.round((state?.scale ?? 1) * 100));
  elements.customImageOpacity.value = String(Math.round((state?.opacity ?? 1) * 100));
  elements.customImageScaleOutput.value = `${elements.customImageScale.value}%`;
  elements.customImageOpacityOutput.value = `${elements.customImageOpacity.value}%`;
  elements.resetImageButton.disabled = !hasImage;
  elements.removeImageButton.disabled = !hasImage;
  elements.customImageScale.disabled = !hasImage;
  elements.customImageOpacity.disabled = !hasImage;
  elements.nativeCardOpacityField.hidden = activeLayerId !== "card";
  elements.clubCanvas.classList.toggle("is-image-editing", hasImage);
}

function selectCustomLayer(layerId) {
  if (!LAYER_LABELS[layerId]) return;
  activeLayerId = layerId;
  activePointers.clear();
  pointerGesture = null;
  updateCustomImageControls();
}

function loadSelectedImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした"));
    };
    image.src = url;
  });
}

async function handleCustomImageSelection() {
  const [file] = elements.customImageInput.files;
  const targetLayerId = activeLayerId;
  elements.customImageInput.value = "";
  if (!renderer || !file) return;
  try {
    const image = await loadSelectedImage(file);
    renderer.setCustomLayerImage(targetLayerId, image);
    renderer.render();
    updateCustomImageControls();
  } catch (error) {
    elements.actionStatus.textContent = error.message;
  }
}

function updateCustomLayerTransform(changes) {
  if (!renderer || !customLayerState()) return;
  renderer.setCustomLayerTransform(activeLayerId, changes);
  renderer.render();
  updateCustomImageControls();
}

function midpoint(first, second) {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function pointDistance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function startPointerGesture() {
  const state = customLayerState();
  const pointers = [...activePointers.values()];
  if (!state || pointers.length === 0) {
    pointerGesture = null;
    return;
  }
  if (pointers.length === 1) {
    pointerGesture = {
      type: "drag",
      startPoint: pointers[0],
      offsetX: state.offsetX,
      offsetY: state.offsetY,
    };
    return;
  }
  const center = midpoint(pointers[0], pointers[1]);
  pointerGesture = {
    type: "pinch",
    startCenter: center,
    startDistance: Math.max(1, pointDistance(pointers[0], pointers[1])),
    offsetX: state.offsetX,
    offsetY: state.offsetY,
    scale: state.scale,
  };
}

function setRendererControlsEnabled(enabled) {
  document.querySelectorAll("[data-requires-renderer]").forEach((control) => {
    control.disabled = !enabled;
  });
  updateCustomImageControls();
}

function downloadCanvas(canvas, filename) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PNGを作成できませんでした"));
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, "image/png");
  });
}

async function saveImage() {
  if (!renderer) return;
  elements.downloadButton.disabled = true;
  elements.actionStatus.textContent = "PNGを作成しています";
  const scale = Number(elements.exportScale.value);
  try {
    const exportCanvas = renderer.createExportCanvas(scale);
    await downloadCanvas(exportCanvas, `nyanko-club-${mode}-${exportCanvas.width}x${exportCanvas.height}.png`);
    exportCanvas.width = 1;
    exportCanvas.height = 1;
    elements.actionStatus.textContent = `${renderer.width * scale} × ${renderer.height * scale}で保存しました`;
  } catch (error) {
    elements.actionStatus.textContent = error.message;
  } finally {
    elements.downloadButton.disabled = false;
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (elements.previewFrame.classList.contains("is-pseudo-fullscreen")) {
      elements.previewFrame.classList.remove("is-pseudo-fullscreen");
      updateFullscreenState();
    } else if (typeof elements.previewFrame.requestFullscreen === "function") {
      await elements.previewFrame.requestFullscreen({ navigationUI: "hide" });
    } else {
      elements.previewFrame.classList.add("is-pseudo-fullscreen");
      updateFullscreenState();
    }
  } catch {
    elements.previewFrame.classList.add("is-pseudo-fullscreen");
    updateFullscreenState();
  }
}

function updateFullscreenState() {
  const active = document.fullscreenElement === elements.previewFrame
    || elements.previewFrame.classList.contains("is-pseudo-fullscreen");
  document.body.classList.toggle("is-fullscreen", active);
  elements.fullscreenLabel.textContent = active ? "終了" : "全画面";
}

function canvasPoint(event) {
  const rect = elements.clubCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (renderer?.width ?? NyankoClubRenderer.width) / rect.width,
    y: (event.clientY - rect.top) * (renderer?.height ?? NyankoClubRenderer.height) / rect.height,
  };
}

function isBackButtonPoint(point) {
  const region = renderer?.backButtonRegion();
  return Boolean(region)
    && point.x >= region.x && point.x <= region.x + region.width
    && point.y >= region.y && point.y <= region.y + region.height;
}

function fullscreenActive() {
  return document.fullscreenElement === elements.previewFrame
    || elements.previewFrame.classList.contains("is-pseudo-fullscreen");
}

function handleCanvasPointerDown(event) {
  const point = canvasPoint(event);
  if (fullscreenActive() && isBackButtonPoint(point)) return;
  if (!renderer || !customLayerState()) return;
  if (activePointers.size === 0 && !renderer.pointInsideCustomLayer(activeLayerId, point.x, point.y)) return;
  event.preventDefault();
  if (activePointers.size === 0) pointerMoved = false;
  activePointers.set(event.pointerId, point);
  elements.clubCanvas.setPointerCapture(event.pointerId);
  elements.clubCanvas.classList.add("is-image-dragging");
  startPointerGesture();
}

function handleCanvasPointerMove(event) {
  if (!activePointers.has(event.pointerId) || !pointerGesture) return;
  event.preventDefault();
  const point = canvasPoint(event);
  const previous = activePointers.get(event.pointerId);
  if (Math.hypot(point.x - previous.x, point.y - previous.y) > 0.5) pointerMoved = true;
  activePointers.set(event.pointerId, point);
  const pointers = [...activePointers.values()];
  if (pointerGesture.type === "drag" && pointers.length === 1) {
    updateCustomLayerTransform({
      offsetX: pointerGesture.offsetX + point.x - pointerGesture.startPoint.x,
      offsetY: pointerGesture.offsetY + point.y - pointerGesture.startPoint.y,
    });
    return;
  }
  if (pointerGesture.type === "pinch" && pointers.length >= 2) {
    const center = midpoint(pointers[0], pointers[1]);
    updateCustomLayerTransform({
      offsetX: pointerGesture.offsetX + center.x - pointerGesture.startCenter.x,
      offsetY: pointerGesture.offsetY + center.y - pointerGesture.startCenter.y,
      scale: pointerGesture.scale * pointDistance(pointers[0], pointers[1]) / pointerGesture.startDistance,
    });
  }
}

function endCanvasPointer(event, allowBackButton) {
  const interacted = activePointers.has(event.pointerId);
  activePointers.delete(event.pointerId);
  if (elements.clubCanvas.hasPointerCapture(event.pointerId)) {
    elements.clubCanvas.releasePointerCapture(event.pointerId);
  }
  if (activePointers.size > 0) startPointerGesture();
  else {
    pointerGesture = null;
    elements.clubCanvas.classList.remove("is-image-dragging");
  }
  if (allowBackButton && (!interacted || !pointerMoved)) handleCanvasPointer(event);
  if (activePointers.size === 0) pointerMoved = false;
}

function handleCanvasWheel(event) {
  if (!renderer || !customLayerState()) return;
  const point = canvasPoint(event);
  if (!renderer.pointInsideCustomLayer(activeLayerId, point.x, point.y)) return;
  event.preventDefault();
  const state = customLayerState();
  updateCustomLayerTransform({ scale: state.scale * Math.exp(-event.deltaY * 0.0015) });
}

function handleCanvasPointer(event) {
  if (!fullscreenActive()) return;
  const point = canvasPoint(event);
  if (!isBackButtonPoint(point)) return;
  if (document.fullscreenElement === elements.previewFrame) document.exitFullscreen();
  else {
    elements.previewFrame.classList.remove("is-pseudo-fullscreen");
    updateFullscreenState();
  }
}

async function initialize() {
  renderTheme(readStoredTheme());
  document.querySelectorAll("[data-theme-value]").forEach((button) => {
    button.addEventListener("click", () => setTheme(button.dataset.themeValue));
  });
  valueInputs.forEach((input) => input.addEventListener(input.type === "checkbox" ? "change" : "input", renderClub));
  elements.normalModeButton.addEventListener("click", () => setMode("normal"));
  elements.goldModeButton.addEventListener("click", () => setMode("gold"));
  elements.stampDays.addEventListener("input", updateStampOutput);
  elements.expiryTimeUnlocked.addEventListener("change", updateExpiryTimeLock);
  elements.aspectRatio.addEventListener("change", updateAspectRatio);
  document.querySelectorAll("[data-layer]").forEach((button) => {
    button.addEventListener("click", () => selectCustomLayer(button.dataset.layer));
  });
  elements.selectImageButton.addEventListener("click", () => elements.customImageInput.click());
  elements.customImageInput.addEventListener("change", handleCustomImageSelection);
  elements.resetImageButton.addEventListener("click", () => {
    renderer?.resetCustomLayerTransform(activeLayerId);
    renderer?.render();
    updateCustomImageControls();
  });
  elements.removeImageButton.addEventListener("click", () => {
    renderer?.removeCustomLayer(activeLayerId);
    renderer?.render();
    updateCustomImageControls();
  });
  elements.customImageScale.addEventListener("input", () => {
    updateCustomLayerTransform({ scale: Number(elements.customImageScale.value) / 100 });
  });
  elements.customImageOpacity.addEventListener("input", () => {
    updateCustomLayerTransform({ opacity: Number(elements.customImageOpacity.value) / 100 });
  });
  elements.nativeCardOpacity.addEventListener("input", () => {
    elements.nativeCardOpacityOutput.value = `${elements.nativeCardOpacity.value}%`;
    renderClub();
  });
  elements.downloadButton.addEventListener("click", saveImage);
  elements.fullscreenButton.addEventListener("click", toggleFullscreen);
  elements.clubCanvas.addEventListener("pointerdown", handleCanvasPointerDown);
  elements.clubCanvas.addEventListener("pointermove", handleCanvasPointerMove);
  elements.clubCanvas.addEventListener("pointerup", (event) => endCanvasPointer(event, true));
  elements.clubCanvas.addEventListener("pointercancel", (event) => endCanvasPointer(event, false));
  elements.clubCanvas.addEventListener("wheel", handleCanvasWheel, { passive: false });
  document.addEventListener("fullscreenchange", updateFullscreenState);
  updateCustomImageControls();
  updateExpiryTimeLock();
  updateStampOutput();

  try {
    const assets = await loadNyankoClubAssets();
    renderer = new NyankoClubRenderer(elements.clubCanvas, assets);
    setRendererControlsEnabled(true);
    updateAspectRatio();
    setMode("normal");
    updateCustomImageControls();
    elements.previewStatus.textContent = "";
  } catch (error) {
    elements.previewStatus.textContent = error.message;
    elements.actionStatus.textContent = "素材の読込に失敗しました";
  }
}

initialize();
