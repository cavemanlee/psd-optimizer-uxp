const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let activeElement = null;

class ClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  toggle(value, force) {
    if (force === undefined) {
      force = !this.values.has(value);
    }
    if (force) this.values.add(value);
    else this.values.delete(value);
    return force;
  }

  contains(value) {
    return this.values.has(value);
  }
}

class Element {
  constructor(id = "") {
    this.id = id;
    this.checked = false;
    this.textContent = "";
    this.dataset = {};
    this.attributes = {};
    this.classList = new ClassList();
    this.listeners = {};
  }

  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  focus() {
    activeElement = this;
  }
}

const ids = [
  "deleteMetaData",
  "deleteEmptyLayer",
  "deleteHiddenStyle",
  "overrideDoc",
  "panelTitle",
  "metadataName",
  "emptyLayersName",
  "layerStylesName",
  "overwriteLabel",
  "cleanSelected",
  "cleanDocument",
  "status",
  "statusTitle",
  "statusDetail",
  "statusSize",
  "helpDialog",
  "helpTitle",
  "helpButton",
  "helpCloseButton",
  "languageLabel",
  "languageHint",
  "helpMetadata",
  "helpEmptyLayers",
  "helpLayerStyles",
  "helpNote",
  "languageToggle",
  "languageEnglish",
  "languageChinese",
  "selectedCount",
  "versionCheckButton",
  "updateDialog",
  "updateTitle",
  "updateMessage",
  "updateMeta",
  "updatePrimaryButton",
  "updateSecondaryButton"
];
const elements = Object.fromEntries(ids.map((id) => [id, new Element(id)]));
const optionCards = Object.fromEntries(
  ["deleteMetaData", "deleteEmptyLayer", "deleteHiddenStyle"].map((id) => [
    id,
    new Element(`${id}-card`)
  ])
);
for (const id of Object.keys(optionCards)) {
  elements[id].closest = () => optionCards[id];
}
elements.deleteMetaData.checked = true;

const structural = {
  ".option-grid": new Element("option-grid"),
  ".save-row": new Element("save-row"),
  ".actions": new Element("actions")
};

const localStorageValues = new Map();
const documentListeners = new Map();
let entrypointSetupCalls = 0;
let registeredEntrypoints = null;
let actionBatchPlayCalls = 0;
let fetchCalls = [];
let fetchImplementation = async () => {
  throw new Error("Unexpected update request");
};
let shellOpenCalls = [];
let shellResult = "";
let shellFailure = null;
const photoshopConstants = {
  MaximizeCompatibility: {
    ALWAYS: "always",
    ASK: "ask",
    NEVER: "never"
  }
};
const photoshopApp = {
  documents: [],
  preferences: {
    fileHandling: {
      maximizeCompatibility: photoshopConstants.MaximizeCompatibility.ASK
    }
  }
};
const photoshopAction = {};
const uxpHost = { version: "25.0.0" };
const uxpVersions = { plugin: "1.8.0" };
const uxpShell = {
  async openExternal(url, developerText) {
    shellOpenCalls.push({ url, developerText });
    if (shellFailure) throw shellFailure;
    return shellResult;
  }
};
const uxpEntrypoints = {
  setup(definition) {
    entrypointSetupCalls += 1;
    if (entrypointSetupCalls > 1) {
      throw new Error("entrypoints.setup must only be called once");
    }
    registeredEntrypoints = definition;
  }
};
const context = vm.createContext({
  console,
  AbortController,
  Date,
  setTimeout,
  clearTimeout,
  fetch: (...args) => {
    fetchCalls.push(args);
    return fetchImplementation(...args);
  },
  localStorage: {
    getItem: (key) => localStorageValues.get(key) || null,
    setItem: (key, value) => localStorageValues.set(key, value)
  },
  document: {
    documentElement: { lang: "en" },
    get activeElement() {
      return activeElement;
    },
    addEventListener: (name, handler) => {
      const handlers = documentListeners.get(name) || new Set();
      handlers.add(handler);
      documentListeners.set(name, handlers);
    },
    removeEventListener: (name, handler) => {
      const handlers = documentListeners.get(name);
      if (handlers) handlers.delete(handler);
    },
    getElementById: (id) => {
      if (!elements[id]) throw new Error(`Unknown test element: ${id}`);
      return elements[id];
    },
    querySelector: (selector) => {
      if (!structural[selector]) throw new Error(`Unknown test selector: ${selector}`);
      return structural[selector];
    },
    querySelectorAll: (selector) => {
      if (selector !== ".action-button") {
        throw new Error(`Unknown test selector list: ${selector}`);
      }
      return [elements.cleanSelected, elements.cleanDocument];
    }
  },
  require: (name) => {
    if (name === "photoshop") {
      return {
        app: photoshopApp,
        action: photoshopAction,
        core: {},
        constants: photoshopConstants
      };
    }
    if (name === "uxp") {
      return {
        storage: { localFileSystem: {} },
        xmp: {},
        host: uxpHost,
        versions: uxpVersions,
        shell: uxpShell,
        entrypoints: uxpEntrypoints
      };
    }
    throw new Error(`Unexpected module: ${name}`);
  }
});

