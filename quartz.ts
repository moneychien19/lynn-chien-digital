import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { componentRegistry } from "./quartz/components/registry"
import { PageTypeDispatcher } from "./quartz/plugins/pageTypes"
import type { PageMatcher } from "./quartz/plugins/types"
import LanguageSwitch from "./quartz/components/LanguageSwitch"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

// Chinese translations live under content/zh/. The explorer shows only the tree of the
// current page's language: on English pages zh/ is filtered out, on Chinese pages the
// zh/ subtree is hoisted to the root. Chinese folder names come from the title in each
// content/zh/<folder>/index.md. Both functions are serialized and run in the browser on
// every navigation, so they must be self-contained.
// Replacing filterFn drops the default "tags" exclusion, so it is kept here.
// Set on the registry directly: the generated `.quartz/plugins` index treats Explorer
// as a passthrough export (so `ExternalPlugin.Explorer({...})` records nothing), and
// that index is gitignored and not generated in CI.
componentRegistry.setOptionOverrides("@quartz-community/explorer", {
  filterFn: (node: { slugSegment: string }) => {
    const isZh = document.body.dataset.slug?.startsWith("zh/") ?? false
    return node.slugSegment !== "tags" && (isZh || node.slugSegment !== "zh")
  },
  mapFn: (node: { slugSegment: string; slugSegments: string[]; children: unknown[] }) => {
    if (!document.body.dataset.slug?.startsWith("zh/") || node.slugSegments.length > 0) return
    const zh = node.children.find((child) => (child as typeof node).slugSegment === "zh")
    if (zh) node.children = (zh as typeof node).children
  },
  // Folders first (alphabetical), then pages newest first by the `date` that the
  // ContentIndex wrapper below adds to contentIndex.json.
  sortFn: (
    a: { isFolder: boolean; displayName: string; data: { date?: string } | null },
    b: { isFolder: boolean; displayName: string; data: { date?: string } | null },
  ) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
    if (!a.isFolder) {
      const da = a.data?.date ?? ""
      const db = b.data?.date ?? ""
      if (da !== db) return da < db ? 1 : -1
    }
    return a.displayName.localeCompare(b.displayName, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  },
})

// A page's publish date: a `published` frontmatter date if set, otherwise the date of the
// commit that first added the file (following renames, so moving a file keeps its date).
// Deploys check out full history (fetch-depth: 0), so this works in CI too.
// Files not committed yet count as now.
const gitDateCache = new Map<string, Date | undefined>()
function publishDate(file: { filePath?: string; frontmatter?: Record<string, unknown> }): Date {
  const fm = file.frontmatter?.published
  if (fm instanceof Date || typeof fm === "string") {
    const isDateOnly = typeof fm === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fm)
    const d = new Date(isDateOnly ? `${fm}T00:00:00` : fm)
    if (!isNaN(d.getTime())) return d
  }
  if (!file.filePath) return new Date()
  const fp = path.resolve(file.filePath)
  if (!gitDateCache.has(fp)) {
    let date: Date | undefined
    try {
      const log = execFileSync(
        "git",
        ["log", "--follow", "--diff-filter=A", "--format=%aI", "--", path.basename(fp)],
        { cwd: path.dirname(fp), encoding: "utf8" },
      ).trim()
      // Newest first; the last line is the original add.
      if (log) date = new Date(log.split("\n").at(-1)!)
    } catch {
      console.warn(`Warning: couldn't read git history for ${fp}, explorer date will be inaccurate`)
    }
    gitDateCache.set(fp, date)
  }
  return gitDateCache.get(fp) ?? new Date()
}

const config = await loadQuartzConfig()

// zh/index is the Chinese home page, but its slug ends in /index, so it would be rendered
// as the zh/ folder listing. Hand it to the content page like the English index.
const zhHome = "zh/index"
for (const pageType of config.plugins.pageTypes ?? []) {
  const match = pageType.match as PageMatcher
  if (pageType.name === "ContentPage") {
    pageType.match = ((args) => args.slug === zhHome || match(args)) satisfies PageMatcher
  } else if (pageType.name === "FolderPage") {
    pageType.match = ((args) => args.slug !== zhHome && match(args)) satisfies PageMatcher
  }
}

// quartz.config.yaml can only place installed plugins, so the language switch is added
// to the header here. loadQuartzConfig() already built the page dispatcher from the
// YAML layout, so it is rebuilt with the extended layout.
const yamlLayout = await loadQuartzLayout()
const languageSwitch = LanguageSwitch()
const withLanguageSwitch = <T extends { header?: unknown[] }>(layout: T): T => ({
  ...layout,
  header: [languageSwitch, ...(layout.header ?? [])],
})
export const layout = {
  defaults: withLanguageSwitch(yamlLayout.defaults),
  byPageType: Object.fromEntries(
    Object.entries(yamlLayout.byPageType).map(([pageType, pageLayout]) => [
      pageType,
      pageType === "404" ? pageLayout : withLanguageSwitch(pageLayout),
    ]),
  ),
}

// The ContentIndex emitter strips dates from contentIndex.json, which is the explorer's
// only data source. Re-add each page's publish date after it writes the file.
const contentIndex = config.plugins.emitters.find((e) => e.name === "ContentIndex")
if (contentIndex) {
  const addDates = (emit: typeof contentIndex.emit) =>
    async function* (...args: Parameters<typeof contentIndex.emit>) {
      const [ctx, content] = args
      const out = await emit(...args)
      if (out && Symbol.asyncIterator in out) yield* out
      else yield* out ?? []

      const fp = path.join(ctx.argv.output, "static", "contentIndex.json")
      const index = JSON.parse(await fs.promises.readFile(fp, "utf8"))
      for (const [, file] of content) {
        const entry = index[file.data.slug as string]
        if (entry) entry.date = publishDate(file.data as never).toISOString()
      }
      await fs.promises.writeFile(fp, JSON.stringify(index))
    }
  const { emit, partialEmit } = contentIndex
  contentIndex.emit = addDates(emit)
  if (partialEmit) contentIndex.partialEmit = addDates(partialEmit as typeof emit)
}

const dispatcherIndex = config.plugins.emitters.findIndex((e) => e.name === "PageTypeDispatcher")
config.plugins.emitters[dispatcherIndex] = PageTypeDispatcher(layout)

export default config
