const photoshop = require("photoshop");
const { app, action, core, constants } = photoshop;
const { storage, xmp, entrypoints, host } = require("uxp");
const localFileSystem = storage.localFileSystem;
const PANEL_ENTRYPOINT_ID = "psdCleanerPanel";

const EMPTY_XMP = [
  "<?xpacket begin=\"\uFEFF\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>",
  "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core\">",
  "<rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\"/>",
  "</x:xmpmeta>",
  "<?xpacket end=\"w\"?>"
].join("\n");

const OPTION_IDS = [
  "deleteMetaData",
  "deleteEmptyLayer",
  "deleteHiddenStyle"
];

const LANGUAGE_STORAGE_KEY = "psdOptimizerLanguage";
const STRINGS = {
  en: {
    panelTitle: "Optimization Options",
    metadataName: "Metadata",
    emptyLayersName: "Empty Layers",
    layerStylesName: "Layer Styles",
    overwriteLabel: "Overwrite Current Document",
    cleanSelected: "Optimize Selection",
    cleanDocument: "Optimize Document",
    readyTitle: "Ready",
    readyDetail: "Open a PSD, PSB, or PNG file to begin.",
    helpTitle: "Optimization Options",
    languageLabel: "Interface Language",
    languageHint: "Choose the display language",
    helpMetadata: "Remove document metadata",
    helpEmptyLayers: "Remove empty layers",
    helpLayerStyles: "Remove disabled layer styles",
    helpNote: "Overwrite off creates a “filename_fix” copy; existing copies advance to “_fix_2”. PSD and PSB keep their format, while other files save as PSD. Enable overwrite only to replace the current file.",
    helpAria: "About optimization options",
    closeAria: "Close",
    languageAria: "Switch interface language",
    optionsAria: "Optimization options",
    saveAria: "Save behavior",
    actionsAria: "Optimization actions",
    selectedCount: (count) => `${count} ${count === 1 ? "option" : "options"}`,
    fileCount: (count) => `${count} ${count === 1 ? "file" : "files"}`,
    metadataCount: (count) => `Metadata ${count}`,
    emptyCount: (count) => `Empty layers ${count}`,
    styleCount: (count) => `Layer styles ${count}`,
    sizeChange: (before, after, delta, percent) =>
      `Size: ${before} → ${after} · ${delta}${percent ? ` (${percent})` : ""}`,
    sizeAfterOnly: (after) => `Size after optimization: ${after}`,
    sizeUnavailable: "File size change unavailable",
    errorCount: (count) => `Errors ${count}`,
    warningCount: (count) => `Warnings ${count}`,
    nothingToOptimize: "Nothing to optimize",
    operationFailed: "Photoshop operation failed",
    metadataWriteFailed: "Failed to update document metadata",
    xmpUnavailable: "This UXP runtime cannot safely update saved-file XMP metadata",
    xmpBlocked: "Photoshop cannot update this file's XMP metadata",
    emptyCommandFailed: "Remove Empty Layers command failed",
    selectLayerFailed: (name) => `Could not select layer: ${name}`,
    unlockLayerFailed: (name) => `Could not temporarily unlock layer: ${name}`,
    restoreLockFailed: (name) => `Could not restore layer lock: ${name}`,
    stylesWriteFailed: "Failed to update layer styles",
    stylesRemoveFailed: "Failed to remove layer styles",
    emptyUnavailable: (detail) => `Remove Empty Layers is unavailable: ${detail}`,
    cancelled: "Cancelled by user",
    lockedUnchanged: (name) => `Locked layer left unchanged: ${name}`,
    styleLayerFailed: (name, detail) => `Could not process layer styles for ${name}: ${detail}`,
    processing: (name) => `Processing ${name}`,
    metadataFailed: (detail) => `Could not clear document metadata: ${detail}`,
    noOptionsTitle: "No Options Selected",
    noOptionsDetail: "Select at least one optimization option.",
    noDocumentTitle: "No Open Document",
    noDocumentDetail: "Open a PSD, PSB, or PNG file in Photoshop first.",
    optimizingTitle: "Optimizing",
    optimizingDetail: "Please do not use Photoshop while processing.",
    completedWithErrors: "Completed with Errors",
    optimizationComplete: "Optimization Complete",
    savedAs: (name) => `Saved as ${name}`,
    overwritten: "Current document overwritten",
    optimizationFailed: "Optimization Failed",
    copyPathConflict: "The optimized copy must use a different path from the original file"
  },
  zh: {
    panelTitle: "优化选项",
    metadataName: "元数据",
    emptyLayersName: "空白图层",
    layerStylesName: "图层样式",
    overwriteLabel: "覆盖当前文档",
    cleanSelected: "优化选中图层",
    cleanDocument: "优化当前文档",
    readyTitle: "准备就绪",
    readyDetail: "请先打开 PSD、PSB 或 PNG 文件。",
    helpTitle: "优化选项说明",
    languageLabel: "界面语言",
    languageHint: "选择插件显示语言",
    helpMetadata: "删除文档元数据",
    helpEmptyLayers: "删除空白图层",
    helpLayerStyles: "删除已关闭的图层样式",
    helpNote: "关闭覆盖时生成“原文件名_fix”副本，同名副本顺延为“_fix_2”。PSD 和 PSB 保留原格式，其他文件另存为 PSD。仅在需要替换当前文件时开启覆盖。",
    helpAria: "查看优化选项说明",
    closeAria: "关闭",
    languageAria: "切换界面语言",
    optionsAria: "优化选项",
    saveAria: "保存方式",
    actionsAria: "优化操作",
    selectedCount: (count) => `${count} 项`,
    fileCount: (count) => `${count} 个文件`,
    metadataCount: (count) => `元数据 ${count}`,
    emptyCount: (count) => `空白图层 ${count}`,
    styleCount: (count) => `图层样式 ${count}`,
    sizeChange: (before, after, delta, percent) =>
      `体积：${before} → ${after} · ${delta}${percent ? `（${percent}）` : ""}`,
    sizeAfterOnly: (after) => `优化后体积：${after}`,
    sizeUnavailable: "无法读取文件体积变化",
    errorCount: (count) => `错误 ${count}`,
    warningCount: (count) => `提示 ${count}`,
    nothingToOptimize: "未发现可优化内容",
    operationFailed: "Photoshop 操作失败",
    metadataWriteFailed: "文档元数据写入失败",
    xmpUnavailable: "当前 UXP 环境无法安全更新已保存文件的 XMP 元数据",
    xmpBlocked: "Photoshop 当前无法更新此文件的 XMP 元数据",
    emptyCommandFailed: "删除空白图层命令失败",
    selectLayerFailed: (name) => `无法选择图层：${name}`,
    unlockLayerFailed: (name) => `无法临时解锁图层：${name}`,
    restoreLockFailed: (name) => `无法恢复图层锁定：${name}`,
    stylesWriteFailed: "图层样式写入失败",
    stylesRemoveFailed: "图层样式删除失败",
    emptyUnavailable: (detail) => `删除空白图层命令不可用：${detail}`,
    cancelled: "用户已取消",
    lockedUnchanged: (name) => `锁定图层保持不变：${name}`,
    styleLayerFailed: (name, detail) => `无法处理图层 ${name} 的样式：${detail}`,
    processing: (name) => `正在处理 ${name}`,
    metadataFailed: (detail) => `无法清空文档元数据：${detail}`,
    noOptionsTitle: "未选择优化项",
    noOptionsDetail: "请至少选择一个优化项目。",
    noDocumentTitle: "没有打开的文档",
    noDocumentDetail: "请先在 Photoshop 中打开 PSD、PSB 或 PNG 文件。",
    optimizingTitle: "正在优化",
    optimizingDetail: "处理期间请勿操作 Photoshop。",
    completedWithErrors: "部分操作失败",
    optimizationComplete: "优化完成",
    savedAs: (name) => `已保存为 ${name}`,
    overwritten: "已覆盖当前文档",
    optimizationFailed: "优化失败",
    copyPathConflict: "优化副本必须使用与原文件不同的保存路径"
  }
};

