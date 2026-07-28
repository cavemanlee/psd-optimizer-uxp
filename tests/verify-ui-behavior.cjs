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
        app: { documents: [] },
        action: {},
        core: {},
        constants: {}
      };
    }
    if (name === "uxp") {
      return {
        storage: { localFileSystem: {} },
        xmp: {}
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

  new vm.Script(`
    setStatus("success", "Old result", "Empty layers 12", "100 MB");
  `).runInContext(context);
  await new vm.Script(`cleanCurrent("all")`).runInContext(context);
  assert.strictEqual(elements.status.dataset.state, "error");
  assert.strictEqual(elements.statusTitle.textContent, "No Open Document");
  assert.strictEqual(elements.statusDetail.textContent, "Open a PSD, PSB, or PNG file in Photoshop first.");
  assert.strictEqual(elements.statusSize.textContent, "");

  process.stdout.write("UI behavior checks passed: result reset, isolated stats, refreshed status.\\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
