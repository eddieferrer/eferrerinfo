// Parity check: compares a build of this site against the live production site.
//
//   npm run build && npm run parity              # serves ./build locally and compares it to live
//   npm run parity -- https://<deploy-preview>   # compares a deployed URL to live (adds header/redirect checks)
//
// Set PARITY_LIVE_URL to compare against something other than https://eferrer.info.
// Screenshot diffs are written to ./parity-report when they fail.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const LIVE = (process.env.PARITY_LIVE_URL ?? 'https://eferrer.info').replace(/\/$/, '');
const BUILD_DIR = resolve(import.meta.dirname, '../build');
const REPORT_DIR = resolve(import.meta.dirname, '../parity-report');
const WIDTHS = [375, 700, 701, 1280];

// Files that must be served byte-for-byte identical.
const STATIC_PATHS = [
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/site.webmanifest',
  '/assets/icons/iconmonstr-github-2.svg',
  '/assets/icons/iconmonstr-github-5.svg',
  '/assets/icons/iconmonstr-instagram-12.svg',
  '/assets/icons/iconmonstr-instagram-15.svg',
  '/assets/icons/iconmonstr-linkedin-2.svg',
  '/assets/icons/iconmonstr-linkedin-5.svg',
  '/assets/images/hero_image.jpg',
  '/src/assets/images/hero_image.jpg',
];

// Intentional differences from the old site.
const EXPECTED_MISSING = ['/bundle.css.map']; // Vite does not emit CSS source maps for production builds.
const BEACON_TAG =
  /<script type="module" src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon='[^']*'><\/script>/;