let busy = false;
let currentLanguage = "en";
let statusRenderer = null;
let panelVisible = false;
let uxpCommandListenerAttached = false;
try {
  const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (storedLanguage === "zh" || storedLanguage === "en") {
    currentLanguage = storedLanguage;
  }
} catch (_) {
  // UXP can still switch languages for this session when storage is unavailable.
}

function t(key, ...args) {
  const value = STRINGS[currentLanguage][key];
  return typeof value === "function" ? value(...args) : value;
}

function setPanelVisibility(value) {
  panelVisible = Boolean(value);
  if (panelVisible) {
    updateOptionUI();
    renderLocalizedStatus();
  } else {
    closeHelpDialog();
  }
}

function handleUxpCommand(event) {
  const commandId = event && event.commandId;
  if (commandId === "uxpshowpanel") {
    setPanelVisibility(true);
  } else if (commandId === "uxphidepanel") {
    setPanelVisibility(false);
  }
}

function attachUxpCommandListener() {
  if (uxpCommandListenerAttached) return;
  document.addEventListener("uxpcommand", handleUxpCommand);
  uxpCommandListenerAttached = true;
}

function detachUxpCommandListener() {
  if (!uxpCommandListenerAttached) return;
  document.removeEventListener("uxpcommand", handleUxpCommand);
  uxpCommandListenerAttached = false;
}

