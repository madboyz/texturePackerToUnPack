# Texture Atlas Splitter

这是一个基于 Node.js 和 Sharp 的图集拆解工具，已打包为 Windows 可执行文件 (`split-tool.exe`)。它可以将 TexturePacker 导出的图集（JSON + PNG）还原为碎图。

## 功能特性
- **支持拖拽使用**：直接将 `.json` 或 `.atlas` 文件拖到 exe 上即可。
- **智能关联**：自动查找同名的 `.png` 或 `.jpg` 图片。
- **自动还原**：
  - 处理旋转 (`rotated: true`)，自动逆时针旋转 90 度。
  - 处理裁剪 (`trimmed`)，根据 `spriteSourceSize` 还原透明边距。
- **批量处理**：支持命令行模式批量处理。

## 使用方法

### 方法 1：拖拽模式（推荐）
1. 确保图集的数据文件（`.json` 或 `.atlas`）与图片文件（`.png`）在同一目录下，且**主文件名相同**（例如 `battle.json` 和 `battle.png`）。
2. 将 `.json` 文件直接拖拽到 `split-tool.exe` 图标上。
3. 工具会自动在当前目录下创建一个与文件名同名的文件夹（例如 `battle`），并将拆解后的散图输出到该文件夹中。

### 方法 2：命令行模式
在终端中运行：

```bash
# 自动推导模式
split-tool.exe <path/to/atlas.json>

# 显式指定模式
split-tool.exe <path/to/image.png> <path/to/data.json> [output_directory]
```

## 开发构建
如果你想修改源码并重新打包：

1. 安装依赖：
   ```bash
   npm install
   ```

2. 打包为 EXE：
   ```bash
   npx caxa --input . --output "split-tool.exe" -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/split.js"
   ```

## 依赖
- [Sharp](https://sharp.pixelplumbing.com/): 高性能图片处理库
- [Caxa](https://github.com/leafac/caxa): Node.js 打包工具
