import { loadNyankoClubAssets, NyankoClubRenderer } from "./nyanko-club-renderer.js";

const THEME_STORAGE_KEY = "kbc-theme";
const THEMES = new Set(["original", "dark", "light"]);
const elements = Object.fromEntries([...document.querySelectorAll("[id]")].map((element) => [element.id, element]));
const valueInputs = [...document.querySelectorAll("[data-value]")];
let renderer = null;
let mode = "normal";

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
  return Object.fromEntries(valueInputs.map((input) => [input.dataset.value, inputValue(input)]));
}

function renderClub() {
  if (!renderer) return;
  renderer.setMode(mode);
  renderer.setStampDays(elements.stampDays.value);
  renderer.setValues(collectValues());
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

function setRendererControlsEnabled(enabled) {
  document.querySelectorAll("[data-requires-renderer]").forEach((control) => {
    control.disabled = !enabled;
  });
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
    elements.actionStatus.textContent = `${NyankoClubRenderer.width * scale} × ${NyankoClubRenderer.height * scale}で保存しました`;
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
    x: (event.clientX - rect.left) * NyankoClubRenderer.width / rect.width,
    y: (event.clientY - rect.top) * NyankoClubRenderer.height / rect.height,
  };
}

function handleCanvasPointer(event) {
  const fullscreenActive = document.fullscreenElement === elements.previewFrame
    || elements.previewFrame.classList.contains("is-pseudo-fullscreen");
  if (!fullscreenActive) return;
  const point = canvasPoint(event);
  const insideBackButton = point.x >= 96 && point.x <= 205 && point.y >= 470 && point.y <= NyankoClubRenderer.height;
  if (!insideBackButton) return;
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
  elements.downloadButton.addEventListener("click", saveImage);
  elements.fullscreenButton.addEventListener("click", toggleFullscreen);
  elements.clubCanvas.addEventListener("pointerup", handleCanvasPointer);
  document.addEventListener("fullscreenchange", updateFullscreenState);
  updateStampOutput();

  try {
    const assets = await loadNyankoClubAssets();
    renderer = new NyankoClubRenderer(elements.clubCanvas, assets);
    setRendererControlsEnabled(true);
    setMode("normal");
    elements.previewStatus.textContent = "";
  } catch (error) {
    elements.previewStatus.textContent = error.message;
    elements.actionStatus.textContent = "素材の読込に失敗しました";
  }
}

initialize();