function initializePanelLifecycle() {
  attachUxpCommandListener();
  entrypoints.setup({
    plugin: {
      create() {
        attachUxpCommandListener();
      },
      destroy() {
        detachUxpCommandListener();
        setPanelVisibility(false);
      }
    },
    panels: {
      [PANEL_ENTRYPOINT_ID]: {
        create() {
          attachUxpCommandListener();
        },
        show() {
          setPanelVisibility(true);
        },
        hide() {
          setPanelVisibility(false);
        },
        destroy() {
          setPanelVisibility(false);
        }
      }
    }
  });
}

function createStats() {
  return {
    documents: 0,
    files: 0,
    metadata: 0,
    emptyLayers: 0,
    hiddenStyles: 0,
    bytesBefore: null,
    bytesAfter: null,
    warnings: [],
    errors: []
  };
}

function getOptions(cleanType) {
  const options = { cleanType };
  OPTION_IDS.forEach((id) => {
    options[id] = document.getElementById(id).checked;
  });
  options.overrideDoc = document.getElementById("overrideDoc").checked;
  return options;
}

function hasCleanOption(options) {
  return OPTION_IDS.some((id) => options[id]);
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll(".action-button").forEach((control) => {
    control.classList.toggle("is-disabled", value);
    control.setAttribute("aria-disabled", String(value));
    control.setAttribute("tabindex", value ? "-1" : "0");
  });
}

function setStatus(state, title, detail, sizeDetail = "") {
  const status = document.getElementById("status");
  status.dataset.state = state;
  document.getElementById("statusTitle").textContent = title;
  document.getElementById("statusDetail").textContent = detail;
  document.getElementById("statusSize").textContent = sizeDetail;
}

function resolveLocalizedValue(value) {
  if (typeof value === "function") return value();
  return value ? t(value) : "";
}

function setLocalizedStatus(state, titleKey, detail, sizeDetail = "") {
  statusRenderer = () => ({
    state,
    title: t(titleKey),
    detail: resolveLocalizedValue(detail),
    sizeDetail: resolveLocalizedValue(sizeDetail)
  });
  renderLocalizedStatus();
}

function renderLocalizedStatus() {
  if (!statusRenderer) return;
  const status = statusRenderer();
  setStatus(status.state, status.title, status.detail, status.sizeDetail);
}

function resetStatusForOperation() {
  statusRenderer = null;
  setStatus("idle", "", "", "");
}

function updateOptionUI() {
  let count = 0;
  OPTION_IDS.forEach((id) => {
    const input = document.getElementById(id);
    const card = input.closest(".option-card");
    card.classList.toggle("is-selected", input.checked);
    if (input.checked) count += 1;
  });
  document.getElementById("selectedCount").textContent = t("selectedCount", count);
}

function flattenLayers(layers) {
  const result = [];
  const stack = Array.from(layers || []).reverse();
  while (stack.length) {
    const layer = stack.pop();
    result.push(layer);
    if (layer.layers && layer.layers.length) {
      const children = Array.from(layer.layers);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push(children[index]);
      }
    }
  }
  return result;
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function formatSizeChange(stats) {
  const before = stats.bytesBefore;
  const after = stats.bytesAfter;
  if (!Number.isFinite(after)) return t("sizeUnavailable");
  if (!Number.isFinite(before)) return t("sizeAfterOnly", formatBytes(after));

  const difference = after - before;
  const delta = difference === 0
    ? "±0 B"
    : `${difference < 0 ? "−" : "+"}${formatBytes(Math.abs(difference))}`;
  const percent = before > 0 && difference !== 0
    ? `${difference < 0 ? "−" : "+"}${Math.abs(difference / before * 100).toFixed(1)}%`
    : "";
  return t(
    "sizeChange",
    formatBytes(before),
    formatBytes(after),
    delta,
    percent
  );
}

function summarize(stats) {
  const parts = [];
  if (stats.files) parts.push(t("fileCount", stats.files));
  if (stats.metadata) parts.push(t("metadataCount", stats.metadata));
  if (stats.emptyLayers) parts.push(t("emptyCount", stats.emptyLayers));
  if (stats.hiddenStyles) parts.push(t("styleCount", stats.hiddenStyles));

  if (stats.errors.length) parts.push(t("errorCount", stats.errors.length));
  if (stats.warnings.length) parts.push(t("warningCount", stats.warnings.length));
  return parts.length ? parts.join(" · ") : t("nothingToOptimize");
}

