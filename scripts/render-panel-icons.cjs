const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const repositoryRoot = path.resolve(__dirname, "..");
const iconRoot = path.join(repositoryRoot, "plugin", "icons");

async function renderTheme(theme) {
  const source = fs.readFileSync(
    path.join(iconRoot, `panel-broom-${theme}.svg`)
  );
  const targets = [
    [`panel-broom-${theme}.png`, 23],
    [`panel-broom-${theme}@1x.png`, 23],
    [`panel-broom-${theme}@2x.png`, 46]
  ];

  for (const [name, size] of targets) {
    await sharp(source, { density: 144 })
      .resize(size, size, { fit: "fill" })
      .png({ compressionLevel: 9 })
      .toFile(path.join(iconRoot, name));
  }
}

async function renderUiIcons() {
  const targets = [
    ["source/generated-ui/more-circle.svg", "more-circle.png"],
    ["source/remix/close-line.svg", "close.png"]
  ];

  for (const [sourcePath, outputName] of targets) {
    const source = fs.readFileSync(path.join(iconRoot, sourcePath));
    await sharp(source, { density: 192 })
      .resize(64, 64, { fit: "fill" })
      .png({ compressionLevel: 9 })
      .toFile(path.join(iconRoot, "ui", outputName));
  }
}

async function main() {
  await renderTheme("dark");
  await renderTheme("light");
  await renderUiIcons();
  process.stdout.write("Panel and UI icons rendered successfully.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
