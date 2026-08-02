# PSD Optimizer 1.8.3 — Windows 安装说明

安装文件：`PSD-Optimizer-1.8.3-Windows-x64.exe`

## 系统要求

- Windows 10/11 64 位
- Adobe Photoshop 2024 或更新版本（Photoshop 25.0+）
- 安装前必须完全退出 Photoshop

## 安装

1. 双击 `PSD-Optimizer-1.8.3-Windows-x64.exe`。
2. 安装器会自动从 Windows 注册表、App Paths 和 Adobe 常见程序目录查找 `Photoshop.exe`，并读取程序文件版本。
3. 核对检测到的 Photoshop 路径和插件安装位置，然后单击“确定”。
4. 安装完成后启动 Photoshop，打开：
   `增效工具 / Plugins → PSD Optimizer → PSD Optimizer`

安装器按当前 Windows 用户安装，不需要管理员权限。检测 Photoshop 安装路径是为了确认 Photoshop 存在且版本兼容；UXP 插件本体会安装到 Adobe 的当前用户目录：

```text
%APPDATA%\Adobe\UXP\Plugins\External\caveman.optimizer.uxp
```

同时安全更新：

```text
%APPDATA%\Adobe\UXP\PluginsInfo\v1\PS.json
```

## 安全机制

- 安装前检查 Photoshop 是否仍在运行。
- 先将插件释放到临时目录，再核对插件 ID、版本、宿主版本和必要文件。
- 保留 `PS.json` 中其他插件的所有注册信息，只替换 PSD Optimizer 自身的记录。
- 使用备份和原子替换；安装或校验失败时恢复旧插件和原注册文件。
- 若安装期间 `PS.json` 被其他程序修改，安装器会停止，避免覆盖并发改动。

## Windows SmartScreen 提示

此安装文件没有商业代码签名证书，因此 Windows 可能显示“Windows 已保护你的电脑”。请先核对 `SHA256SUMS.txt` 中的 SHA-256；确认文件一致后，选择“更多信息 → 仍要运行”。

PowerShell 校验命令：

```powershell
Get-FileHash .\PSD-Optimizer-1.8.3-Windows-x64.exe -Algorithm SHA256
```

## 排查

安装日志：

```text
%TEMP%\PSD-Optimizer-installer.log
```

如果安装成功后 Photoshop 中仍未显示：

1. 完全退出并重新打开 Photoshop。
2. 确认 Photoshop 是 25.0 或更新版本。
3. 确认上述插件目录和 `PS.json` 已生成。
4. 将安装日志发回用于检查。

Copyright © CAVEMAN
