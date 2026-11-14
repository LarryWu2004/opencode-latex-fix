import katex from "katex"

export interface MathRenderOptions {
  maxExpand?: number
}

export function renderMath(tex: string, displayMode: boolean, options: MathRenderOptions = {}): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: true,
    trust: false,
    strict: "warn",
    maxExpand: options.maxExpand ?? 1_000,
    output: "htmlAndMathml",
  })
}

export function createMathElement(
  document: Document,
  tex: string,
  displayMode: boolean,
  source: string,
  options: MathRenderOptions = {},
): HTMLSpanElement {
  const element = document.createElement("span")
  element.className = displayMode ? "oc-math oc-math--display" : "oc-math oc-math--inline"
  element.dataset.opencodeMath = displayMode ? "display" : "inline"
  element.dataset.opencodeMathSource = source
  element.innerHTML = renderMath(tex, displayMode, options)
  return element
}
