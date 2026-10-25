import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { FullSlug, resolveRelative } from "../util/path"
import { classNames } from "../util/lang"

// Chinese pages mirror English ones under zh/, so the counterpart of a page is
// its slug with the zh/ prefix added or removed.
const zhPrefix = "zh/"

function counterpartOf(slug: FullSlug): FullSlug {
  return (slug.startsWith(zhPrefix) ? slug.slice(zhPrefix.length) : zhPrefix + slug) as FullSlug
}

function LanguageSwitch({ fileData, allFiles, displayClass }: QuartzComponentProps) {
  const slug = fileData.slug!
  const isZh = slug.startsWith(zhPrefix)
  const target = counterpartOf(slug)

  // Folder pages are not in allFiles, so treat a folder as existing if any note lives under it.
  const folder = target.endsWith("/index") ? target.slice(0, -"index".length) : null
  const exists = allFiles.some(
    (f) => f.slug === target || (folder !== null && f.slug?.startsWith(folder)),
  )
  const href = resolveRelative(slug, exists ? target : ((isZh ? "index" : "zh/index") as FullSlug))

  return (
    <nav class={classNames(displayClass, "language-switch")} aria-label="Language">
      {isZh ? (
        <a href={href} hreflang="en">
          EN
        </a>
      ) : (
        <span aria-current="true">EN</span>
      )}
      <span class="separator">/</span>
      {isZh ? (
        <span aria-current="true">中文</span>
      ) : (
        <a href={href} hreflang="zh">
          中文
        </a>
      )}
    </nav>
  )
}

LanguageSwitch.css = `
.language-switch {
  margin-left: auto;
  display: flex;
  gap: 0.4rem;
  font-size: 0.9rem;
  color: var(--gray);
}

.language-switch [aria-current] {
  color: var(--dark);
  font-weight: 600;
}

.language-switch a {
  color: var(--gray);
}
`

export default (() => LanguageSwitch) satisfies QuartzComponentConstructor
