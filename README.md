# 接龙转WBS图小程序

把微信群里的接龙文本一键转换成 PlantUML WBS 图。

## 功能

- 📋 粘贴接龙原文（支持「1. 昵称 A组」等常见格式）
- 🧠 自动识别 A/B/C/D/E/F 组与「慢跑/放松」组
- 🖼 调用 PlantUML 在线服务器渲染 SVG/PNG
- 💾 保存图片到相册、复制 PlantUML 源码
- 🎨 自定义配色样式，分组清晰

## 项目结构

```
jielong2mindmap/
├── app.js / app.json / app.wxss   # 小程序全局配置
├── sitemap.json
├── project.config.json
├── pages/
│   └── index/                     # 主页面
│       ├── index.js
│       ├── index.wxml
│       ├── index.wxss
│       └── index.json
└── utils/
    ├── parser.js                  # 接龙文本解析 + WBS 生成
    └── plantumlEncoder.js         # PlantUML HEX 编码
```

## 使用步骤

1. 用 **微信开发者工具** 打开本目录（导入项目 → 选择 `jielong2mindmap`）。
2. AppID 选择「测试号」或填入自己的 AppID。
3. 在「详情 → 本地设置」中勾选 **不校验合法域名**（开发阶段），或在小程序后台 → 开发管理 → 服务器域名中加入：
   - request 合法域名：`https://www.plantuml.com`
   - downloadFile 合法域名：`https://www.plantuml.com`
4. 点击「编译」即可预览。

## 实现要点

### 接龙解析（utils/parser.js）

- 用正则 `^\d+[\.\、\)．]` 抓行号
- 通过关键词匹配分组：`A组` / `B组` / `慢跑` 等
- 按 `空格 / 全角空格 / -` 切分昵称与备注
- 自动去 emoji，按组聚合排序

### PlantUML 渲染（utils/plantumlEncoder.js）

PlantUML 服务器支持三种 URL 编码：
- `~1` deflate + base64
- `~h` **HEX**（本项目使用）
- `~0` brotli

HEX 编码无需引入压缩库，对接龙这种小文本完全够用，URL 形如：

```
https://www.plantuml.com/plantuml/svg/~h{HEX_OF_UTF8_BYTES}
```

### SVG/PNG 双模式

- 默认渲染 SVG（清晰、可缩放）
- 预览/保存时自动切换 PNG（`wx.previewImage` / `wx.saveImageToPhotosAlbum` 不支持 SVG）
- SVG 加载失败时自动回退 PNG

## 扩展建议

- 自建 PlantUML 服务器替换 `app.js` 中的 `plantumlServer` 字段
- 在 `parser.js` 的 `DEFAULT_GROUP_RULES` 中增加更多分组关键词
- 默认使用 `toWBS` 输出 WBS 图
