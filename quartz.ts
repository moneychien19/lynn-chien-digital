import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { componentRegistry } from "./quartz/components/registry"

// Chinese translations live under content/zh/ and are reached only via in-page links,
// so the explorer lists English notes only. Replacing filterFn drops the default
// "tags" exclusion, so it is kept here.
// Set on the registry directly: the generated `.quartz/plugins` index treats Explorer
// as a passthrough export (so `ExternalPlugin.Explorer({...})` records nothing), and
// that index is gitignored and not generated in CI.
componentRegistry.setOptionOverrides("@quartz-community/explorer", {
  filterFn: (node: { slugSegment: string }) =>
    node.slugSegment !== "tags" && node.slugSegment !== "zh",
})

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
