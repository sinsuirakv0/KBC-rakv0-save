const LOGICAL_WIDTH = 1280;
const LOGICAL_HEIGHT = 576;
const NATIVE_LAYOUT_WIDTH = 960;
const MEDAL_IDS = [177, 176, 175, 174];
const CUSTOM_LAYER_IDS = new Set(["brown", "card", "character"]);
const CARD_BACKGROUND_NAMES = new Set([
  "通常カード",
  "ゴールドカード",
  "ゴールド乗算レイヤー",
  "ゴールド加算レイヤー",
]);

function parseImgcut(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== "[imgcut]") throw new Error("imgcutのヘッダーが不正です");
  const count = Number(lines[3]);
  const records = [];
  const pattern = /(?<!\d)(\d+),(\d+),(\d+),(\d+)(?:,|$)/g;

  for (const line of lines.slice(4)) {
    const matches = [...line.matchAll(pattern)];
    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const nameEnd = matches[index + 1]?.index ?? line.length;
      records.push({
        x: Number(match[1]),
        y: Number(match[2]),
        width: Number(match[3]),
        height: Number(match[4]),
        name: line.slice(match.index + match[0].length, nameEnd),
      });
    }
  }

  if (records.length < count) throw new Error(`imgcutの定義数が不足しています: ${records.length}/${count}`);
  return records.slice(0, count).map((cut, id) => ({ ...cut, id }));
}

function parseModel(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== "[modelanim:model]") throw new Error("mamodelのヘッダーが不正です");
  const count = Number(lines[2]);
  const nodeLines = lines.slice(3, 3 + count);
  if (nodeLines.length !== count) throw new Error("mamodelのノード数が不足しています");

  return nodeLines.map((line) => {
    const fields = line.split(",", 14);
    if (fields.length < 14) throw new Error(`mamodelのノードが不正です: ${line}`);
    return {
      parentId: Number(fields[0]),
      cutId: Number(fields[2]),
      nodeId: Number(fields[3]),
      x: Number(fields[4]),
      y: Number(fields[5]),
      width: Number(fields[6]),
      height: Number(fields[7]),
      scaleX: Number(fields[8]) / 1000,
      scaleY: Number(fields[9]) / 1000,
      visible: Number(fields[11]) > 0,
      name: fields[13],
    };
  });
}

function nodeDirective(node, directive) {
  return node.name.match(new RegExp(`\\[${directive}(?::([^\\]]+))?\\]`, "i"))?.[1] ?? null;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`画像を読み込めません: ${url}`));
    image.src = url;
  });
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`素材を読み込めません: ${url}`);
  return response.text();
}

export async function loadNyankoClubAssets() {
  const presetRoot = "/assets/nyanko-club/layout/presets/nyanko-club";
  const extraRoot = "/assets/nyanko-club/layout/extras";
  const [image, imgcutText, modelText, numberImage, numberImgcut, commonImage, commonImgcut, frameImage, frameImgcut] = await Promise.all([
    loadImage(`${presetRoot}/img061_00_nyankoClub.png`),
    fetchText(`${presetRoot}/img061_00_nyankoClub.imgcut`),
    fetchText(`${presetRoot}/img061_00_nyankoClub-native.mamodel`),
    loadImage(`${presetRoot}/img001_ja.png`),
    fetchText(`${presetRoot}/img001_ja.imgcut`),
    loadImage(`${presetRoot}/img006_ja.png`),
    fetchText(`${presetRoot}/img006_ja.imgcut`),
    loadImage(`${presetRoot}/img008_ja.png`),
    fetchText(`${presetRoot}/img008_ja.imgcut`),
  ]);
  const textureMap = new Map([
    ["img001", { image: numberImage, cuts: parseImgcut(numberImgcut) }],
    ["img006", { image: commonImage, cuts: parseImgcut(commonImgcut) }],
    ["img008", { image: frameImage, cuts: parseImgcut(frameImgcut) }],
  ]);
  const standaloneTextures = [
    "profile-709-0",
    "abyss-medal-174",
    "abyss-medal-175",
    "abyss-medal-176",
    "abyss-medal-177",
  ];
  const extras = await Promise.all(
    standaloneTextures.map(async (id) => [id, await loadImage(`${extraRoot}/${id}.png`)]),
  );
  extras.forEach(([id, extraImage]) => textureMap.set(id, { image: extraImage, cuts: null }));
  return {
    image,
    cuts: parseImgcut(imgcutText),
    nodes: parseModel(modelText),
    textures: textureMap,
  };
}

