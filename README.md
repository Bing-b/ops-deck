# OpsDeck

本地优先的高对比度项目资料与脚本卡片桌面工作台（Electron + Vue 3 + Vite + CodeMirror 6）。

## 核心特性

- **项目与脚本卡片瀑布流**：按项目组织运维命令、服务器信息、Nginx/YAML 配置与排障记录，右侧采用类小红书瀑布流卡片展示，高度随内容自适应并限制合理上下界。
- **内置高亮脚本编辑器**：点击「新增卡片」或任意卡片弹出 **CodeMirror 6** 编辑器，支持 Shell/Bash、YAML、JSON、SQL、Nginx、JS/TS、Python、Markdown 与纯文本语法高亮、复制粘贴与快捷复制。
- **`Ctrl+K` 全局检索**：一键模糊检索项目名、卡片标题、脚本正文与 IP 片段，支持直接复制或定位打开。
- **本地工作区存储**：数据以可读的 `project.json` 与 `README.md` 形式保存在本地自定义工作区目录（默认 `Documents/OpsDeck`，如存在旧版 `Documents/OpsVault` 会自动兼容读取），不锁定私有格式。
- **工作交接包导出 / 导入**：一键打包项目为 `.zip`（含 `README_交接总览.md`、`ops-deck-bundle.json` 及可选独立离线搜索页 `handover.html`），支持整包导入还原；支持工作区 `.zip` 快照备份。
- **高对比双主题**：默认极简高对比亮色基底搭配深色石墨代码块，支持一键切换暗黑模式。

## 快速开始

```bash
pnpm install
pnpm run build
```

### 运行方式

- **本地桌面服务模式（推荐，通用稳定）**：
  ```bash
  pnpm run serve
  ```
  启动本地 Node 服务（`127.0.0.1:5189`）并打开界面，全部本地读写与导出功能立即可用。

- **独立 Electron 桌面窗口**：
  ```bash
  pnpm run start
  ```
  > 注：部分受限终端（如低完整性级别或注入宿主管线的 IDE 终端）会拦截 Electron 启动（退出码 `2147483651`），在系统独立 PowerShell / Windows Terminal 运行 `pnpm run start`，或直接使用 `pnpm run serve` 即可。

- **开发热更新模式**：
  ```bash
  pnpm run dev
  ```

## 自测与检查

```bash
pnpm run typecheck
pnpm run build
pnpm run test
```