async function safeMetadataSize(entry) {
  try {
    const metadata = await entry.getMetadata();
    const size = Number(metadata.size);
    return Number.isFinite(size) ? size : null;
  } catch (_) {
    return null;
  }
}

function batchPlayError(results, fallbackMessage) {
  const error = Array.from(results || []).find(
    (result) => result && String(result._obj).toLowerCase() === "error"
  );
  if (!error) return null;
  return new Error(error.message || fallbackMessage || t("operationFailed"));
}

async function runBatchPlay(descriptors, options = {}, fallbackMessage) {
  const results = await action.batchPlay(descriptors, options);
  const error = batchPlayError(results, fallbackMessage);
  if (error) throw error;
  return results;
}

async function getDocumentPath(doc) {
  try {
    const [result] = await action.batchPlay([
      {
        _obj: "get",
        _target: [
          { _property: "fileReference" },
          { _ref: "document", _id: doc.id }
        ],
        _options: { dialogOptions: "dontDisplay" }
      }
    ], {});
    const reference = result && result.fileReference;
    if (typeof reference === "string") return reference;
    return reference && reference._path ? reference._path : null;
  } catch (_) {
    return null;
  }
}

function fileUrl(nativePath) {
  const normalized = nativePath.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized)) return `file:/${normalized}`;
  return `file:${normalized}`;
}

function splitNativePath(nativePath) {
  const value = String(nativePath || "");
  const separatorIndex = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  const directory = separatorIndex >= 0 ? value.slice(0, separatorIndex) : "";
  const fileName = separatorIndex >= 0 ? value.slice(separatorIndex + 1) : value;
  const dotIndex = fileName.lastIndexOf(".");
  const hasExtension = dotIndex > 0;
  return {
    directory,
    separator: value.includes("\\") && !value.includes("/") ? "\\" : "/",
    stem: hasExtension ? fileName.slice(0, dotIndex) : fileName || "document",
    extension: hasExtension ? fileName.slice(dotIndex) : ""
  };
}

function siblingNativePath(nativePath, fileName) {
  const parts = splitNativePath(nativePath);
  return parts.directory
    ? `${parts.directory}${parts.separator}${fileName}`
    : fileName;
}

function copyExtension(nativePath) {
  return splitNativePath(nativePath).extension.toLowerCase() === ".psb"
    ? ".psb"
    : ".psd";
}

function sameNativePath(firstPath, secondPath) {
  if (!firstPath || !secondPath) return false;
  const normalize = (value) => String(value)
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
  return normalize(firstPath) === normalize(secondPath);
}

async function entryFromDocument(doc) {
  const nativePath = await getDocumentPath(doc);
  if (!nativePath) return null;
  try {
    return await localFileSystem.getEntryWithUrl(fileUrl(nativePath));
  } catch (_) {
    return null;
  }
}

async function uniqueFixEntry(nativePath) {
  if (nativePath) {
    const { stem } = splitNativePath(nativePath);
    const extension = copyExtension(nativePath);
    for (let suffix = 1; suffix <= 999; suffix += 1) {
      const marker = suffix === 1 ? "_fix" : `_fix_${suffix}`;
      const targetPath = siblingNativePath(
        nativePath,
        `${stem}${marker}${extension}`
      );
      try {
        return await localFileSystem.createEntryWithUrl(fileUrl(targetPath), {
          overwrite: false
        });
      } catch (error) {
        if (!/exist/i.test(String(error && (error.code || error.message || error)))) {
          break;
        }
      }
    }
  }
  return null;
}

async function makeCopyEntry(doc, sourceEntry = null) {
  const nativePath = sourceEntry && sourceEntry.nativePath
    ? sourceEntry.nativePath
    : await getDocumentPath(doc);
  const automaticEntry = await uniqueFixEntry(nativePath);
  if (automaticEntry) return automaticEntry;

  const fallbackStem = nativePath
    ? splitNativePath(nativePath).stem
    : "document";
  const extension = copyExtension(nativePath);
  const fallbackEntry = await localFileSystem.getFileForSaving(
    `${fallbackStem}_fix${extension}`,
    {
      types: [extension.slice(1)]
    }
  );
  if (
    fallbackEntry
    && nativePath
    && sameNativePath(fallbackEntry.nativePath, nativePath)
  ) {
    throw new Error(t("copyPathConflict"));
  }
  return fallbackEntry;
}

