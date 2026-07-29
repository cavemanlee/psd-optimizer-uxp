# PSD Optimizer 1.7.6 — macOS PKG 安装说明

## 安装

1. 退出 Photoshop。
2. 双击 `PSD-Optimizer-1.7.6-macOS.pkg`。
3. 按照 macOS 安装器提示完成安装，并在需要时输入管理员密码。
4. 重新打开 Photoshop，通过“增效工具 / Plugins”菜单打开 **PSD Optimizer**。

安装器会自动识别当前登录的 macOS 用户，将插件安装到该用户的 Adobe UXP 外部插件目录，并安全合并到 Photoshop 的 UXP 插件注册表。原有插件注册条目不会被覆盖。重复运行安装器可以安全更新同一插件；安装或注册过程中若发生错误，安装脚本会恢复原有版本。

安装时必须完全退出 Photoshop。Photoshop 只会在启动时读取插件注册表；如果安装过程中 Photoshop 仍在运行，请在安装结束后完全退出并重新打开。

## 如果 macOS 阻止打开

此 PKG 未使用 Apple Developer ID Installer 证书签名。若另一台 Mac 提示无法验证开发者：

1. 在 Finder 中按住 Control 键点按 PKG，然后选择“打开”。
2. 如果仍被拦截，打开“系统设置 → 隐私与安全性”，在安全提示处选择“仍要打开”。

## 兼容性与校验

- 插件版本：1.7.6
- Photoshop 最低版本：25.0
- 插件 ID：`caveman.optimizer.uxp`
- PKG SHA-256：见同目录 `SHA256SUMS.txt`
