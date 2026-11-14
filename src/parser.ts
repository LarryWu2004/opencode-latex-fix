export interface MathParserOptions {
  /** Enable the ambiguous single-dollar syntax. Defaults to true. */
  singleDollar?: boolean
  /** Ignore formulas whose TeX source exceeds this size. Defaults to 10,000. */
  maxFormulaLength?: number
}

export interface TextSegment {
  type: "text"
  value: string
}

export interface MathSegment {
  type: "math"
  /** TeX between the delimiters. */
  value: string
  /** The complete original expression, including delimiters. */
  source: string
  display: boolean
}

export type MathTextSegment = TextSegment | MathSegment

interface Delimiter {
  open: string
  close: string
  display: boolean
  dollar: boolean
  /** Markdown removed the escaping backslash before this delimiter. */
  normalized?: boolean
}

const DELIMITERS: readonly Delimiter[] = [
  { open: "\\[", close: "\\]", display: true, dollar: false },
  { open: "\\(", close: "\\)", display: false, dollar: false },
  { open: "$$", close: "$$", display: true, dollar: true },
  { open: "$", close: "$", display: false, dollar: true },
  { open: "[", close: "]", display: true, dollar: false, normalized: true },
  { open: "(", close: ")", display: false, dollar: false, normalized: true },
]

function escaped(input: string, index: number): boolean {
  let slashes = 0
  for (let cursor = index - 1; cursor >= 0 && input[cursor] === "\\"; cursor--) slashes++
  return slashes % 2 === 1
}

function validDollarOpen(input: string, index: number, length: number): boolean {
  const next = input[index + length]
  return next !== undefined && !/\s|\$/.test(next)
}

function validDollarClose(input: string, index: number, length: number): boolean {
  const previous = input[index - 1]
  const next = input[index + length]
  if (previous === undefined || /\s|\$/.test(previous)) return false
  // Pandoc's rule prevents a closing dollar in prices such as "$5 and $10".
  return next === undefined || !/\d/.test(next)
}

function findBalancedClose(input: string, delimiter: Delimiter, start: number): number {
  let depth = 0
  for (let cursor = start; cursor < input.length; cursor++) {
    if (escaped(input, cursor)) continue
    if (input[cursor] === delimiter.open) depth++
    if (input[cursor] !== delimiter.close) continue
    if (depth === 0) return cursor
    depth--
  }
  return -1
}

function looksLikeTex(value: string): boolean {
  // Plain brackets and parentheses are ambiguous after Markdown processing.
  // Require explicit TeX structure so links, prose and numeric ranges stay text.
  return /\\[A-Za-z]+/.test(value) || /[_^]/.test(value)
}

function findClose(
  input: string,
  delimiter: Delimiter,
  start: number,
  singleDollar: boolean,
): number {
  if (delimiter.normalized) return findBalancedClose(input, delimiter, start)

  let cursor = start
  while (cursor < input.length) {
    const index = input.indexOf(delimiter.close, cursor)
    if (index < 0) return -1
    if (!escaped(input, index)) {
      if (!delimiter.dollar || delimiter.open === "$$") return index
      if (singleDollar && validDollarClose(input, index, delimiter.close.length)) return index
    }
    cursor = index + delimiter.close.length
  }
  return -1
}

function pushText(segments: MathTextSegment[], value: string): void {
  if (!value) return
  const previous = segments.at(-1)
  if (previous?.type === "text") previous.value += value
  else segments.push({ type: "text", value })
}

/**
 * Split a plain-text node into text and complete math expressions.
 * Incomplete expressions deliberately remain text so streaming output is safe.
 */
export function parseMathText(input: string, options: MathParserOptions = {}): MathTextSegment[] {
  const singleDollar = options.singleDollar !== false
  const maxFormulaLength = options.maxFormulaLength ?? 10_000
  const segments: MathTextSegment[] = []
  let textStart = 0
  let cursor = 0

  while (cursor < input.length) {
    let matched = false

    for (const delimiter of DELIMITERS) {
      if (delimiter.open === "$" && !singleDollar) continue
      if (!input.startsWith(delimiter.open, cursor) || escaped(input, cursor)) continue
      if (delimiter.dollar && !validDollarOpen(input, cursor, delimiter.open.length)) continue

      const contentStart = cursor + delimiter.open.length
      const close = findClose(input, delimiter, contentStart, singleDollar)
      if (close < 0) continue

      const value = input.slice(contentStart, close)
      const end = close + delimiter.close.length
      if (!value.trim() || value.length > maxFormulaLength) continue
      if (delimiter.open === "$" && /[\r\n]/.test(value)) continue
      if (delimiter.normalized && !looksLikeTex(value)) continue

      pushText(segments, input.slice(textStart, cursor))
      segments.push({
        type: "math",
        value,
        source: input.slice(cursor, end),
        display: delimiter.display,
      })
      cursor = end
      textStart = end
      matched = true
      break
    }

    if (!matched) cursor++
  }

  pushText(segments, input.slice(textStart))
  return segments
}