async function saveCopy(doc, entry) {
  const nativePath = entry && (entry.nativePath || entry.name);
  const saveOptions = { maximizeCompatibility: true };
  if (copyExtension(nativePath) === ".psb") {
    await doc.saveAs.psb(entry, saveOptions, true);
  } else {
    await doc.saveAs.psd(entry, saveOptions, true);
  }
}

async function setActiveDocument(doc) {
  if (app.activeDocument && app.activeDocument.id === doc.id) return;
  app.activeDocument = doc;
}

async function clearDocumentMetadata(doc) {
  const descriptor = {
    _obj: "set",
    _target: [
      { _ref: "property", _property: "XMPMetadataAsUTF8" },
      { _ref: "document", _id: doc.id }
    ],
    to: {
      _obj: "document",
      XMPMetadataAsUTF8: EMPTY_XMP
    },
    _options: { dialogOptions: "dontDisplay" }
  };
  await runBatchPlay([descriptor], {}, t("metadataWriteFailed"));
}

function stripSavedFileMetadata(nativePath) {
  if (!nativePath || !xmp || !xmp.XMPFile || !xmp.XMPMeta || !xmp.XMPConst) {
    throw new Error(t("xmpUnavailable"));
  }

  const { XMPFile, XMPMeta, XMPConst } = xmp;
  const extension = splitNativePath(nativePath).extension.toLowerCase();
  const fileFormat = extension === ".png"
    ? XMPConst.FILE_PNG
    : XMPConst.FILE_PHOTOSHOP;
  let xmpFile = null;
  try {
    xmpFile = new XMPFile(
      nativePath,
      fileFormat,
      XMPConst.OPEN_FOR_UPDATE
    );
    const emptyMetadata = new XMPMeta(EMPTY_XMP);
    if (!xmpFile.canPutXMP(emptyMetadata)) {
      throw new Error(t("xmpBlocked"));
    }
    xmpFile.putXMP(emptyMetadata);
    xmpFile.closeFile(XMPConst.CLOSE_UPDATE_SAFELY);
    xmpFile = null;
  } finally {
    if (xmpFile) {
      try {
        xmpFile.closeFile();
      } catch (_) {
        // Preserve the original XMP error.
      }
    }
  }
}

async function deleteAllEmptyLayers(doc) {
  await setActiveDocument(doc);
  await runBatchPlay([
    {
      _obj: "a0754df2-9c60-4b64-a940-6a2bb1102652",
      _target: [
        { _ref: "document", _id: doc.id }
      ],
      _options: { dialogOptions: "dontDisplay" }
    }
  ], {}, t("emptyCommandFailed"));
}

async function getLayerDescriptor(layer) {
  const [result] = await action.batchPlay([
    {
      _obj: "get",
      _target: [
        { _ref: "layer", _id: layer.id },
        { _ref: "document", _id: layer.document.id }
      ],
      _options: { dialogOptions: "dontDisplay" }
    }
  ], {});
  return result || {};
}

async function selectLayer(layer) {
  await setActiveDocument(layer.document);
  await runBatchPlay([
    {
      _obj: "select",
      _target: [{ _ref: "layer", _id: layer.id }],
      makeVisible: false,
      layerID: [layer.id],
      _options: { dialogOptions: "dontDisplay" }
    }
  ], {}, t("selectLayerFailed", layer.name));
}

async function unlockLayer(layer) {
  await runBatchPlay([
    {
      _obj: "applyLocking",
      _target: [{ _ref: "layer", _id: layer.id }],
      layerLocking: {
        _obj: "layerLocking",
        protectNone: true
      },
      _options: { dialogOptions: "dontDisplay" }
    }
  ], {}, t("unlockLayerFailed", layer.name));
}

async function lockLayer(layer) {
  await runBatchPlay([
    {
      _obj: "applyLocking",
      _target: [{ _ref: "layer", _id: layer.id }],
      layerLocking: {
        _obj: "layerLocking",
        protectAll: true
      },
      _options: { dialogOptions: "dontDisplay" }
    }
  ], {}, t("restoreLockFailed", layer.name));
}

