# eferrer.info

My simple "business card" website, live at [eferrer.info](https://eferrer.info).

It's a single static page built with [Vite](https://vite.dev) and [Sass](https://sass-lang.com), hosted on Netlify.

## Requirements

- Node.js 26 LTS (see `.nvmrc`; run `nvm use` to switch)

## Commands

```sh
npm install        # install dependencies
npm start          # dev server with hot reload
npm run build      # production build into ./build
npm run preview    # serve ./build locally
npm run lint       # stylelint (SCSS) + ESLint
```

## Project layout

```
src/
  index.html          page markup (Vite entry point)
  scripts/index.js    imports the styles and fills in the footer year
  styles/             Sass: typography.scss, index.scss
public/               copied as-is to the site root
  _redirects          Netlify redirects (e.g. /ticks)
  assets/icons/       social icons
  src/assets/images/  hero image (see "Legacy URLs")
  favicons, site.webmanifest
vite.config.js        build config
netlify.toml          Netlify build command, publish dir, Node version
```

## Build output

The build reproduces the file layout of the original webpack build, so existing URLs keep working:

| File | Notes |
| --- | --- |
| `index.html` | Minified. The stylesheet `<link>` goes at the end of `<head>`; the app script is a classic `<script>` at the end of `<body>`. |
| `bundle.css` | All styles, minified. Targets Chrome 87 / Edge 88 / Firefox 78 / Safari 14, so media queries keep the `min-width` syntax older Safari understands. |
| `js/app.[hash].js` | Content-hashed, with a source map. |

### Legacy URLs

The original build served the hero image from both `/src/assets/images/hero_image.jpg` (the path the CSS uses) and `/assets/images/hero_image.jpg`.
The real file lives at `public/src/assets/images/`, and the build copies it to `assets/images/` so both URLs keep working (see `legacyHeroCopy` in `vite.config.js`).

## Analytics

[Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) uses the beacon snippet at the end of `src/index.html`.
The domain's DNS is on Cloudflare, but traffic isn't proxied through Cloudflare, so the snippet is needed for analytics to work.
The beacon token isn't a secret, because it's visible in the page source.

## Deployment

Netlify builds every push using `netlify.toml` (`npm run build`, publishing `build/`). Pull requests get a deploy preview.

