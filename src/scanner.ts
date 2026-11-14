import { parseMathText, type MathParserOptions } from "./parser"
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

interface TextBinding {
  /** Original host value before this plugin changed the text node. */
  source: string
  /** The suffix left in the original host-owned text node. */
  renderedValue: string
  /** Prefix, formula and separator nodes inserted before the host text node. */
  generated: Node[]
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
 * The original Text object remains in place because Solid may retain and update
 * it while a message streams. Generated nodes are inserted before it and are
 * removed whenever the host writes a new value into that Text object.
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
    for (const node of this.bindings.keys()) {
      if (!node.isConnected) this.bindings.delete(node)
    }
  }

  private scanWithin(root: ParentNode): void {
    if (root.nodeType === 1 && skipped(root)) return
    const walker = this.document.createTreeWalker(root, SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    for (const node of nodes) this.scanText(node)
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

  private restore(node: Text, restoreSource: boolean): void {
    const binding = this.bindings.get(node)
    if (!binding) return
    this.bindings.delete(node)
    for (const generated of binding.generated) generated.parentNode?.removeChild(generated)
    if (restoreSource && node.data === binding.renderedValue) node.data = binding.source
  }
}
