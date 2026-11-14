# opencode-latex-fix

在 OpenCode Desktop 的对话正文中直接渲染 LaTeX 公式，无需让模型把公式改写成代码块。

插件使用 KaTeX，在显示层增强 Markdown，不修改会话数据、模型上下文或 OpenCode 数据库。

## 功能

- 支持行内公式：`\(E=mc^2\)`、`$E=mc^2$`
- 支持块级公式：`\[...\]`、`$$...$$`
- 额外支持 `latex`、`tex`、`math` 代码块
- 支持多行公式、矩阵、求和、分式、根号等 KaTeX 语法
- 流式输出时等待公式闭合，更新后自动重新渲染
- 非法或未闭合公式保留原文
- 跳过代码块、行内代码、输入框和可编辑区域
- 防止常见货币文本被误判为公式
- KaTeX、CSS 和字体全部打包，无需访问 CDN

## 环境要求

- 支持 `gui-experimental` 插件 API 的 OpenCode V2 Desktop
- 仅本地开发需要 Node.js 22 或更高版本

> **实验性说明：** OpenCode 的 Desktop GUI API 仍处于实验阶段。普通 Markdown 文本目前没有正式渲染扩展点，因此本插件使用 DOM 增强。OpenCode 页面结构或渲染方式发生重大变化后，可能需要更新适配。

## 从 GitHub 安装

```sh
opencode plugin add github:LarryWu2004/opencode-latex-fix
```

然后在 Desktop 打开 **Settings → Extensions → Plugins**，确认 `opencode-latex-fix` 已加载并启用。

也可以手动将 GitHub 包加入全局 `opencode.jsonc`：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:LarryWu2004/opencode-latex-fix"]
}
```

## 本地目录安装

将下面的路径替换为实际的插件目录，并合并到全局 `opencode.jsonc`。请保留已有的其他配置：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "C:/path/to/opencode-latex-fix",
      "options": {
        "singleDollar": true,
        "maxFormulaLength": 10000,
        "debounceMs": 60
      }
    }
  ]
}
```

### 配置项

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `singleDollar` | `true` | 是否识别 `$...$`；关闭后可减少货币文本歧义 |
| `maxFormulaLength` | `10000` | 单个公式允许的最大 TeX 字符数 |
| `debounceMs` | `60` | 合并流式 DOM 更新的等待毫秒数 |

## 使用示例

模型或用户直接输入：

```text
质能方程为 \(E=mc^2\)。

\[
d_{\mathrm{RMS}}=\sqrt{\frac{1}{N}\sum_i d_i^2}
\]
```

启用插件后，Desktop 应将它们显示为排版后的公式，而不是分隔符源码。

## 工作原理

1. `parser.ts` 只解析完整且有闭合分隔符的数学表达式。
2. `renderer.ts` 使用 KaTeX 输出 HTML 和 MathML，并禁用不可信 TeX 命令。
3. `scanner.ts` 观察渲染后的对话 DOM，跳过代码和编辑区域。
4. 为兼容 Solid 流式更新，扫描器保留宿主原始文本节点，只插入显示节点。
5. 宿主文本更新时移除旧显示节点并重新计算；插件卸载时恢复原文。

消息记录和模型上下文始终保持原始 Markdown。

## 本地开发

```sh
git clone https://github.com/LarryWu2004/opencode-latex-fix.git
cd opencode-latex-fix
npm install
npm run dev
```

完整检查：

```sh
npm run check
```

也可以分别执行：

```sh
npm run typecheck
npm test
npm run build
```

构建结果为单个 `dist/gui-experimental.cjs` 文件。`prepare` 脚本会在从 GitHub 安装时自动构建，因此生成产物不提交到源码仓库。

## 测试

测试覆盖：

- 四种对话公式分隔符
- RMS 等多行公式
- 不完整公式和非法 TeX
- 货币文本与转义分隔符
- 流式文本更新和重复渲染
- 代码及可编辑区域排除
- 插件卸载后的原文恢复

## 已知限制

- 依赖实验性 Desktop GUI API。
- 普通文本公式通过 DOM 增强实现，而非 OpenCode 官方 Markdown AST 扩展点。
- 跨多个宿主文本节点的复杂行内公式可能无法识别。
- OpenCode 大版本升级后应重新验证兼容性。

## License

[MIT](./LICENSE)
