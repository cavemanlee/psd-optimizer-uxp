# PSD Optimizer

PSD Optimizer 是一个面向 Adobe Photoshop 25.0+ 的 UXP 清理插件，可在 Apple Silicon 原生模式运行，不需要让 Photoshop 使用 Rosetta。

当前版本：**1.7.5**

插件 ID：`caveman.optimizer.uxp`

## 功能

- 清理文档 XMP 元数据
- 删除空白图层
- 清理已经关闭或整体隐藏的图层样式
- 优化选中图层或当前文档
- 默认生成 `_fix` 副本，也可明确选择覆盖当前文档
- 显示每次操作独立的清理统计和文件体积变化
- English / 中文双语界面


## 安全设计

- 每次优化使用独立统计对象，结果不会跨操作累加。
- 不覆盖时自动生成 `_fix`、`_fix_2` 等副本，避免覆盖已有文件。
- 清理操作在 Photoshop 历史事务内执行，异常时尝试回滚。
- 临时解锁的图层会在完成或异常后恢复锁定状态。
- Windows 和 macOS 安装器会保留其他 UXP 插件的注册信息，并在失败时恢复旧版本。

## 仓库结构

```text
plugin/                    Photoshop UXP 插件源码与图标
packaging/macos/scripts/   macOS PKG 安装与注册脚本
build-assets/              Windows 安装器图标
scripts/                   图标生成及跨平台构建脚本
tests/                     UI 状态回归测试
*.go                       Windows 图形安装器及事务测试
installer.rc               Windows PE 版本与图标资源
docs/                      安装说明
```

编译后的 PKG、EXE 和 ZIP 不提交到 Git；建议通过 GitHub Releases 分发。

## 开发加载

1. 安装 Adobe UXP Developer Tools。
2. 选择 **Add Plugin...**。
3. 选择 [`plugin/manifest.json`](plugin/manifest.json)。
4. 点击 **Load**。
5. 在 Photoshop 中通过 `Plugins → PSD Optimizer → PSD Optimizer` 打开面板。

## 测试

需要 Go 1.24+ 和 Node.js：

```bash
go test ./...
node tests/verify-ui-behavior.cjs
python3 -m json.tool plugin/manifest.json >/dev/null
```

## 重新生成折叠栏图标

图标源文件位于：

- `plugin/icons/panel-broom-dark.svg`
- `plugin/icons/panel-broom-light.svg`

安装依赖并生成 23×23 与 46×46 PNG：

```bash
npm install
npm run render:icons
```

## 构建发布文件

```bash
./scripts/build-release.sh
```

脚本会先运行测试，然后在 `dist/` 中生成可用的制品。macOS PKG 需要系统自带的 `pkgbuild`；Windows EXE 交叉编译需要 Go，以及可用的 `llvm-rc` 和 `llvm-cvtres`。

安装和排查说明见：

- [`docs/PKG-安装说明.md`](docs/PKG-安装说明.md)
- [`docs/Windows-安装说明.md`](docs/Windows-安装说明.md)

## 来源说明

本项目是根据旧插件可观察行为进行的独立 UXP 重写，不包含旧 CEP 插件的源码、账户或授权逻辑。

Copyright © 2026 CAVEMAN. All rights reserved.
