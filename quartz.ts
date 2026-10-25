import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { componentRegistry } from "./quartz/components/registry"
import { PageTypeDispatcher } from "./quartz/plugins/pageTypes"
import type { PageMatcher } from "./quartz/plugins/types"
import LanguageSwitch from "./quartz/components/LanguageSwitch"

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
})

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

const dispatcherIndex = config.plugins.emitters.findIndex((e) => e.name === "PageTypeDispatcher")
config.plugins.emitters[dispatcherIndex] = PageTypeDispatcher(layout)

export default config
