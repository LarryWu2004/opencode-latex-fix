import { describe, expect, it } from "vitest"
import { parseMathText } from "../src/parser"

const math = (input: string, singleDollar = true) =>
  parseMathText(input, { singleDollar }).filter((segment) => segment.type === "math")

describe("parseMathText", () => {
  it("parses bracket display math containing newlines", () => {
    const input = String.raw`RMS：\[d_{\mathrm{RMS}}=\sqrt{\frac{1}{N}\sum_i d_i^2}\]`
    const result = math(input)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: "math",
      value: String.raw`d_{\mathrm{RMS}}=\sqrt{\frac{1}{N}\sum_i d_i^2}`,
      display: true,
    })
  })

  it("parses inline parentheses and preserves surrounding Chinese text", () => {
    const segments = parseMathText(String.raw`质能方程 \(E=mc^2\) 很著名。`)
    expect(segments.map((segment) => segment.type)).toEqual(["text", "math", "text"])
    expect(segments[0]).toEqual({ type: "text", value: "质能方程 " })
    expect(segments[2]).toEqual({ type: "text", value: " 很著名。" })
  })

  it("parses double-dollar display math", () => {
    expect(math("before $$x^2 + y^2$$ after")[0]).toMatchObject({ value: "x^2 + y^2", display: true })
  })

  it("parses multiple single-dollar expressions", () => {
    expect(math("$x$ and $y$")).toHaveLength(2)
  })

  it("can disable single-dollar expressions without affecting other delimiters", () => {
    expect(parseMathText("$x$ and $$y$$", { singleDollar: false })).toHaveLength(2)
    expect(math("$x$ and $$y$$", false)).toHaveLength(1)
  })

  it("does not treat prices as inline math", () => {
    expect(math("价格分别是 $5 和 $10")).toHaveLength(0)
    expect(math("Prices are $5 and $10")).toHaveLength(0)
  })

  it("leaves incomplete streaming expressions as text", () => {
    expect(math(String.raw`before \[x^2`)).toHaveLength(0)
    expect(math("before $$x^2")).toHaveLength(0)
    expect(math("before $x^2")).toHaveLength(0)
  })

  it("ignores escaped delimiters", () => {
    expect(math(String.raw`price \$5 and \$10`)).toHaveLength(0)
  })

  it("ignores empty and excessively large expressions", () => {
    expect(math(String.raw`\(\)`)).toHaveLength(0)
    expect(parseMathText(String.raw`\[x^2\]`, { maxFormulaLength: 2 })).toEqual([
      { type: "text", value: String.raw`\[x^2\]` },
    ])
  })

  it("parses display math after Markdown removes delimiter backslashes", () => {
    const input = String.raw`[ \int_{0}^{\infty} e^{-x^2}\,\mathrm{d}x=\frac{\sqrt{\pi}}{2} ]`
    expect(math(input)).toHaveLength(1)
    expect(math(input)[0]).toMatchObject({
      value: String.raw` \int_{0}^{\infty} e^{-x^2}\,\mathrm{d}x=\frac{\sqrt{\pi}}{2} `,
      display: true,
    })
  })

  it("parses structured inline math after Markdown removes backslashes", () => {
    expect(math("质能方程为 (E=mc^2)")[0]).toMatchObject({ value: "E=mc^2", display: false })
  })

  it("supports nested brackets in normalized TeX", () => {
    expect(math(String.raw`[\sqrt[3]{x}]`)[0]).toMatchObject({ value: String.raw`\sqrt[3]{x}` })
  })

  it("does not turn ordinary brackets, links, ranges or prose into math", () => {
    expect(math("[普通链接](https://example.com)")).toHaveLength(0)
    expect(math("区间 [0,1] 和说明（普通文字）")).toHaveLength(0)
    expect(math("ordinary (parentheses) stay text")).toHaveLength(0)
  })
})
