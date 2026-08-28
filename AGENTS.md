# Project Agent Instructions

## 项目背景

本项目是产品图片生成与画廊工作台。核心要求是：有产品参考图时，默认使用严格产品合成，AI 只生成背景，产品本体使用用户原图像素，不得重绘或猜测商业信息。

## 修改代码前

1. 阅读 `.ai/PROJECT.md`。
2. 阅读 `.ai/ARCHITECTURE.md`。
3. 阅读 `.ai/PROGRESS.md`、`.ai/DECISIONS.md` 和 `.ai/MEMORY.md`。
4. 以当前代码和用户提供的真实素材为准，不把历史失败海报当作授权品牌资料。

## 开发与验收

- 完成修改后运行 `npm test`、`npm run build` 和 `npm run lint`。
- 严格模式测试优先使用 `npm run mock-api`，避免消耗真实接口额度。
- 产品保真失败或去背置信度不足时必须阻断，禁止静默回退为 AI 重绘。
- 页面需支持自由缩放，表格/长内容不得撑破页面，图片预览保持完整比例。
- 不得把 API Key、数据库、缓存、构建目录和浏览器数据加入迁移包。

## 当前状态

见 `.ai/PROGRESS.md`。

## 阶段结束

更新 `.ai/PROGRESS.md`，记录完成内容、修改文件、原因、测试结果、风险和下一步。

