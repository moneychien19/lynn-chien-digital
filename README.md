# Lynn's Space

My personal digital garden, built with [Quartz v5](https://quartz.jzhao.xyz/) and hosted on GitHub Pages.

🔗 https://moneychien19.github.io/lynn-chien-digital

## Local development

Requires Node.js `>= 22` (see [`.node-version`](.node-version)).

```bash
npm ci
npx quartz build --serve
```

Then open http://localhost:8080.

Site settings (title, theme, plugins, `baseUrl`) are in [`quartz.config.yaml`](quartz.config.yaml).

## Deployment

Every push to the `v5` branch triggers [`deploy-pages.yaml`](.github/workflows/deploy-pages.yaml), which builds the site and publishes it to GitHub Pages.

## Updating Quartz

This repo is a fork of [jackyzha0/quartz](https://github.com/jackyzha0/quartz), tracked as the `upstream` remote:

```bash
git fetch upstream
git merge upstream/v5
```

## License

Quartz is licensed under the [MIT License](LICENSE.txt).