const ANALYTICS = [/google-analytics\.com/, /cloudflareinsights\.com/];
// Netlify appends a collaboration toolbar to Deploy Preview URLs only (never production).
const NETLIFY_PREVIEW_DRAWER = /<div data-netlify-deploy-id="[^"]*"[^>]*>[\s\S]*?<\/div>\s*$/;
const NETLIFY_PREVIEW_SCRIPT = /\/\.netlify\/scripts\/cdp/;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `\n      ${detail}` : ''}`);
}
function note(text) {
  console.log(`NOTE  ${text}`);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function serve(dir) {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(dir, path));
    if (!file.startsWith(dir)) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

async function get(base, path) {
  const res = await fetch(base + path, { redirect: 'manual' });
  return {
    status: res.status,
    type: res.headers.get('content-type'),
    location: res.headers.get('location'),
    body: Buffer.from(await res.arrayBuffer()),
  };
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `live: …${a.slice(Math.max(0, i - 40), i + 60)}…\n      new:  …${b.slice(Math.max(0, i - 40), i + 60)}…`;
}

async function checkUrls(cand, remote) {
  console.log('\n# URLs');
  const [liveHome, candHome] = await Promise.all([get(LIVE, '/'), get(cand, '/')]);
  const jsPath = (html) => '/' + html.body.toString().match(/js\/app\.[\w-]+\.js/)?.[0];
  const dynamic = [
    ['/', '/'],
    ['/bundle.css', '/bundle.css'],
    [jsPath(liveHome), jsPath(candHome)],
    [jsPath(liveHome) + '.map', jsPath(candHome) + '.map'],
  ];
  for (const [livePath, candPath] of dynamic) {
    const [l, c] = await Promise.all([get(LIVE, livePath), get(cand, candPath)]);
    check(`${candPath} returns 200`, l.status === 200 && c.status === 200, `live ${l.status}, new ${c.status}`);
    if (remote) check(`${candPath} content-type`, l.type === c.type, `live ${l.type}, new ${c.type}`);
  }
  for (const path of STATIC_PATHS) {
    const [l, c] = await Promise.all([get(LIVE, path), get(cand, path)]);
    const same = l.status === 200 && c.status === 200 && sha(l.body) === sha(c.body);
    check(`${path} identical`, same, `live ${l.status}, new ${c.status}`);
    if (remote) check(`${path} content-type`, l.type === c.type, `live ${l.type}, new ${c.type}`);
  }
  for (const path of EXPECTED_MISSING) {
    const c = await get(cand, path);
    note(`${path} is ${c.status === 200 ? 'present' : 'no longer served'} (intentional)`);
  }
  if (remote) {
    const [l, c] = await Promise.all([get(LIVE, '/ticks'), get(cand, '/ticks')]);
    check('/ticks redirect', l.status === c.status && l.location === c.location, `live ${l.status} ${l.location}, new ${c.status} ${c.location}`);
  } else {
    const redirects = await readFile(join(BUILD_DIR, '_redirects'), 'utf8').catch(() => '');
    check('_redirects contains /ticks rule', /^\/ticks\s+\S+/m.test(redirects));
  }
  return { liveHtml: liveHome.body.toString(), candHtml: candHome.body.toString() };
}

function checkHtml(liveHtml, candHtml) {
  console.log('\n# HTML');
  check('Cloudflare Web Analytics beacon present', BEACON_TAG.test(candHtml));
  check('No Google Analytics reference', !/google-analytics|UA-\d+/.test(candHtml));
  const norm = (html) =>
    html
      .replace(NETLIFY_PREVIEW_DRAWER, '')
      .replace(BEACON_TAG, '')
      .replace(/js\/app\.[\w-]+\.js/g, 'js/app.[hash].js');
  const [l, c] = [norm(liveHtml), norm(candHtml)];
  check('Markup identical (ignoring JS hash and beacon)', l === c, firstDifference(l, c));
}

// Runs in the page: flattens bundle.css into sorted "selector { longhand: value }" lines,
// so formatting, shorthand style and vendor prefixes don't count as differences.
function collectRules() {
  const out = [];
  const walk = (rules, ctx, base) => {
    for (const rule of rules) {
      if (rule instanceof CSSImportRule) {
        out.push(`${ctx}@import ${new URL(rule.href, base).href}`);
      } else if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, `${ctx}@media ${rule.media.mediaText} `, base);
      } else if (rule instanceof CSSStyleRule) {
        const decls = {};
        for (let i = 0; i < rule.style.length; i++) {
          const prop = rule.style[i];
          if (prop.startsWith('-webkit-')) continue; // vendor prefixes are intentionally dropped
          decls[prop] = rule.style
            .getPropertyValue(prop)
            .replace(/url\("?([^")]+)"?\)/g, (_, u) => `url(${new URL(u, base).pathname})`)
            .replace(/\btransparent\b/g, 'rgba(0, 0, 0, 0)'); // same color by definition
        }
        // Drop prefixed entries (e.g. -webkit-transform) from transition lists, keeping the lists aligned.
        const drop = (decls['transition-property'] ?? '')
          .split(', ')
          .flatMap((p, i) => (p.startsWith('-webkit-') ? [i] : []));
        if (drop.length) {
          for (const prop of Object.keys(decls).filter((p) => p.startsWith('transition-'))) {
            decls[prop] = decls[prop].split(', ').filter((_, i) => !drop.includes(i)).join(', ');
          }
        }
        for (const [prop, value] of Object.entries(decls)) {
          out.push(`${ctx}${rule.selectorText} { ${prop}: ${value} }`);
        }
      }
    }
  };
  for (const sheet of document.styleSheets) {
    if (sheet.href?.endsWith('/bundle.css')) walk(sheet.cssRules, '', sheet.href);
  }
  return out.sort();
}

async function openPage(context, url) {
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  page.on('request', (req) => requests.push(req.url()));
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return { page, requests, errors };
}

async function checkBrowser(cand) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    // Never send analytics hits from a test run.
    await context.route((url) => ANALYTICS.some((re) => re.test(url.href)), (route) => route.abort());
    // Keep the Deploy Preview toolbar out of screenshots.
    await context.route((url) => NETLIFY_PREVIEW_SCRIPT.test(url.pathname), (route) => route.abort());

    const live = await openPage(context, LIVE + '/');
    const next = await openPage(context, cand + '/');

    console.log('\n# CSS');
    const [liveRules, candRules] = await Promise.all([live.page.evaluate(collectRules), next.page.evaluate(collectRules)]);
    const missing = liveRules.filter((r) => !candRules.includes(r));
    const extra = candRules.filter((r) => !liveRules.includes(r));
    check(`${liveRules.length} declarations match`, missing.length === 0 && extra.length === 0,
      [...missing.map((r) => `- ${r}`), ...extra.map((r) => `+ ${r}`)].join('\n      '));

    console.log('\n# Behaviour');
    const year = String(new Date().getFullYear());
    for (const [label, p] of [['live', live], ['new', next]]) {
      check(`Footer year is ${year} (${label})`, (await p.page.textContent('#js_year')) === year);
    }
    check('No JavaScript errors', next.errors.length === 0, next.errors.join('; '));
    check('No requests to Google Analytics', !next.requests.some((u) => /google-analytics\.com/.test(u)));
    check('Cloudflare beacon requested', next.requests.includes('https://static.cloudflareinsights.com/beacon.min.js'));

    console.log('\n# Screenshots');
    await mkdir(REPORT_DIR, { recursive: true });
    for (const width of WIDTHS) {
      const shots = [];
      for (const p of [live.page, next.page]) {
        await p.setViewportSize({ width, height: 900 });
        await p.evaluate(() => document.fonts.ready);
        shots.push(PNG.sync.read(await p.screenshot({ fullPage: true })));
      }
      const [a, b] = shots;
      if (a.width !== b.width || a.height !== b.height) {
        check(`${width}px pixel-identical`, false, `size differs: live ${a.width}x${a.height}, new ${b.width}x${b.height}`);
        continue;
      }
      const diff = new PNG({ width: a.width, height: a.height });
      const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0 });
      if (changed) await writeFile(join(REPORT_DIR, `diff-${width}.png`), PNG.sync.write(diff));
      check(`${width}px pixel-identical`, changed === 0, `${changed} pixels differ, see parity-report/diff-${width}.png`);
    }
  } finally {
    await browser.close();
  }
}

const candidateArg = process.argv[2]?.replace(/\/$/, '');
let server;
if (!candidateArg) {
  await access(join(BUILD_DIR, 'index.html')).catch(() => {
    console.error('No build found. Run `npm run build` first.');
    process.exit(1);
  });
  server = await serve(BUILD_DIR);
}
const cand = candidateArg ?? `http://127.0.0.1:${server.address().port}`;
console.log(`Comparing ${cand} against ${LIVE}`);

try {
  const { liveHtml, candHtml } = await checkUrls(cand, Boolean(candidateArg));
  checkHtml(liveHtml, candHtml);
  await checkBrowser(cand);
} finally {
  server?.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
