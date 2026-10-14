# Fast Note Sync 管理后台

Fast Note Sync 的管理后台（React + Vite）：浏览器里管理笔记库、笔记、分享、备份和 AI 接入。构建产物放进服务端仓库的 frontend/，随服务端发布。fork 自 haierkeys/fast-note-sync-webgui，上游已停更。

## 地图
- src/main.tsx、src/share.tsx、src/oauth-authorize.tsx：三个页面入口
- src/components/api-handle/：调服务端 REST 接口的封装
- src/components/<功能>/：按功能分目录（note、vault、file、setting、mcp、share……）
- src/i18n/：五种界面语言
- 后台的设计见 [docs/atlas/README.md](docs/atlas/README.md)
- 整套系统见 [服务端的 atlas](../fast-note-sync-service/docs/atlas/README.md)；改动涉及服务端接口时先读对应节点

## 验证
- `pnpm build`：类型检查加构建，产物在 dist/
- `pnpm test`：vitest，约 15 秒
- `pnpm lint`
- 本地预览：服务端在 9000 端口运行时，`pnpm dev`

## 硬约束
- 改了页面要上线，按 [后台导览](docs/atlas/README.md) 的"怎么配合"走完构建、复制、发布服务端三步

## 改动前先读
| 如果你要改… | 先读 |
|---|---|
| 任何页面（src/**） | [后台导览](docs/atlas/README.md) |
| MCP 接入页（src/components/mcp/*） | 服务端的 [AI 接入](../fast-note-sync-service/docs/atlas/ai-access.md) |
| 分享（src/components/share/*、src/share.tsx） | 服务端的[分享](../fast-note-sync-service/docs/atlas/share.md) |

## 维护
- 改了某一块的边界、流程，或踩到新坑：同一次改动里更新 atlas，刷新 verified。
- 硬约束和服务端 atlas 的守护层：不直接改，在改动说明里单独列出建议，等主人确认。
- 代码和守护层冲突时，停下来问主人，不要自行二选一。
- 提交前跑 `python3 scripts/atlas_audit.py`。
