# 锁线装帧核样台

纯前端核样工具：手工锁线前，逐张核对套帖（signature）四格页码，发现"中间两张对调 / 有一面翻反"这类从纸堆侧面看不出的跳页问题。无业务后端、无任何外部请求。

## 核样规则

- 总页数 **N 只能是 4–64 之间 4 的倍数**，共 **N/4 张纸**。
- 实体纸由外至内编号 **k = 0 … N/4−1**，每张依次录入 **正面左、正面右、反面左、反面右**，唯一期望值：

  | 格位 | 期望页码 |
  | ---- | -------- |
  | 正面左 | `N − 2k` |
  | 正面右 | `1 + 2k` |
  | 反面左 | `2 + 2k` |
  | 反面右 | `N − 1 − 2k` |

- 判定分两级，互不错位：
  1. **结构校验**：任一字段出现重复、缺失、越界（1–N 之外）或非整数页码 → 只给出字段位置（第几张 · 哪一格），**不产生成败结论**；
  2. **结构合法后**：逐格比对，定位**由外至内首张不符纸**，并保留该纸**全部四格**的实测 ↔ 期望差异。
- 全部纸张匹配时，展示**从最外张到最内张的完整套页链**与**唯一可锁线结论**。

## 批量录入

总页数确定、纸堆生成后，可在「批量录入」区一次粘贴整帖页码，避免逐格手录：

- **每行四个整数**（正面左 正面右 反面左 反面右），以单个空格或制表符分隔（兼容 CRLF/CR 与行首尾空白），**行序对应实体纸由外至内**；
- 只有**行数恰为纸张数且每行恰四项整数**时才**原子替换**当前逐格录入，确认后立即回到嵌套纸张视图，继续使用现有逐格校验与手工编辑；
- 空项、非整数、多列或少列、行数不符时**保留原录入**，只在批量录入区按 行数 → 列数 → 空项 → 非整数的顺序指出**首个问题**（行 · 项定位）；
- 批量解析只定形状与整数，越界 / 重复等仍交给结构校验、首张不符判定处理；批量文本不持久化，刷新页面即清空。

## 技术栈

Vue 3 + TypeScript + Vite；Vitest 检验页码公式与批量文本解析（`src/core/signature.spec.ts`、`src/core/batch.spec.ts`），Playwright 检验录入纠错与批量填入（`e2e/proofing.spec.ts`）。

## 本地运行

```bash
npm install
npm run dev        # 开发服务器
npm run test       # Vitest：页码公式与判定逻辑
npm run test:e2e   # Playwright：录入纠错等端到端流程（首次需 npx playwright install chromium）
npm run build      # vue-tsc 类型检查 + 生产构建
```

## Docker

```bash
# 启动 web（宿主端口默认 8080，可用 WEB_PORT 改写）
WEB_PORT=9000 docker compose up web

# 一次性验收：单元测试 + 类型检查 + 生产构建 + 对 web 的 HTTP 冒烟检查，跑完即退出
docker compose up --build verify
```

- `web`：多阶段构建，nginx 托管 `dist`，容器内 80 端口映射到宿主 `${WEB_PORT:-8080}`。
- `verify`：一次性验收服务，依赖 `web`，执行 `npm run verify`（Vitest → vue-tsc + vite build → 冒烟脚本 `scripts/smoke.mjs`）。

## 目录结构

```
src/core/signature.ts        核心纯逻辑：页码公式、批量文本解析、结构校验、首张不符纸定位、套页链
src/core/signature.spec.ts   Vitest：公式与判定单元测试
src/core/batch.spec.ts       Vitest：批量文本解析（分隔符、行列定位、失败不写入）
src/components/SheetCard.vue 可展开的嵌套纸张卡片（递归组件）
src/App.vue                  主界面：参数、纸堆、结论面板
e2e/proofing.spec.ts         Playwright：录入纠错与判定流程
scripts/smoke.mjs            verify 服务的 HTTP 冒烟检查
Dockerfile                   deps / verify / build / web 多阶段
docker-compose.yml           web（WEB_PORT 可改写）+ verify（一次性）
```
