import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MathScanner } from "../src/scanner"

async function settle(scanner: MathScanner): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  scanner.flush()
}

describe("MathScanner", () => {
  let scanner: MathScanner

  beforeEach(() => {
    document.body.innerHTML = ""
    scanner = new MathScanner(document, { debounceMs: 1_000 })
  })

  afterEach(() => scanner.stop())

  it("renders existing conversation text and restores it on stop", () => {
    const source = String.raw`质能方程 \(E=mc^2\) 很著名。`
    const paragraph = document.createElement("p")
    paragraph.textContent = source
    document.body.appendChild(paragraph)

    scanner.start()
    expect(paragraph.querySelectorAll("[data-opencode-math]")).toHaveLength(1)
    expect(paragraph.querySelector("[data-opencode-math]")?.getAttribute("data-opencode-math-source")).toBe(
      String.raw`\(E=mc^2\)`,
    )

    scanner.stop()
    expect(paragraph.textContent).toBe(source)
    expect(paragraph.querySelector("[data-opencode-math]")).toBeNull()
  })

  it("renders the screenshot-style RMS expression", () => {
    const paragraph = document.createElement("p")
    paragraph.textContent = String.raw`\[d_{\mathrm{RMS}}=\sqrt{\frac{1}{N_{\mathrm{internal}}}\sum_{i\in\mathrm{internal}}d_i^2}\]`
    document.body.appendChild(paragraph)
    scanner.start()

    const formula = paragraph.querySelector("[data-opencode-math='display']")
    expect(formula).not.toBeNull()
    expect(formula?.querySelector(".katex-display")).not.toBeNull()
  })

  it("waits for a closing delimiter during streaming", async () => {
    const paragraph = document.createElement("p")
    const text = document.createTextNode(String.raw`结果 \[x^2`)
    paragraph.appendChild(text)
    document.body.appendChild(paragraph)
    scanner.start()
    expect(paragraph.querySelector("[data-opencode-math]")).toBeNull()

    text.data = String.raw`结果 \[x^2\]`
    await settle(scanner)
    expect(paragraph.querySelectorAll("[data-opencode-math]")).toHaveLength(1)
  })

  it("keeps the host Text object and re-renders when Solid updates it", async () => {
    const paragraph = document.createElement("p")
    const hostText = document.createTextNode("结果")
    paragraph.appendChild(hostText)
    document.body.appendChild(paragraph)
    scanner.start()

    hostText.data = String.raw`结果 \(x^2\)`
    await settle(scanner)
    expect(paragraph.lastChild).toBe(hostText)
    expect(paragraph.querySelectorAll("[data-opencode-math]")).toHaveLength(1)

    hostText.data = String.raw`结果 \(x^2+y^2\) 完成`
    await settle(scanner)
    expect(paragraph.lastChild).toBe(hostText)
    expect(hostText.data).toBe(" 完成")
    expect(paragraph.querySelectorAll("[data-opencode-math]")).toHaveLength(1)
    expect(paragraph.querySelector("[data-opencode-math]")?.getAttribute("data-opencode-math-source")).toBe(
      String.raw`\(x^2+y^2\)`,
    )
  })

  it("handles newly inserted messages without duplicate formulas", async () => {
    scanner.start()
    const message = document.createElement("div")
    message.innerHTML = String.raw`<p>one \(x\)</p><p>two $$y$$</p>`
    document.body.appendChild(message)
    await settle(scanner)
    await settle(scanner)
    expect(message.querySelectorAll("[data-opencode-math]")).toHaveLength(2)
  })

  it("skips code, editable content and prices", async () => {
    const container = document.createElement("div")
    container.innerHTML = String.raw`<pre>\(x^2\)</pre><code>\(y^2\)</code><p contenteditable="true">\(z^2\)</p><p>Costs $5 and $10</p>`
    document.body.appendChild(container)
    scanner.start()
    await settle(scanner)
    expect(container.querySelector("[data-opencode-math]")).toBeNull()
  })

  it("retains invalid TeX while rendering other formulas", () => {
    const paragraph = document.createElement("p")
    paragraph.textContent = String.raw`bad \(\frac{1}{\) and good \(x^2\)`
    document.body.appendChild(paragraph)
    scanner.start()

    expect(paragraph.textContent).toContain(String.raw`\frac{1}{`)
    expect(paragraph.querySelectorAll("[data-opencode-math]")).toHaveLength(1)
  })
})
