const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
  "selectedCount"
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
const photoshopApp = { documents: [] };
const photoshopAction = {};
const uxpHost = { version: "25.0.0" };
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
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem: (key) => localStorageValues.get(key) || null,
    setItem: (key, value) => localStorageValues.set(key, value)
  },
  document: {
    documentElement: { lang: "en" },
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
        constants: {}
      };
    }
    if (name === "uxp") {
      return {
        storage: { localFileSystem: {} },
        xmp: {},
        host: uxpHost,
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
new vm.Script(source, { filename: "index.js" }).runInContext(context);

async function main() {
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
  registeredEntrypoints.plugin.create();
  assert.strictEqual(documentListeners.get("uxpcommand").size, 1);

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
  assert.strictEqual(actionBatchPlayCalls, 1);
  new vm.Script(`cleanCurrent("all")`).runInContext(context);
  assert.strictEqual(actionBatchPlayCalls, 1);

  process.stdout.write(
    "UI behavior checks passed: lifecycle, cancellation, traversal, result reset, isolated stats, and click locking.\\n"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