function pruneHiddenEffects(layerEffects, removeAll) {
  const cleaned = {};
  let removed = 0;

  Object.entries(layerEffects || {}).forEach(([key, value]) => {
    if (key === "scale" || key === "_obj") {
      cleaned[key] = value;
      return;
    }

    if (Array.isArray(value)) {
      const visibleItems = value.filter((item) => {
        const present = item && item.present !== false;
        const hidden = present && (removeAll || item.enabled === false);
        if (hidden) removed += 1;
        return !hidden;
      });
      if (visibleItems.length) cleaned[key] = visibleItems;
      return;
    }

    if (value && typeof value === "object") {
      const isEffect = Object.prototype.hasOwnProperty.call(value, "enabled")
        || Object.prototype.hasOwnProperty.call(value, "present");
      const present = value.present !== false;
      const hidden = isEffect
        && present
        && (removeAll || value.enabled === false);
      if (hidden) {
        removed += 1;
      } else {
        cleaned[key] = value;
      }
      return;
    }

    cleaned[key] = value;
  });

  return { cleaned, removed };
}

function hasPresentEffects(layerEffects) {
  return Object.entries(layerEffects || {}).some(([key, value]) => {
    if (key === "scale" || key === "_obj") return false;
    const values = Array.isArray(value) ? value : [value];
    return values.some((item) => item
      && typeof item === "object"
      && item.present !== false
      && item.enabled !== false);
  });
}

async function setLayerEffects(layer, layerEffects) {
  await selectLayer(layer);
  await runBatchPlay([
    {
      _obj: "set",
      _target: [
        { _ref: "property", _property: "layerEffects" },
        { _ref: "layer", _id: layer.id }
      ],
      to: {
        _obj: "layerEffects",
        ...layerEffects
      },
      _options: { dialogOptions: "dontDisplay" }
    }
  ], {}, t("stylesWriteFailed"));
}

async function clearLayerEffects(layer) {
  await selectLayer(layer);
  await runBatchPlay([
    {
      _obj: "disableLayerStyle",
      _target: [{ _ref: "layer", _id: layer.id }],
      _options: { dialogOptions: "dontDisplay" }
    }
  ], {}, t("stylesRemoveFailed"));
}

async function removeHiddenStyle(layer) {
  const descriptor = await getLayerDescriptor(layer);
  if (!descriptor.layerEffects) return 0;

  const { cleaned, removed } = pruneHiddenEffects(
    descriptor.layerEffects,
    descriptor.layerFXVisible === false
  );
  if (!removed) return 0;

  if (hasPresentEffects(cleaned)) {
    await setLayerEffects(layer, cleaned);
  } else {
    await clearLayerEffects(layer);
  }
  return removed;
}

function throwIfCancelled(executionContext) {
  if (executionContext && executionContext.isCancelled) {
    throw new Error(t("cancelled"));
  }
}

function rethrowIfCancelled(error, executionContext) {
  if (executionContext && executionContext.isCancelled) {
    throw error;
  }
}

