import { parseMathText, type MathParserOptions, type MathSegment } from "./parser"
import { createMathElement, type MathRenderOptions } from "./renderer"

const SHOW_TEXT = 4
const SKIP_SELECTOR = [
  "pre",
  "code",
  "textarea",
  "input",
  "select",
  "script",
  "style",
  "noscript",
  "[contenteditable]",
  "[role='textbox']",
  "[data-opencode-math]",
  ".katex",
].join(",")
const CONTAINER_SELECTOR = "p,li,blockquote,td,th,h1,h2,h3,h4,h5,h6,div"

interface BindingGroup {
  root: Element
  nodes: Text[]
  generated: Node[]
}

interface TextBinding {
  /** Original host value before this plugin changed the text node. */
  source: string
  /** The value left in the original host-owned text node. */
  renderedValue: string
  /** Display nodes owned by this binding or binding group. */
  generated: Node[]
  /** Present when one formula spans multiple host text nodes. */
  group?: BindingGroup
}

interface TextEntry {
  node: Text
  start: number
  end: number
}

export interface MathScannerOptions extends MathParserOptions, MathRenderOptions {
  /** Delay used to coalesce streaming DOM updates. Defaults to 60 ms. */
  debounceMs?: number
}

function skipped(node: Node): boolean {
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement
  return element?.closest(SKIP_SELECTOR) != null
}

/**
 * Enhances rendered Markdown without changing OpenCode's session data.
 *
 * Original Text objects remain in place because Solid may retain and update
 * them while a message streams. Generated nodes are removed whenever the host
 * writes a new value into any text node owned by the same formula.
 */
export class MathScanner {
  private readonly root: Document | Element
  private readonly options: MathScannerOptions
  private readonly bindings = new Map<Text, TextBinding>()
  private readonly generated = new WeakSet<Node>()
  private readonly pending = new Set<Document | Element>()
  private observer: MutationObserver | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private active = false

  constructor(root: Document | Element, options: MathScannerOptions = {}) {
    this.root = root
    this.options = options
  }

  start(): void {
    if (this.active) return
    const Observer = this.document.defaultView?.MutationObserver
    if (!Observer) throw new Error("MutationObserver is unavailable")
    this.active = true
    this.observer = new Observer((records) => this.onMutations(records))
    this.observer.observe(this.root, { childList: true, subtree: true, characterData: true })
    this.scanWithin(this.root)
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    this.observer?.disconnect()
    this.observer = undefined
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.pending.clear()
    for (const node of Array.from(this.bindings.keys())) this.restore(node, true)
    this.bindings.clear()
  }

  /** Run pending work immediately. Useful after deterministic DOM updates. */
  flush(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    const roots = Array.from(this.pending)
    this.pending.clear()
    this.pruneDisconnected()
    for (const root of roots) {
      if (root === this.root || (root.isConnected && this.root.contains(root))) this.scanWithin(root)
    }
  }

  private get document(): Document {
    return this.root.nodeType === 9 ? (this.root as Document) : this.root.ownerDocument!
  }

