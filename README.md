# dummy4u — browser tools

A static, dependency-free site of single-purpose developer tools — a password
generator, a UUID generator (v4 and v7), and an IMEI generator and validator —
plus the content and trust pages needed for a Google AdSense application.

Configured for **https://dummy4u.com/**. Re-run `configure.sh` if the domain, contact address, owner, or governing law changes.

## Layout

The repository *is* the site root — `dummy4u.com/`. Each tool gets its own
folder; the shell, the helpers and the trust pages are shared.

```
index.html                    Hub — https://dummy4u.com/
assets/style.css              Shared shell         3.4 KB gz, cached site-wide
assets/base.js                Shared helpers       1.6 KB gz, cached site-wide
favicon.svg
about.html                    Site-wide trust pages, one copy only
privacy.html
terms.html
contact.html
404.html
robots.txt  sitemap.xml       Domain root
ads.txt.example               Domain root, after approval
configure.sh

password/index.html           Password generator — /password/
password/tool.js
uuid/index.html               UUID generator (v4 + v7) — /uuid/
uuid/tool.js
imei/index.html               IMEI generator — /imei/
imei/validator.html           IMEI validator
imei/imei-format-guide.html   Reference article
imei/tool.js
```

### Adding the next tool

1. `mkdir <tool>` and copy `uuid/index.html` as the starting point — it has the
   full head block, breadcrumb, ad slots and footer already wired at the right
   depth.
2. Write `<tool>/tool.js`. Use `T.randomBelow`, `T.copy`, `T.statusFor`,
   `T.toCsv`, `T.downloadText` and `T.clampInput` from `assets/base.js` rather
   than reimplementing them.
3. Write the content — 600+ words minimum, or it becomes a thin page and drags
   the whole domain down at review time.
4. Add a card and an `ItemList` entry on the hub, plus a row in `sitemap.xml`.
   Footers are site-wide only, so they need no edit.

**Shared shell and helpers, never shared tool logic.** `style.css` and `base.js`
are byte-identical everywhere, fetched once and cached for a year. Each
`tool.js` holds only that tool's logic, so opening the password generator never
downloads the IMEI code.

### Page weight

| Page | Cold cache | Warm cache |
|---|---|---|
| `/` | 6.4 KB | 3.0 KB |
| `/password/` | 11.0 KB | 6.0 KB |
| `/uuid/` | 11.0 KB | 6.0 KB |
| `/imei/` | 11.9 KB | 6.9 KB |

Gzipped, excluding ads. Four requests cold, two warm. No framework, no web
fonts, no analytics. For scale: a single AdSense unit is 100–300 KB, so the ad
tag — not this code — is what determines how heavy a page feels.

## Configure, then deploy

```sh
./configure.sh yourdomain.com you@yourdomain.com "Your Name" "India"
```

That rewrites `https://example.com`, `contact@example.com`, `__OWNER__` and
`__JURISDICTION__` across every HTML, XML and TXT file, then reports anything it
missed.

**Already applied** for this deployment: base URL `https://dummy4u.com/`,
contact `support@dummy4u.com`, owner `dummy4u.com`, governing law India. Re-run
only if one of those changes.

Local preview — just open the file:

```sh
open index.html
```

All paths are relative, so the site works from `file://` as well as from a server.
A server is only needed to exercise the async Clipboard API path instead of the
`execCommand` fallback:

```sh
python3 -m http.server 8000     # http://localhost:8000
```

### Hosting on GitHub Pages

The repository root is the site root, so Pages serves it with no build step and
no path rewriting. Unlike S3, Pages resolves directory indexes natively, so
`/imei/` works without a redirect function.

The repository is already initialised and committed locally. To publish:

```sh
gh auth login                                    # browser flow, no token pasting
gh repo create prasingh-work/dummy4u --public --source=. --push
```

Later deploys are just `git push`.

Then in the repository, **Settings → Pages**:

- **Source**: Deploy from a branch → `main` → `/ (root)`
- **Custom domain**: `dummy4u.com` → Save
- **Enforce HTTPS**: tick it once the certificate is issued (a few minutes)

DNS at your registrar — four A records and four AAAA records on the apex, plus
a CNAME for `www`:

| Type | Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `prasingh-work.github.io` |

Deploying afterwards is `git push`. Repository files that must not be published
(`README.md`, `configure.sh`, `ads.txt.example`) are harmless if they are — they
are not linked from anywhere and carry nothing sensitive.

**Files this needs, already in the repo:**

- `CNAME` — holds `dummy4u.com`. Keep it; deleting it drops the custom domain.
- `.nojekyll` — serves the files as-is instead of running Jekyll over them.
- `404.html` — Pages uses it automatically for unknown paths.

**Caveats worth knowing:**

- The repository must be **public** for Pages on a free account.
- Pages sets its own `Cache-Control: max-age=600` and you cannot override it, so
  the year-long immutable caching for `style.css` and `base.js` is not available.
  Repeat visits still revalidate cheaply with a 304, but a CDN in front would do
  better if traffic ever justifies it.
- Soft limits: 1 GB repository, 100 GB bandwidth per month, 10 builds per hour.
  This site is 176 KB.