function hostVersionAtLeast(requiredMajor, requiredMinor) {
  const [majorText = "", minorText = ""] = String(
    host && host.version ? host.version : ""
  ).split(".");
  const major = Number.parseInt(majorText, 10);
  const minor = Number.parseInt(minorText, 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  return major > requiredMajor
    || (major === requiredMajor && minor >= requiredMinor);
}

function modalExecutionOptions() {
  const options = { commandName: "PSD Optimizer" };
  if (hostVersionAtLeast(25, 10)) {
    options.timeOut = 10000;
  }
  return options;
}

async function cleanDocument(doc, options, stats, executionContext) {
  throwIfCancelled(executionContext);
  await setActiveDocument(doc);
  stats.documents += 1;
  const requestedTargetIds = options.cleanType === "selected"
    ? new Set(Array.from(doc.activeLayers || []).map((layer) => layer.id))
    : null;

  if (options.deleteEmptyLayer) {
    try {
      throwIfCancelled(executionContext);
      const layerIdsBefore = new Set(
        flattenLayers(doc.layers).map((layer) => layer.id)
      );
      await deleteAllEmptyLayers(doc);
      const layerIdsAfter = new Set(
        flattenLayers(doc.layers).map((layer) => layer.id)
      );
      stats.emptyLayers += Array.from(layerIdsBefore).filter(
        (layerId) => !layerIdsAfter.has(layerId)
      ).length;
    } catch (error) {
      rethrowIfCancelled(error, executionContext);
      stats.warnings.push(t("emptyUnavailable", error.message || error));
    }
  }

  if (options.deleteHiddenStyle) {
    throwIfCancelled(executionContext);
    const allLayers = flattenLayers(doc.layers);
    const targets = requestedTargetIds
      ? allLayers.filter((layer) => requestedTargetIds.has(layer.id))
      : allLayers;

    const lockedLayers = [];
    try {
      for (let index = 0; index < targets.length; index += 1) {
        if (executionContext.isCancelled) {
          throw new Error(t("cancelled"));
        }
        const layer = targets[index];
        if (!layer || layer.isBackgroundLayer) continue;

        const wasLocked = layer.allLocked === true;
        if (wasLocked) {
          try {
            await unlockLayer(layer);
            lockedLayers.push(layer);
          } catch (error) {
            rethrowIfCancelled(error, executionContext);
            stats.warnings.push(t("lockedUnchanged", layer.name));
          }
        }

        try {
          stats.hiddenStyles += await removeHiddenStyle(layer);
        } catch (error) {
          rethrowIfCancelled(error, executionContext);
          stats.warnings.push(t("styleLayerFailed", layer.name, error.message || error));
        }

        if (index % 10 === 0) {
          executionContext.reportProgress({
            value: targets.length ? (index + 1) / targets.length : 1,
            commandName: t("processing", doc.title || doc.name)
          });
        }
      }

    } finally {
      for (const layer of lockedLayers) {
        try {
          if (layer.document && app.documents.some((item) => item.id === layer.document.id)) {
            await setActiveDocument(layer.document);
            await lockLayer(layer);
          }
        } catch (_) {
          // The layer may have been deleted as part of a hidden group.
        }
      }
    }
  }

  throwIfCancelled(executionContext);
  if (options.deleteMetaData) {
    try {
      await setActiveDocument(doc);
      await clearDocumentMetadata(doc);
      stats.metadata += 1;
    } catch (error) {
      rethrowIfCancelled(error, executionContext);
      stats.warnings.push(t("metadataFailed", error.message || error));
    }
  }
}

async function runDocumentTransaction(doc, executionContext, name, task) {
  const hostControl = executionContext.hostControl;
  const suspension = await hostControl.suspendHistory({
    documentID: doc.id,
    name
  });
  let finished = false;

  try {
    const result = await task();
    if (suspension && typeof suspension === "object") {
      suspension.finalName = name;
    }
    await hostControl.resumeHistory(suspension, true);
    finished = true;
    return result;
  } catch (error) {
    if (!finished) {
      try {
        await hostControl.resumeHistory(suspension, false);
      } catch (_) {
        // Photoshop also rolls back an outstanding suspension on modal failure.
      }
    }
    throw error;
  }
}

async function closeWithoutSaving(doc) {
  if (!doc || !app.documents.some((item) => item.id === doc.id)) return;
  await setActiveDocument(doc);
  await doc.close(constants.SaveOptions.DONOTSAVECHANGES);
}

async function saveDocument(doc, stripMetadata = false) {
  await setActiveDocument(doc);
  let nativePath = await getDocumentPath(doc);
  await doc.save();
  if (!nativePath) nativePath = await getDocumentPath(doc);
  if (stripMetadata) {
    stripSavedFileMetadata(nativePath);
  }
}

async function cleanCurrent(cleanType) {
  if (busy) return;
  resetStatusForOperation();
  const options = getOptions(cleanType);
  if (!hasCleanOption(options)) {
    setLocalizedStatus("error", "noOptionsTitle", "noOptionsDetail");
    return;
  }
  if (!app.documents.length) {
    setLocalizedStatus("error", "noDocumentTitle", "noDocumentDetail");
    return;
  }

  let copyEntry = null;
  const originalDoc = app.activeDocument;
  setBusy(true);
  setLocalizedStatus("busy", "optimizingTitle", "optimizingDetail");
  try {
    const originalEntry = await entryFromDocument(originalDoc);
    if (!options.overrideDoc) {
      copyEntry = await makeCopyEntry(originalDoc, originalEntry);
      if (!copyEntry) {
        setLocalizedStatus("idle", "readyTitle", "readyDetail");
        return;
      }
    }

    const stats = createStats();
    stats.files = 1;
    if (originalEntry) stats.bytesBefore = await safeMetadataSize(originalEntry);

    let cleanedEntry = originalEntry;
    await core.executeAsModal(async (executionContext) => {
      let workingDoc = originalDoc;
      let registeredForAutoClose = false;
      try {
        if (!options.overrideDoc) {
          await saveCopy(originalDoc, copyEntry);
          workingDoc = await app.open(copyEntry);
          cleanedEntry = copyEntry;
          await executionContext.hostControl.registerAutoCloseDocument(workingDoc.id);
          registeredForAutoClose = true;
        }

        await runDocumentTransaction(
          workingDoc,
          executionContext,
          "PSD Optimizer",
          async () => {
            await cleanDocument(workingDoc, options, stats, executionContext);
          }
        );
        throwIfCancelled(executionContext);
        await saveDocument(workingDoc, options.deleteMetaData);

        if (registeredForAutoClose) {
          await executionContext.hostControl.unregisterAutoCloseDocument(workingDoc.id);
          registeredForAutoClose = false;
        }
      } catch (error) {
        if (!options.overrideDoc && workingDoc && workingDoc.id !== originalDoc.id) {
          try {
            if (registeredForAutoClose) {
              await executionContext.hostControl.unregisterAutoCloseDocument(workingDoc.id);
            }
            await closeWithoutSaving(workingDoc);
          } catch (_) {
            // Auto-close remains a fallback if Photoshop is cancelling the modal scope.
          }
        }
        try {
          await setActiveDocument(originalDoc);
        } catch (_) {
          // Preserve the original modal or cancellation error.
        }
        throw error;
      }
    }, modalExecutionOptions());

    if (cleanedEntry) stats.bytesAfter = await safeMetadataSize(cleanedEntry);
    const savedCopyName = copyEntry ? copyEntry.name : null;
    setLocalizedStatus(
      stats.errors.length ? "error" : "success",
      stats.errors.length ? "completedWithErrors" : "optimizationComplete",
      () => `${summarize(stats)} · ${savedCopyName
        ? t("savedAs", savedCopyName)
        : t("overwritten")}`,
      () => formatSizeChange(stats)
    );
  } catch (error) {
    if (copyEntry) {
      try {
        await copyEntry.delete();
      } catch (_) {
        // The copy may still be closing or may never have been materialized.
      }
    }
    setLocalizedStatus(
      "error",
      "optimizationFailed",
      () => error.message || String(error)
    );
  } finally {
    setBusy(false);
  }
}

OPTION_IDS.forEach((id) => {
  document.getElementById(id).addEventListener("change", updateOptionUI);
});

function openHelpDialog() {
  const helpDialog = document.getElementById("helpDialog");
  helpDialog.classList.add("is-open");
  helpDialog.setAttribute("aria-hidden", "false");
}

function closeHelpDialog() {
  const helpDialog = document.getElementById("helpDialog");
  helpDialog.classList.remove("is-open");
  helpDialog.setAttribute("aria-hidden", "true");
}

function applyLanguage() {
  const bindings = {
    panelTitle: "panelTitle",
    metadataName: "metadataName",
    emptyLayersName: "emptyLayersName",
    layerStylesName: "layerStylesName",
    overwriteLabel: "overwriteLabel",
    cleanSelected: "cleanSelected",
    cleanDocument: "cleanDocument",
    helpTitle: "helpTitle",
    languageLabel: "languageLabel",
    languageHint: "languageHint",
    helpMetadata: "helpMetadata",
    helpEmptyLayers: "helpEmptyLayers",
    helpLayerStyles: "helpLayerStyles",
    helpNote: "helpNote"
  };

  Object.entries(bindings).forEach(([key, id]) => {
    document.getElementById(id).textContent = t(key);
  });

  document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
  document.querySelector(".option-grid").setAttribute("aria-label", t("optionsAria"));
  document.querySelector(".save-row").setAttribute("aria-label", t("saveAria"));
  document.querySelector(".actions").setAttribute("aria-label", t("actionsAria"));
  document.getElementById("helpButton").setAttribute("aria-label", t("helpAria"));
  document.getElementById("helpCloseButton").setAttribute("aria-label", t("closeAria"));
  document.getElementById("languageToggle").setAttribute("aria-label", t("languageAria"));
  document.getElementById("languageToggle").setAttribute(
    "aria-checked",
    String(currentLanguage === "zh")
  );
  document.getElementById("languageEnglish").classList.toggle(
    "is-active",
    currentLanguage === "en"
  );
  document.getElementById("languageChinese").classList.toggle(
    "is-active",
    currentLanguage === "zh"
  );

  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
  } catch (_) {
    // The selected language remains active for this session.
  }

  updateOptionUI();
  renderLocalizedStatus();
}

function toggleLanguage() {
  currentLanguage = currentLanguage === "en" ? "zh" : "en";
  applyLanguage();
}

function bindControlAction(id, handler) {
  const element = document.getElementById(id);
  const activate = () => {
    if (element.getAttribute("aria-disabled") === "true") return;
    handler();
  };
  element.addEventListener("click", activate);
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate();
  });
}

bindControlAction("cleanSelected", () => cleanCurrent("selected"));
bindControlAction("cleanDocument", () => cleanCurrent("all"));
bindControlAction("helpButton", openHelpDialog);
bindControlAction("helpCloseButton", closeHelpDialog);
bindControlAction("languageToggle", toggleLanguage);

initializePanelLifecycle();
setLocalizedStatus("idle", "readyTitle", "readyDetail");
applyLanguage();