  private schedule(root: Document | Element): void {
    if (!this.active) return
    this.pending.add(root)
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), this.options.debounceMs ?? 60)
  }

  private onMutations(records: MutationRecord[]): void {
    if (!this.active) return
    for (const record of records) {
      if (record.type === "characterData") {
        const node = record.target as Text
        const binding = this.bindings.get(node)
        if (binding?.renderedValue === node.data || this.generated.has(node)) continue
        if (node.parentElement) this.schedule(node.parentElement)
        continue
      }

      const changed = [...record.addedNodes, ...record.removedNodes]
      if (changed.length > 0 && changed.every((node) => this.generated.has(node))) continue
      if (record.target.nodeType === 1 || record.target.nodeType === 9) {
        this.schedule(record.target as Document | Element)
      }
    }
  }

  private pruneDisconnected(): void {
    for (const node of Array.from(this.bindings.keys())) {
      if (!node.isConnected) this.restore(node, false)
    }
  }

  private textNodes(root: ParentNode): Text[] {
    const walker = this.document.createTreeWalker(root, SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    return nodes
  }

  private scanWithin(root: Document | Element): void {
    if (root.nodeType === 1 && skipped(root)) return
    for (const node of this.textNodes(root)) this.scanText(node)
    this.scanContainers(root)
  }

  private scanText(node: Text): void {
    if (this.generated.has(node) || skipped(node) || !node.isConnected) return

    const existing = this.bindings.get(node)
    if (existing) {
      if (existing.renderedValue === node.data) return
      this.restore(node, false)
    }

    const segments = parseMathText(node.data, this.options)
    if (!segments.some((segment) => segment.type === "math")) return
    const parent = node.parentNode
    if (!parent) return

    const source = node.data
    const last = segments.at(-1)
    const suffix = last?.type === "text" ? last.value : ""
    const generatedCount = last?.type === "text" ? segments.length - 1 : segments.length
    const fragment = this.document.createDocumentFragment()
    const generated: Node[] = []

    for (const segment of segments.slice(0, generatedCount)) {
      let replacement: Node
      if (segment.type === "text") {
        replacement = this.document.createTextNode(segment.value)
      } else {
        try {
          replacement = createMathElement(this.document, segment.value, segment.display, segment.source, this.options)
        } catch {
          // Invalid TeX remains exactly as it appeared in the host message.
          replacement = this.document.createTextNode(segment.source)
        }
      }
      this.generated.add(replacement)
      generated.push(replacement)
      fragment.appendChild(replacement)
    }

    parent.insertBefore(fragment, node)
    this.bindings.set(node, { source, renderedValue: suffix, generated })
    node.data = suffix
  }

  /** Reconstruct a formula that Markdown split across inline or block nodes. */
  private scanContainers(root: Document | Element): void {
    const containers: Element[] = []
    if (root.nodeType === 1 && (root as Element).matches(CONTAINER_SELECTOR)) containers.push(root as Element)
    containers.push(...Array.from(root.querySelectorAll<Element>(CONTAINER_SELECTOR)))

    // Preorder is parents before children. Reverse it so the nearest suitable
    // message container gets the first chance to render an incomplete formula.
    for (const container of containers.reverse()) {
      if (!container.isConnected || skipped(container)) continue
      const nodes = this.textNodes(container).filter(
        (node) => node.data && node.isConnected && !this.generated.has(node) && !skipped(node),
      )
      if (nodes.length < 2 || nodes.some((node) => this.bindings.has(node))) continue

      const entries: TextEntry[] = []
      let combined = ""
      for (const node of nodes) {
        const start = combined.length
        combined += node.data
        entries.push({ node, start, end: combined.length })
      }
      const hasDelimiter =
        combined.includes("\\[") ||
        combined.includes("\\(") ||
        combined.includes("[") ||
        combined.includes("(") ||
        combined.includes("$")
      if (!/\\[A-Za-z]+|[_^$]/.test(combined) || !hasDelimiter) continue

      const segments = parseMathText(combined, this.options)
      const candidates: {
        math: MathSegment
        start: TextEntry
        end: TextEntry
        startOffset: number
        endOffset: number
      }[] = []
      let offset = 0
      for (const segment of segments) {
        const length = segment.type === "math" ? segment.source.length : segment.value.length
        if (segment.type === "math") {
          const startPosition = offset
          const endPosition = offset + length
          const start = entries.find((entry) => startPosition >= entry.start && startPosition < entry.end)
          const end = entries.find((entry) => endPosition - 1 >= entry.start && endPosition - 1 < entry.end)
          if (start && end && start.node !== end.node) {
            candidates.push({ math: segment, start, end, startOffset: startPosition, endOffset: endPosition })
          }
        }
        offset += length
      }

      // Keep the cross-node path deliberately conservative. Multiple formulas
      // in one fragmented container remain source rather than risking reordering.
      if (candidates.length !== 1) continue
      const { math, start, end, startOffset, endOffset } = candidates[0]
      if (!start.node.parentNode) continue

      let formula: HTMLSpanElement
      try {
        formula = createMathElement(this.document, math.value, math.display, math.source, this.options)
      } catch {
        continue
      }

      const affected = entries.filter((entry) => entry.end > startOffset && entry.start < endOffset)
      const group: BindingGroup = { root: container, nodes: affected.map((entry) => entry.node), generated: [formula] }
      const values = affected.map((entry) => {
        const source = entry.node.data
        let renderedValue = ""
        if (entry === start) renderedValue = source.slice(0, startOffset - entry.start)
        else if (entry === end) renderedValue = source.slice(endOffset - entry.start)
        return { entry, source, renderedValue }
      })

      this.generated.add(formula)
      start.node.parentNode.insertBefore(formula, start.node.nextSibling)
      for (const { entry, source, renderedValue } of values) {
        this.bindings.set(entry.node, { source, renderedValue, generated: group.generated, group })
        entry.node.data = renderedValue
      }
    }
  }

  private restore(node: Text, restoreSource: boolean): void {
    const initial = this.bindings.get(node)
    if (!initial) return
    const group = initial.group
    const nodes = group?.nodes ?? [node]
    const owned = nodes
      .map((current) => ({ current, binding: this.bindings.get(current) }))
      .filter((value): value is { current: Text; binding: TextBinding } => value.binding != null)

    for (const current of nodes) this.bindings.delete(current)
    for (const generated of initial.generated) generated.parentNode?.removeChild(generated)
    for (const { current, binding } of owned) {
      // Preserve the one value just written by the host; restore every other
      // member so the complete source can be parsed again as a group.
      if ((restoreSource || current !== node) && current.data === binding.renderedValue) {
        current.data = binding.source
      }
    }
    if (group && this.active && group.root.isConnected) this.schedule(group.root)
  }
}