export class NyankoClubRenderer {
  static width = LOGICAL_WIDTH;
  static height = LOGICAL_HEIGHT;

  constructor(canvas, assets) {
    this.canvas = canvas;
    this.image = assets.image;
    this.cuts = assets.cuts;
    this.nodes = assets.nodes;
    this.textures = assets.textures;
    this.mode = "normal";
    this.stampDays = 0;
    this.values = {};
    this.nativeCardOpacity = 1;
    this.customLayers = new Map();
    this.width = LOGICAL_WIDTH;
    this.height = LOGICAL_HEIGHT;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  setAspectRatio(ratio) {
    const safeRatio = Math.max(16 / 9, Math.min(21 / 9, Number(ratio) || 20 / 9));
    this.width = Math.round(this.height * safeRatio);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  setMode(mode) {
    this.mode = mode === "gold" ? "gold" : "normal";
  }

  setStampDays(days) {
    this.stampDays = Math.max(0, Math.min(20, Number(days) || 0));
  }

  setValues(values) {
    this.values = { ...this.values, ...values };
  }

  setNativeCardOpacity(opacity) {
    this.nativeCardOpacity = Math.max(0, Math.min(1, Number(opacity) || 0));
  }

  setCustomLayerImage(layerId, image) {
    if (!CUSTOM_LAYER_IDS.has(layerId) || !image) return;
    this.customLayers.set(layerId, {
      image,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      opacity: 1,
    });
  }

  setCustomLayerTransform(layerId, changes) {
    const layer = this.customLayers.get(layerId);
    if (!layer) return;
    if (Number.isFinite(changes.offsetX)) layer.offsetX = changes.offsetX;
    if (Number.isFinite(changes.offsetY)) layer.offsetY = changes.offsetY;
    if (Number.isFinite(changes.scale)) layer.scale = Math.max(0.1, Math.min(5, changes.scale));
    if (Number.isFinite(changes.opacity)) layer.opacity = Math.max(0, Math.min(1, changes.opacity));
  }

  resetCustomLayerTransform(layerId) {
    const layer = this.customLayers.get(layerId);
    if (!layer) return;
    Object.assign(layer, { offsetX: 0, offsetY: 0, scale: 1 });
  }

  removeCustomLayer(layerId) {
    this.customLayers.delete(layerId);
  }

  customLayerState(layerId) {
    return this.customLayers.get(layerId) ?? null;
  }

  customLayerRegion(layerId) {
    const scale = this.height / 640;
    const xOffset = (this.width - NATIVE_LAYOUT_WIDTH * scale) / 2;
    const regions = {
      brown: { x: 100, y: 0, width: this.width - 200, height: this.height, radius: 0 },
      card: { x: xOffset + 90 * scale, y: -40 * scale + 118 * scale, width: 780 * scale, height: 484 * scale, radius: 22 },
      character: { x: xOffset + 666 * scale, y: 125 * scale, width: 165 * scale, height: 127.5 * scale, radius: 0 },
    };
    return regions[layerId] ?? null;
  }

  pointInsideCustomLayer(layerId, x, y) {
    const region = this.customLayerRegion(layerId);
    return Boolean(region)
      && x >= region.x && x <= region.x + region.width
      && y >= region.y && y <= region.y + region.height;
  }

  backButtonRegion() {
    return { x: 97, y: this.height - 97, width: 102, height: 97 };
  }

  render() {
    this.renderTo(this.canvas.getContext("2d"), 1);
  }

  createExportCanvas(scale = 2) {
    const safeScale = Math.max(1, Math.min(4, Number(scale) || 2));
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = this.width * safeScale;
    exportCanvas.height = this.height * safeScale;
    this.renderTo(exportCanvas.getContext("2d"), safeScale);
    return exportCanvas;
  }

  renderTo(context, outputScale) {
    context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, this.width, this.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const transforms = new Map();
    let brownLayerDrawn = false;
    let cardLayerDrawn = false;
    this.nodes.forEach((node) => {
      if (!brownLayerDrawn && node.nodeId === 2) {
        this.drawCustomLayer(context, "brown");
        brownLayerDrawn = true;
      }
      if (!cardLayerDrawn && node.nodeId === 6) {
        this.drawCustomLayer(context, "card");
        cardLayerDrawn = true;
      }
      if (node.nodeId === 106 && this.customLayers.has("character")) {
        this.drawCustomLayer(context, "character");
        return;
      }
      this.drawNode(context, node, transforms);
    });
    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  clipCustomLayer(context, region) {
    context.beginPath();
    if (region.radius > 0 && typeof context.roundRect === "function") {
      context.roundRect(region.x, region.y, region.width, region.height, region.radius);
    } else if (region.radius > 0) {
      const right = region.x + region.width;
      const bottom = region.y + region.height;
      context.moveTo(region.x + region.radius, region.y);
      context.lineTo(right - region.radius, region.y);
      context.quadraticCurveTo(right, region.y, right, region.y + region.radius);
      context.lineTo(right, bottom - region.radius);
      context.quadraticCurveTo(right, bottom, right - region.radius, bottom);
      context.lineTo(region.x + region.radius, bottom);
      context.quadraticCurveTo(region.x, bottom, region.x, bottom - region.radius);
      context.lineTo(region.x, region.y + region.radius);
      context.quadraticCurveTo(region.x, region.y, region.x + region.radius, region.y);
      context.closePath();
    } else {
      context.rect(region.x, region.y, region.width, region.height);
    }
    context.clip();
  }

  drawCustomLayer(context, layerId) {
    const layer = this.customLayers.get(layerId);
    const region = this.customLayerRegion(layerId);
    if (!layer?.image || !region || layer.opacity <= 0) return;
    const imageWidth = layer.image.naturalWidth || layer.image.width;
    const imageHeight = layer.image.naturalHeight || layer.image.height;
    if (!imageWidth || !imageHeight) return;
    const coverScale = Math.max(region.width / imageWidth, region.height / imageHeight);
    const width = imageWidth * coverScale * layer.scale;
    const height = imageHeight * coverScale * layer.scale;
    const centerX = region.x + region.width / 2 + layer.offsetX;
    const centerY = region.y + region.height / 2 + layer.offsetY;
    context.save();
    this.clipCustomLayer(context, region);
    context.globalAlpha = layer.opacity;
    context.drawImage(layer.image, centerX - width / 2, centerY - height / 2, width, height);
    context.restore();
  }

  rootNode() {
    return this.nodes.find((node) => node.parentId < 0) ?? null;
  }

  cutFor(node, cutId = node.cutId) {
    const texture = this.textureEntry(node);
    const cuts = texture ? texture.cuts : this.cuts;
    return cuts?.[cutId] ?? null;
  }

  textureEntry(node) {
    const textureId = nodeDirective(node, "texture");
    return textureId ? this.textures.get(textureId) ?? null : null;
  }

  textureFor(node) {
    return this.textureEntry(node)?.image ?? this.image;
  }

  nodeTransform(node, cache, visiting = new Set()) {
    if (cache.has(node.nodeId)) return cache.get(node.nodeId);
    if (visiting.has(node.nodeId)) return { x: node.x, y: node.y, scaleX: node.scaleX, scaleY: node.scaleY };
    visiting.add(node.nodeId);
    const parent = this.nodes.find((candidate) => candidate.nodeId === node.parentId);
    const parentTransform = parent
      ? this.nodeTransform(parent, cache, visiting)
      : { x: 0, y: 0, scaleX: 1, scaleY: 1 };
    const transform = {
      x: parentTransform.x + node.x * parentTransform.scaleX,
      y: parentTransform.y + node.y * parentTransform.scaleY,
      scaleX: parentTransform.scaleX * node.scaleX,
      scaleY: parentTransform.scaleY * node.scaleY,
    };
    cache.set(node.nodeId, transform);
    return transform;
  }

  activeMedals() {
    return MEDAL_IDS.filter((id) => Number(this.values[`abyss${id}`]) > 0);
  }

  medalId(node) {
    const match = node.name.match(/アビスメダル(\d+)/);
    return match ? Number(match[1]) : null;
  }

  positionedTransform(node, cache) {
    const transform = { ...this.nodeTransform(node, cache) };
    if (node.nodeId === 6 && Number(this.values.certificationRank) <= 0) transform.x = 193;
    if (node.name.startsWith("ゴールド会員特典アイコン") && this.usesCompactGoldHeader()) transform.y = 356;
    const medalId = this.medalId(node);
    if (medalId !== null) {
      const slot = this.activeMedals().indexOf(medalId);
      if (slot >= 0) {
        transform.x = node.name.includes("数値") ? 145 + slot * 54 : 90 + slot * 53;
      }
    }
    if (nodeDirective(node, "anchor")?.includes("right")) transform.x = this.width + transform.x;
    if (nodeDirective(node, "anchor")?.includes("bottom")) transform.y = this.height + transform.y;
    return this.viewportTransform(node, transform);
  }

  viewportTransform(node, transform) {
    if (nodeDirective(this.rootNode() ?? { name: "" }, "viewport") !== "pixel8") return transform;
    const space = nodeDirective(node, "space") ?? "card";
    if (space === "canvas") return transform;
    const scale = this.height / 640;
    const xOffset = (this.width - NATIVE_LAYOUT_WIDTH * scale) / 2;
    const yOffset = space === "screen" ? 0 : -40 * scale;
    return {
      x: xOffset + transform.x * scale,
      y: yOffset + transform.y * scale,
      scaleX: transform.scaleX * scale,
      scaleY: transform.scaleY * scale,
    };
  }

  stampDay(node, prefix) {
    const match = node.name.match(new RegExp(`${prefix} (\\d+)`));
    return match ? Number(match[1]) : null;
  }

  nodeMatchesState(node) {
    const mode = nodeDirective(node, "mode");
    if (mode && mode !== this.mode) return false;
    const condition = nodeDirective(node, "when");
    if (condition && !Boolean(this.values[condition])) return false;
    if (node.name.startsWith("認定ランク") && Number(this.values.certificationRank) <= 0) return false;
    if (node.name.startsWith("会員番号") && Number(this.values.memberNumber) === -1) return false;
    if (this.usesCompactGoldHeader() && ["累積", "累積日数", "回"].includes(node.name.split(" [", 1)[0])) return false;
    const medalId = this.medalId(node);
    if (medalId !== null && Number(this.values[`abyss${medalId}`]) <= 0) return false;
    const stampNumber = this.stampDay(node, "スタンプ番号");
    if (stampNumber !== null && stampNumber <= this.stampDays) return false;
    return true;
  }

  usesCompactGoldHeader() {
    return this.mode === "gold"
      && (Number(this.values.memberNumber) < 0 || Number(this.values.goldDays) <= 1);
  }

  effectiveCutId(node) {
    const stampDay = this.stampDay(node, "ログインスタンプ");
    if (stampDay !== null) return stampDay <= this.stampDays ? 16 : 17;
    return node.cutId;
  }

  displaySize(node, cut, image, transform) {
    const fill = nodeDirective(node, "fill")?.split("/").map(Number);
    if (fill?.length === 4 && fill.every(Number.isFinite)) {
      const [left, top, right, bottom] = fill;
      return {
        width: Math.max(1, this.width - left - right) / Math.max(0.001, transform.scaleX),
        height: Math.max(1, this.height - top - bottom) / Math.max(0.001, transform.scaleY),
      };
    }
    return {
      width: node.width || cut?.width || image?.naturalWidth || 1,
      height: node.height || cut?.height || image?.naturalHeight || 1,
    };
  }

  nodeCrop(node, image, cut) {
    const crop = nodeDirective(node, "crop")?.split("/").map(Number);
    if (crop?.length === 4 && crop.every(Number.isFinite)) {
      return { x: crop[0], y: crop[1], width: crop[2], height: crop[3] };
    }
    const inset = nodeDirective(node, "inset")?.split("/").map(Number);
    if (cut && inset?.length === 4 && inset.every(Number.isFinite)) {
      const [left, top, right, bottom] = inset;
      return {
        x: cut.x + left,
        y: cut.y + top,
        width: cut.width - left - right,
        height: cut.height - top - bottom,
      };
    }
    if (nodeDirective(node, "texture") && !cut) {
      return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
    }
    return cut ? { x: cut.x, y: cut.y, width: cut.width, height: cut.height } : null;
  }

  formattedValue(key) {
    const value = this.values[key] ?? "";
    const stampMatch = key.match(/^stamp(\d{2})$/);
    if (stampMatch && value === "") {
      return String(Number(stampMatch[1]));
    }
    if (key === "memberNumber" && Number(value) >= 0) {
      return String(Math.trunc(Number(value))).padStart(8, "0").slice(-8);
    }
    if (["expiryHour", "expiryMinute"].includes(key)) {
      return String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(2, "0").slice(-2);
    }
    return String(value);
  }

  digitSource(node, key) {
    const texture = this.textureEntry(node);
    const image = texture?.image ?? this.image;
    const availableCuts = texture?.cuts ?? this.cuts;
    const set = nodeDirective(node, "digits") ?? "large";
    const specifiedBase = Number(nodeDirective(node, "digits-base"));
    const firstCut = Number.isFinite(specifiedBase) && nodeDirective(node, "digits-base") !== null
      ? specifiedBase
      : set === "small" ? 65 : set === "cert" ? 80 : 19;
    const cuts = [...this.formattedValue(key)]
      .filter((character) => /\d/.test(character))
      .map((character) => availableCuts[firstCut + Number(character)])
      .filter(Boolean);
    return { image, cuts };
  }

  drawValue(context, node, transform) {
    const key = nodeDirective(node, "value");
    const { image, cuts } = this.digitSource(node, key);
    if (!image || cuts.length === 0) return;
    if (nodeDirective(node, "digits") === "cert") {
      this.drawCertificationValue(context, node, transform, image, cuts);
      return;
    }
    const spacing = Number(nodeDirective(node, "spacing")) || 0;
    const width = cuts.reduce((total, cut) => total + cut.width * transform.scaleX, 0)
      + Math.max(0, cuts.length - 1) * spacing * transform.scaleX;
    const height = cuts.reduce((maximum, cut) => Math.max(maximum, cut.height * transform.scaleY), 0);
    const align = nodeDirective(node, "align") ?? "left";
    const verticalAlign = nodeDirective(node, "valign") ?? "top";
    let x = transform.x - (align === "right" ? width : align === "center" ? width / 2 : 0);
    const y = transform.y - (verticalAlign === "bottom" ? height : verticalAlign === "center" ? height / 2 : 0);
    context.save();
    const opacityDirective = nodeDirective(node, "opacity");
    const opacity = Number(opacityDirective);
    context.globalAlpha = opacityDirective === null || !Number.isFinite(opacity)
      ? 1
      : Math.max(0, Math.min(1, opacity));
    cuts.forEach((cut) => {
      this.drawTintedImage(context, image, cut, {
        x,
        y,
        width: cut.width * transform.scaleX,
        height: cut.height * transform.scaleY,
      }, nodeDirective(node, "color"));
      x += (cut.width + spacing) * transform.scaleX;
    });
    context.restore();
  }

  drawCertificationValue(context, node, transform, image, cuts) {
    const visibleCuts = cuts.slice(-2);
    const positions = visibleCuts.length === 1
      ? [{ x: -12, y: 1 }]
      : [{ x: -24, y: 5 }, { x: -4, y: 0 }];
    visibleCuts.forEach((cut, index) => {
      this.drawTintedImage(context, image, cut, {
        x: transform.x + positions[index].x * transform.scaleX,
        y: transform.y + positions[index].y * transform.scaleY,
        width: cut.width * transform.scaleX,
        height: cut.height * transform.scaleY,
      }, nodeDirective(node, "color"));
    });
  }

  drawTintedImage(context, image, source, target, tint) {
    if (!tint) {
      context.drawImage(image, source.x, source.y, source.width, source.height, target.x, target.y, target.width, target.height);
      return;
    }
    const buffer = document.createElement("canvas");
    buffer.width = Math.max(1, source.width);
    buffer.height = Math.max(1, source.height);
    const bufferContext = buffer.getContext("2d");
    bufferContext.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
    bufferContext.globalCompositeOperation = "multiply";
    bufferContext.fillStyle = tint;
    bufferContext.fillRect(0, 0, source.width, source.height);
    bufferContext.globalCompositeOperation = "destination-in";
    bufferContext.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
    context.drawImage(buffer, target.x, target.y, target.width, target.height);
  }

  drawNineSlice(context, node, cut, transform, size, markerId, image) {
    const texture = this.textureEntry(node);
    const marker = (texture?.cuts ?? this.cuts)[Number(markerId)];
    if (!marker) return false;
    const left = marker.x - cut.x;
    const top = marker.y - cut.y;
    const centerWidth = marker.width;
    const centerHeight = marker.height;
    const right = cut.width - left - centerWidth;
    const bottom = cut.height - top - centerHeight;
    if ([left, top, right, bottom].some((value) => value < 0)) return false;

    const destinationWidth = size.width * transform.scaleX;
    const destinationHeight = size.height * transform.scaleY;
    const horizontalScale = Math.min(1, destinationWidth / Math.max(1, left + right));
    const verticalScale = Math.min(1, destinationHeight / Math.max(1, top + bottom));
    const sourceColumns = [0, left, left + centerWidth, cut.width];
    const sourceRows = [0, top, top + centerHeight, cut.height];
    const outputTransform = context.getTransform();
    const outputScaleX = Math.max(1, Math.abs(outputTransform.a) || 1);
    const outputScaleY = Math.max(1, Math.abs(outputTransform.d) || 1);
    const buffer = document.createElement("canvas");
    buffer.width = Math.max(1, Math.round(destinationWidth * outputScaleX));
    buffer.height = Math.max(1, Math.round(destinationHeight * outputScaleY));
    const bufferContext = buffer.getContext("2d");
    bufferContext.imageSmoothingEnabled = true;
    bufferContext.imageSmoothingQuality = "high";
    const destinationColumns = [
      0,
      Math.round(left * horizontalScale * outputScaleX),
      buffer.width - Math.round(right * horizontalScale * outputScaleX),
      buffer.width,
    ];
    const destinationRows = [
      0,
      Math.round(top * verticalScale * outputScaleY),
      buffer.height - Math.round(bottom * verticalScale * outputScaleY),
      buffer.height,
    ];

    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const sourceWidth = sourceColumns[column + 1] - sourceColumns[column];
        const sourceHeight = sourceRows[row + 1] - sourceRows[row];
        const targetWidth = destinationColumns[column + 1] - destinationColumns[column];
        const targetHeight = destinationRows[row + 1] - destinationRows[row];
        if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) continue;
        bufferContext.drawImage(
          image,
          cut.x + sourceColumns[column], cut.y + sourceRows[row], sourceWidth, sourceHeight,
          destinationColumns[column], destinationRows[row], targetWidth, targetHeight,
        );
      }
    }
    context.drawImage(buffer, transform.x, transform.y, destinationWidth, destinationHeight);
    return true;
  }

