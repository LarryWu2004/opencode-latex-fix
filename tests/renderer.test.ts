import { describe, expect, it } from "vitest"
import { createMathElement, renderMath } from "../src/renderer"

describe("KaTeX renderer", () => {
  it("renders accessible inline math", () => {
    const html = renderMath("E=mc^2", false)
    expect(html).toContain("katex")
    expect(html).toContain("math")
  })

  it("renders the RMS formula as display math", () => {
    const html = renderMath(String.raw`d_{\mathrm{RMS}}=\sqrt{\frac{1}{N_{\mathrm{internal}}}\sum_{i\in\mathrm{internal}}d_i^2}`, true)
    expect(html).toContain("katex-display")
  })

  it("creates a source-preserving wrapper", () => {
    const source = String.raw`\(x^2\)`
    const element = createMathElement(document, "x^2", false, source)
    expect(element.dataset.opencodeMathSource).toBe(source)
    expect(element.classList.contains("oc-math--inline")).toBe(true)
    expect(element.querySelector(".katex")).not.toBeNull()
  })

  it("throws on invalid TeX so callers can retain the source", () => {
    expect(() => renderMath(String.raw`\frac{1}{`, true)).toThrow()
  })
})