const source = fs.readFileSync(
  path.join(__dirname, "..", "plugin", "index.js"),
  "utf8"
);
const manifest = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "plugin", "manifest.json"),
  "utf8"
));
const html = fs.readFileSync(
  path.join(__dirname, "..", "plugin", "index.html"),
  "utf8"
);
const styles = fs.readFileSync(
  path.join(__dirname, "..", "plugin", "styles.css"),
  "utf8"
);
new vm.Script(source, { filename: "index.js" }).runInContext(context);

async function main() {
  assert.strictEqual(manifest.version, uxpVersions.plugin);
  const panelManifest = manifest.entrypoints.find(
    (entrypoint) => entrypoint.id === "psdCleanerPanel"
  );
  assert.ok(panelManifest);
  assert.strictEqual(panelManifest.minimumSize.width, 320);
  assert.strictEqual(panelManifest.maximumSize.width, 1000);
  assert.strictEqual(panelManifest.preferredDockedSize.width, 320);
  assert.strictEqual(panelManifest.preferredFloatingSize.width, 320);
  assert.match(html, /class="brand"/);
  assert.match(html, /icons\/ui\/more-circle\.png/);
  assert.match(html, /icons\/ui\/close\.png/);
  assert.match(styles, /--accent:\s*#22aff2/);
  assert.match(styles, /\.panel-header\s*\{[\s\S]*?height:\s*44px/);
  assert.match(styles, /\.option-card\s*\{[\s\S]*?flex:\s*1 1 0/);
  assert.match(styles, /\.option-card:last-child\s*\{[\s\S]*?margin-right:\s*0/);
  assert.match(styles, /\.icon-box\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*58px/);
  assert.ok(fs.statSync(
    path.join(__dirname, "..", "plugin", "icons", "ui", "more-circle.png")
  ).size > 0);
  assert.ok(fs.statSync(
    path.join(__dirname, "..", "plugin", "icons", "ui", "close.png")
  ).size > 0);
  assert.strictEqual(
    new vm.Script("STRINGS.en.panelTitle").runInContext(context),
    "PSD Optimizer"
  );
  assert.strictEqual(
    new vm.Script("STRINGS.zh.panelTitle").runInContext(context),
    "PSD Optimizer"
  );
  assert.deepStrictEqual(
    manifest.requiredPermissions.network.domains,
    ["https://api.github.com"]
  );
  assert.deepStrictEqual(
    manifest.requiredPermissions.launchProcess.schemes,
    ["https"]
  );
  assert.strictEqual(fetchCalls.length, 0);
  assert.strictEqual(entrypointSetupCalls, 1);
  assert.ok(registeredEntrypoints.plugin);
  assert.ok(registeredEntrypoints.panels.psdCleanerPanel);
  for (const hook of ["create", "show", "hide", "destroy"]) {
    assert.strictEqual(
      typeof registeredEntrypoints.panels.psdCleanerPanel[hook],
      "function"
    );
  }
  assert.strictEqual(documentListeners.get("uxpcommand").size, 1);
  assert.strictEqual(documentListeners.get("keydown").size, 1);

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(
      new vm.Script("modalExecutionOptions()").runInContext(context)
    )),
    { commandName: "PSD Optimizer" }
  );
  uxpHost.version = "25.10.0";
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(
      new vm.Script("modalExecutionOptions()").runInContext(context)
    )),
    { commandName: "PSD Optimizer", timeOut: 10000 }
  );
  uxpHost.version = "25.0.0";

  registeredEntrypoints.plugin.create();
  registeredEntrypoints.panels.psdCleanerPanel.create();
  assert.strictEqual(documentListeners.get("uxpcommand").size, 1);
  assert.strictEqual(documentListeners.get("keydown").size, 1);

  registeredEntrypoints.panels.psdCleanerPanel.show();
  assert.strictEqual(
    new vm.Script("panelVisible").runInContext(context),
    true
  );
  for (const handler of documentListeners.get("uxpcommand")) {
    handler({ commandId: "uxphidepanel" });
  }
  assert.strictEqual(
    new vm.Script("panelVisible").runInContext(context),
    false
  );
  for (const handler of documentListeners.get("uxpcommand")) {
    handler({ commandId: "uxpshowpanel" });
  }
  assert.strictEqual(
    new vm.Script("panelVisible").runInContext(context),
    true
  );

  registeredEntrypoints.plugin.destroy();
  assert.strictEqual(documentListeners.get("uxpcommand").size, 0);
  assert.strictEqual(documentListeners.get("keydown").size, 0);
  registeredEntrypoints.plugin.create();
  assert.strictEqual(documentListeners.get("uxpcommand").size, 1);
  assert.strictEqual(documentListeners.get("keydown").size, 1);

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(new vm.Script(`
      (() => {
        const parsed = parseStableVersion("v12.3.40");
        return {
          text: parsed.text,
          comparison: compareVersions(
            parseStableVersion("1.8.1"),
            parseStableVersion("1.8.0")
          ),
          invalid: parseStableVersion("1.8") === null
        };
      })()
    `).runInContext(context))),
    { text: "12.3.40", comparison: 1, invalid: true }
  );
  assert.deepStrictEqual(
    Array.from(new vm.Script(`
      [403, 429, 404, 500, 400].map(responseErrorCode)
    `).runInContext(context)),
    ["rateLimited", "rateLimited", "noRelease", "service", "network"]
  );
  assert.strictEqual(
    elements.versionCheckButton.textContent,
    "PSD Optimizer · v1.8.0"
  );

  const sizeFormats = JSON.parse(JSON.stringify(new vm.Script(`
    (() => {
      const smaller = createStats();
      smaller.bytesBefore = 1024 * 1024;
      smaller.bytesAfter = 512 * 1024;
      const unchanged = createStats();
      unchanged.bytesBefore = 1024 * 1024;
      unchanged.bytesAfter = 1024 * 1024;
      const larger = createStats();
      larger.bytesBefore = 1024 * 1024;
      larger.bytesAfter = 1024 * 1024 + 1024;
      const afterOnly = createStats();
      afterOnly.bytesAfter = 2048;
      const unavailable = createStats();
      const englishLarger = formatSizeChange(larger);
      currentLanguage = "zh";
      const chineseSmaller = formatSizeChange(smaller);
      const chineseLarger = formatSizeChange(larger);
      currentLanguage = "en";
      return {
        smaller: formatSizeChange(smaller),
        unchanged: formatSizeChange(unchanged),
        afterOnly: formatSizeChange(afterOnly),
        unavailable: formatSizeChange(unavailable),
        chineseSmaller,
        englishLarger,
        chineseLarger
      };
    })()
  `).runInContext(context)));
  assert.strictEqual(
    sizeFormats.smaller,
    "Size: 1.00 MB → 512.0 KB · −512.0 KB (−50.0%) · File size reduced."
  );
  assert.strictEqual(
    sizeFormats.unchanged,
    "Size: 1.00 MB → 1.00 MB · ±0 B"
  );
  assert.strictEqual(
    sizeFormats.afterOnly,
    "Size after optimization: 2.0 KB"
  );
  assert.strictEqual(
    sizeFormats.unavailable,
    "File size change unavailable"
  );
  assert.ok(sizeFormats.chineseSmaller.includes("文件体积已减小。"));
  assert.ok(sizeFormats.englishLarger.includes("Increase may come from PSD rewriting"));
  assert.ok(sizeFormats.chineseLarger.includes("增加可能来自 PSD 重写"));

  const copySaveCalls = [];
  context.copySaveCalls = copySaveCalls;
  context.copySaveDocument = {
    saveAs: {
      psd: async (...args) => copySaveCalls.push({ format: "psd", args }),
      psb: async (...args) => copySaveCalls.push({ format: "psb", args })
    }
  };
  context.copyPsdEntry = { name: "test_fix.psd" };
  context.copyPsbEntry = { name: "test_fix.psb" };
  photoshopApp.preferences.fileHandling.maximizeCompatibility =
    photoshopConstants.MaximizeCompatibility.ALWAYS;
  await new vm.Script(`
    saveCopy(copySaveDocument, copyPsdEntry)
  `).runInContext(context);
  photoshopApp.preferences.fileHandling.maximizeCompatibility =
    photoshopConstants.MaximizeCompatibility.ASK;
  await new vm.Script(`
    saveCopy(copySaveDocument, copyPsdEntry)
  `).runInContext(context);
  photoshopApp.preferences.fileHandling.maximizeCompatibility =
    photoshopConstants.MaximizeCompatibility.NEVER;
  await new vm.Script(`
    saveCopy(copySaveDocument, copyPsbEntry)
  `).runInContext(context);
  assert.deepStrictEqual(
    copySaveCalls.map((call) => ({
      format: call.format,
      maximizeCompatibility: call.args[1].maximizeCompatibility,
      asCopy: call.args[2]
    })),
    [
      { format: "psd", maximizeCompatibility: true, asCopy: true },
      { format: "psd", maximizeCompatibility: false, asCopy: true },
      { format: "psb", maximizeCompatibility: false, asCopy: true }
    ]
  );
  const savedPreferences = photoshopApp.preferences;
  delete photoshopApp.preferences;
  assert.strictEqual(
    new vm.Script(`
      shouldMaximizeCompatibilityForCopy()
    `).runInContext(context),
    false
  );
  photoshopApp.preferences = savedPreferences;

  fetchCalls = [];
  fetchImplementation = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ tag_name: "v1.9.0" })
  });
  elements.versionCheckButton.focus();
  await new vm.Script(`
    openHelpDialog();
    checkForUpdates({ force: true })
  `).runInContext(context);
  assert.strictEqual(
    new vm.Script("updateState.kind").runInContext(context),
    "available"
  );
  assert.strictEqual(elements.updateDialog.classList.contains("is-open"), true);
  assert.strictEqual(elements.updatePrimaryButton.textContent, "Download");
  assert.strictEqual(
    elements.updateSecondaryButton.classList.contains("is-hidden"),
    false
  );
  assert.strictEqual(activeElement, elements.updatePrimaryButton);
  assert.strictEqual(fetchCalls.length, 1);
  assert.strictEqual(actionBatchPlayCalls, 0);
  assert.strictEqual(
    fetchCalls[0][0],
    "https://api.github.com/repos/cavemanlee/psd-optimizer-uxp/releases/latest"
  );
  assert.strictEqual(fetchCalls[0][1].credentials, "omit");
  assert.strictEqual(
    fetchCalls[0][1].headers["X-GitHub-Api-Version"],
    "2026-03-10"
  );

  new vm.Script(`closeUpdateDialog()`).runInContext(context);
  assert.strictEqual(activeElement, elements.versionCheckButton);
  await new vm.Script(`checkForUpdates()`).runInContext(context);
  assert.strictEqual(fetchCalls.length, 1);
  assert.strictEqual(
    new vm.Script("updateState.kind").runInContext(context),
    "available"
  );
  new vm.Script(`closeUpdateDialog()`).runInContext(context);

  fetchImplementation = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ tag_name: "1.8.0" })
  });
  await new vm.Script(`checkForUpdates({ force: true })`).runInContext(context);
  assert.strictEqual(
    new vm.Script("updateState.kind").runInContext(context),
    "upToDate"
  );
  new vm.Script(`closeUpdateDialog()`).runInContext(context);

  fetchImplementation = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ tag_name: "v1.7.9" })
  });
  await new vm.Script(`checkForUpdates({ force: true })`).runInContext(context);
  assert.strictEqual(
    new vm.Script("updateState.kind").runInContext(context),
    "newer"
  );
  new vm.Script(`closeUpdateDialog()`).runInContext(context);

  fetchImplementation = async () => ({
    ok: false,
    status: 403,
    json: async () => ({})
  });
  await new vm.Script(`checkForUpdates({ force: true })`).runInContext(context);
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(new vm.Script(`
      ({ kind: updateState.kind, errorCode: updateState.errorCode })
    `).runInContext(context))),
    { kind: "error", errorCode: "rateLimited" }
  );
  assert.strictEqual(
    elements.updateMessage.textContent,
    "GitHub is temporarily limiting update checks. Try again later."
  );
  new vm.Script(`closeUpdateDialog()`).runInContext(context);

  fetchImplementation = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ tag_name: "latest" })
  });
  await new vm.Script(`checkForUpdates({ force: true })`).runInContext(context);
  assert.strictEqual(
    new vm.Script("updateState.errorCode").runInContext(context),
    "invalid"
  );
  new vm.Script(`closeUpdateDialog()`).runInContext(context);

  fetchImplementation = async (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
  await new vm.Script(`
    checkForUpdates({ force: true, timeoutMs: 5 })
  `).runInContext(context);
  assert.strictEqual(
    new vm.Script("updateState.errorCode").runInContext(context),
    "timeout"
  );
  new vm.Script(`closeUpdateDialog()`).runInContext(context);

  let requestWasAborted = false;
  fetchImplementation = async (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      requestWasAborted = true;
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
  const cancelledUpdate = new vm.Script(`
    checkForUpdates({ force: true, timeoutMs: 1000 })
  `).runInContext(context);
  new vm.Script(`closeHelpDialog()`).runInContext(context);
  await cancelledUpdate;
  assert.strictEqual(requestWasAborted, true);
  assert.strictEqual(elements.updateDialog.classList.contains("is-open"), false);
  assert.strictEqual(
    new vm.Script("updateRequestController").runInContext(context),
    null
  );

  shellOpenCalls = [];
  shellResult = "permission denied";
  new vm.Script(`
    openHelpDialog();
    setUpdateState("available", { latestVersion: "1.9.0" });
    openUpdateDialog();
  `).runInContext(context);
  await new vm.Script(`handleUpdatePrimaryAction()`).runInContext(context);
  assert.strictEqual(
    new vm.Script("updateState.errorCode").runInContext(context),
    "browser"
  );
  assert.strictEqual(shellOpenCalls.length, 1);

  shellResult = "";
  await new vm.Script(`handleUpdatePrimaryAction()`).runInContext(context);
  assert.strictEqual(
    shellOpenCalls[1].url,
    "https://github.com/cavemanlee/psd-optimizer-uxp/releases/latest"
  );
  assert.strictEqual(elements.updateDialog.classList.contains("is-open"), false);

  elements.versionCheckButton.focus();
  new vm.Script(`
    setUpdateState("available", { latestVersion: "1.9.0" });
    openUpdateDialog();
  `).runInContext(context);
  activeElement = elements.updateSecondaryButton;
  for (const handler of documentListeners.get("keydown")) {
    handler({
      key: "Tab",
      shiftKey: false,
      preventDefault() {}
    });
  }
  assert.strictEqual(activeElement, elements.updatePrimaryButton);
  for (const handler of documentListeners.get("keydown")) {
    handler({
      key: "Escape",
      preventDefault() {}
    });
  }
  assert.strictEqual(elements.updateDialog.classList.contains("is-open"), false);
  assert.strictEqual(activeElement, elements.versionCheckButton);

  new vm.Script(`
    setUpdateState("error", { errorCode: "network" });
    openUpdateDialog();
    currentLanguage = "zh";
    applyLanguage();
  `).runInContext(context);
  assert.strictEqual(
    elements.updateMessage.textContent,
    "无法连接 GitHub，请检查网络后重试。"
  );
  new vm.Script(`
    closeUpdateDialog();
    currentLanguage = "en";
    applyLanguage();
  `).runInContext(context);

  new vm.Script(`
    setStatus("success", "Old result", "Metadata 9", "999 MB");
    resetStatusForOperation();
  `).runInContext(context);
  assert.strictEqual(elements.status.dataset.state, "idle");
  assert.strictEqual(elements.statusTitle.textContent, "");
  assert.strictEqual(elements.statusDetail.textContent, "");
  assert.strictEqual(elements.statusSize.textContent, "");

  const independent = new vm.Script(`
    (() => {
      const first = createStats();
      first.metadata = 4;
      first.warnings.push("old warning");
      const second = createStats();
      return {
        metadata: second.metadata,
        warnings: second.warnings.length,
        separateWarnings: first.warnings !== second.warnings
      };
    })()
  `).runInContext(context);
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(independent)),
    { metadata: 0, warnings: 0, separateWarnings: true }
  );

  const flattenedLayerIds = new vm.Script(`
    flattenLayers([
      { id: 1, layers: [{ id: 2 }, { id: 3, layers: [{ id: 4 }] }] },
      { id: 5 }
    ]).map((layer) => layer.id)
  `).runInContext(context);
  assert.deepStrictEqual(
    Array.from(flattenedLayerIds),
    [1, 2, 3, 4, 5]
  );

  await assert.rejects(
    new vm.Script(`
      cleanDocument(
        { id: 1 },
        {
          cleanType: "all",
          deleteMetaData: true,
          deleteEmptyLayer: true,
          deleteHiddenStyle: true
        },
        createStats(),
        { isCancelled: true }
      )
    `).runInContext(context),
    /Cancelled/
  );

  const lateCancellationContext = {
    isCancelled: false,
    reportProgress() {}
  };
  const cancellationDocument = { id: 7, layers: [] };
  context.lateCancellationContext = lateCancellationContext;
  context.cancellationDocument = cancellationDocument;
  photoshopApp.activeDocument = cancellationDocument;
  photoshopApp.documents = [cancellationDocument];
  photoshopAction.batchPlay = async () => {
    lateCancellationContext.isCancelled = true;
    throw new Error("Photoshop cancelled the native command");
  };
  await assert.rejects(
    new vm.Script(`
      cleanDocument(
        cancellationDocument,
        {
          cleanType: "all",
          deleteMetaData: false,
          deleteEmptyLayer: true,
          deleteHiddenStyle: false
        },
        createStats(),
        lateCancellationContext
      )
    `).runInContext(context),
    /Photoshop cancelled/
  );
  photoshopApp.activeDocument = undefined;
  photoshopApp.documents = [];
  delete photoshopAction.batchPlay;

  new vm.Script(`
    setStatus("success", "Old result", "Empty layers 12", "100 MB");
  `).runInContext(context);
  await new vm.Script(`cleanCurrent("all")`).runInContext(context);
  assert.strictEqual(elements.status.dataset.state, "error");
  assert.strictEqual(elements.statusTitle.textContent, "No Open Document");
  assert.strictEqual(elements.statusDetail.textContent, "Open a PSD, PSB, or PNG file in Photoshop first.");
  assert.strictEqual(elements.statusSize.textContent, "");

  const pendingBatchPlay = new Promise(() => {});
  photoshopAction.batchPlay = () => {
    actionBatchPlayCalls += 1;
    return pendingBatchPlay;
  };
  photoshopApp.activeDocument = { id: 99 };
  photoshopApp.documents = [photoshopApp.activeDocument];
  elements.overrideDoc.checked = true;

  new vm.Script(`cleanCurrent("all")`).runInContext(context);
  assert.strictEqual(
    new vm.Script("busy").runInContext(context),
    true
  );
  assert.strictEqual(
    elements.versionCheckButton.getAttribute("aria-disabled"),
    "true"
  );
  assert.strictEqual(actionBatchPlayCalls, 1);
  new vm.Script(`cleanCurrent("all")`).runInContext(context);
  assert.strictEqual(actionBatchPlayCalls, 1);
  const fetchCountWhileBusy = fetchCalls.length;
  await new vm.Script(`checkForUpdates({ force: true })`).runInContext(context);
  assert.strictEqual(fetchCalls.length, fetchCountWhileBusy);

  process.stdout.write(
    "UI behavior checks passed: compatibility preferences, size result messages, update states, lifecycle, cancellation, traversal, result reset, isolated stats, and click locking.\\n"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
