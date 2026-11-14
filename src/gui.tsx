import { CodeBlock, Plugin, Style } from "@opencode/plugin/gui"
import katexStyles from "katex/dist/katex.min.css?inline"
import { createMathElement } from "./renderer"
import { MathScanner } from "./scanner"
import customStyles from "./styles.css?inline"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, `${katexStyles}\n${customStyles}`)

    ctx.add(CodeBlock, {
      languages: ["latex", "tex", "math"],
      render: (props) => {
        try {
          return createMathElement(document, props.code, true, props.code)
        } catch {
          return undefined
        }
      },
    })

    const scanner = new MathScanner(document, {
      singleDollar: ctx.options.singleDollar !== false,
      maxFormulaLength:
        typeof ctx.options.maxFormulaLength === "number" ? ctx.options.maxFormulaLength : undefined,
      debounceMs: typeof ctx.options.debounceMs === "number" ? ctx.options.debounceMs : undefined,
    })
    scanner.start()
    return () => scanner.stop()
  },
})