  drawRepeated(context, node, source, transform, size, overlapText, image) {
    const overlap = Math.max(0, Number(overlapText) || 0);
    const rotation = Number(nodeDirective(node, "rotate")) || 0;
    const quarterTurn = Math.abs(rotation) === 90;
    const destinationWidth = size.width * transform.scaleX;
    const destinationHeight = size.height * transform.scaleY;
    const tileWidth = (quarterTurn ? source.height : source.width) * transform.scaleX;
    const tileHeight = (quarterTurn ? source.width : source.height) * transform.scaleY;
    const stepX = Math.max(1, tileWidth - overlap * transform.scaleX);
    const stepY = Math.max(1, tileHeight - overlap * transform.scaleY);
    context.save();
    context.beginPath();
    context.rect(transform.x, transform.y, destinationWidth, destinationHeight);
    context.clip();
    for (let y = transform.y; y < transform.y + destinationHeight; y += stepY) {
      for (let x = transform.x; x < transform.x + destinationWidth; x += stepX) {
        if (rotation === 90) {
          context.save();
          context.translate(x + tileWidth, y);
          context.rotate(Math.PI / 2);
          context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, tileHeight, tileWidth);
          context.restore();
        } else if (rotation === -90) {
          context.save();
          context.translate(x, y + tileHeight);
          context.rotate(-Math.PI / 2);
          context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, tileHeight, tileWidth);
          context.restore();
        } else {
          context.drawImage(image, source.x, source.y, source.width, source.height, x, y, tileWidth, tileHeight);
        }
      }
    }
    context.restore();
  }

  drawNode(context, node, transforms) {
    if (!node.visible || node.parentId < 0 || !this.nodeMatchesState(node)) return;
    const transform = this.positionedTransform(node, transforms);
    if (nodeDirective(node, "value")) {
      this.drawValue(context, node, transform);
      return;
    }
    const cut = this.cutFor(node, this.effectiveCutId(node));
    const image = this.textureFor(node);
    const source = image ? this.nodeCrop(node, image, cut) : null;
    if (!image || !source) return;
    const size = this.displaySize(node, cut, image, transform);
    const repeatOverlap = nodeDirective(node, "repeat");
    const nineSliceMarker = nodeDirective(node, "9slice");
    const blendMode = nodeDirective(node, "blend");
    context.save();
    if (CARD_BACKGROUND_NAMES.has(node.name.split(" [", 1)[0])) {
      context.globalAlpha *= this.nativeCardOpacity;
    }
    if (blendMode === "add") context.globalCompositeOperation = "lighter";
    else if (blendMode) context.globalCompositeOperation = blendMode;
    if (repeatOverlap !== null) {
      this.drawRepeated(context, node, source, transform, size, repeatOverlap, image);
      context.restore();
      return;
    }
    if (cut && nineSliceMarker !== null && this.drawNineSlice(context, node, cut, transform, size, nineSliceMarker, image)) {
      context.restore();
      return;
    }
    this.drawTintedImage(context, image, source, {
      x: transform.x,
      y: transform.y,
      width: size.width * transform.scaleX,
      height: size.height * transform.scaleY,
    }, nodeDirective(node, "tint"));
    context.restore();
  }
}