- Verify your domain under **Settings → Pages → Verified domains** on your
  account to prevent someone else claiming it if you ever remove it.

### Search Console

Verify the whole domain in Google Search Console, then submit
`https://dummy4u.com/sitemap.xml`.

## Performance

Verified with JavaScriptCore on an M-series Mac: **200,000 IMEIs generated in 39 ms**, all Luhn-valid, all 15 digits, RBI prefixes evenly distributed. The published code samples in `validator.html` and `imei-format-guide.html` were extracted and executed against known-good IMEIs — they are correct as printed.

| | Raw | Gzipped |
|---|---|---|
| `index.html` | 10.3 KB | 4.0 KB |
| `assets/style.css` | 10.4 KB | 3.1 KB |
| `assets/app.js` | 11.4 KB | 3.8 KB |
| **First view total** | **32.1 KB** | **11.0 KB** |

Three requests, no framework, no external fonts, no third-party script until you add ads. CSS and JS are shared across pages, so every page after the first is a single HTML request.

Why generation is fast:

- Random bytes come from a pooled 64 KB buffer — `crypto.getRandomValues` caps at 65536 bytes per call, and per-digit calls dominate the runtime otherwise.
- Rejection sampling (discard bytes `>= 250` for digits, `>= 255` for the 15-entry RBI table) removes modulo bias in a single pass.
- The on-screen list is one text node capped at 300 rows; the full batch goes to the CSV rather than into the DOM.

## AdSense readiness

Built against the current Google Publisher Policies, not folklore.

**Done:**

- Original content on every page: 1,073 words on the IMEI format guide, 820 on the IMEI generator, 788 on the UUID generator, 766 on the password generator, 679 on the hub, 585 on the validator — all written for the audience that actually uses the tool, none of it padding.
- Privacy policy covering advertising cookies, third-party vendors, the Google Ads Settings opt-out, EEA/UK/Swiss consent, CCPA "sharing", children, retention and data rights.
- Terms of use with an explicit prohibited-use section. This is the direct mitigation for the *enabling dishonest behavior* policy, which bans content that "helps users to mislead others" — the page states plainly that generated numbers cannot unlock, unblock, or impersonate a device, and that reprogramming a handset's IMEI is a criminal offence.
- About and Contact pages with a real identity and a working address.
- Header and footer navigation reaching every page; no orphans.
- Ad slots (`.ad-slot`) placed **below** the tool only, and sparse. Google's Inventory Value policy disallows screens carrying more ad material than publisher content.

**You still need to:**

1. **Deploy and get indexed.** Submit `sitemap.xml` in Google Search Console and wait for the pages to be indexed before applying. Applying from an unindexed domain is the most common self-inflicted rejection.
2. **Apply, then paste the AdSense snippet** into the `<head>` and the `.ad-slot` divs. They are empty containers with `min-height: 90px`, so nothing shifts when the ads arrive.
3. **Rename `ads.txt.example` to `ads.txt`** with your real publisher ID, *after* approval. Do not deploy it before then: an `ads.txt` that does not list your real ID tells ad buyers your inventory is unauthorised.
4. **Turn on the European regulations message** in AdSense under Privacy & messaging. Google's own message is a TCF-certified CMP, so you do not need a third-party consent script — which is what keeps the page light. Since 16 January 2024, serving personalised ads to EEA/UK traffic without a certified CMP limits you to Limited Ads.

The site now carries four tools across eleven pages and roughly 7,000 words of original content, which is a materially stronger application than a single-tool domain. If the first attempt is still rejected for low value content, the fix is another tool with real depth behind it, not more ad units.

## SEO

In place: unique title and meta description per page, canonical URLs, one `<h1>` per page, semantic headings, Open Graph and Twitter card tags, `robots.txt` with a sitemap reference, a priority-weighted `sitemap.xml`, internal cross-links between every tool page and the hub, plus visible breadcrumbs, mobile-first responsive layout, and a light payload for Core Web Vitals.

JSON-LD: `WebSite` and `ItemList` on the hub, `WebApplication` on each tool, `TechArticle` on the guide, `BreadcrumbList` on every inner page.

**Deliberately not used: `FAQPage` schema.** Google restricted FAQ rich results to authoritative government and health sites in August 2023 and dropped support entirely in June 2026. Most guides still recommend it; it does nothing for a site like this. The FAQs are written as plain `<dl>` markup, which still reads well and still gets crawled.

Optional: add an `og:image` (1200×630 PNG) and reference it from each page for better link previews. Omitted here because there is no image pipeline in this project.

## Behaviour

- **How many** defaults to `1`, accepts up to `100000` per batch.
- A single result renders formatted and is copied to the clipboard automatically. Batches are not auto-copied — silently replacing the clipboard with 100,000 lines is not something a Generate click should do.
- **Copy** copies the current value or the whole batch; clicking the result does the same.
- **Download CSV** appears only for batches above one. `index,imei`, header row, CRLF endings.
- The validator strips separators, reports the checksum verdict, breaks out RBI/TAC/serial/check digit, and recognises the 16-digit IMEISV case.

Generated numbers are fictional and intended for testing and development only.
