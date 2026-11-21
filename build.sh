#!/usr/bin/env bash
# Builds the deployable site from public/ into dist/ (or $OUT).
# It refuses to build — so nothing gets deployed — if anything could send visitors to the wrong
# website, break a page, or ship unsafe content.
#
#   SITE_URL=https://jayantgoswami.com bash build.sh
#
# Cloudflare Pages: Build command `bash build.sh`, output directory `dist`, env var SITE_URL.
set -euo pipefail
cd "$(dirname "$0")"

SITE_URL="${SITE_URL:-}"
OUT="${OUT:-dist}"
MAX_FILE_MB=25
# The only outside addresses the site may point to. Add one here deliberately if you ever need it.
ALLOWED_EXTERNAL='^(https://www\.linkedin\.com/in/jayant-goswami/|https://schema\.org)$'

fail() { echo "BUILD FAILED: $*" >&2; exit 1; }

# 1. A real site address is required (local previews may use http://localhost).
if [[ ! "$SITE_URL" =~ ^https://[a-z0-9-]+(\.[a-z0-9-]+)+$ && ! "$SITE_URL" =~ ^http://localhost(:[0-9]+)?$ ]]; then
  fail "set SITE_URL to your domain, e.g. SITE_URL=https://jayantgoswami.com (no trailing slash)"
fi

rm -rf "${OUT:?}"
mkdir -p "$OUT"
cp -R public/. "$OUT/"
find "$OUT" -name '.DS_Store' -delete

# 2. Put the real domain into page links, link previews, sitemap and robots.txt.
while IFS= read -r f; do
  sed -i.bak "s#https://YOUR-DOMAIN\.com#${SITE_URL}#g" "$f" && rm -f "$f.bak"
done < <(grep -rlI 'https://YOUR-DOMAIN.com' "$OUT" || true)
if grep -rlI 'YOUR-DOMAIN' "$OUT"; then fail "placeholder domain still present in the files above"; fi

HTML_FILES=$(find "$OUT" -name '*.html')

# 2b. Cache-busting: stamp every CSS/JS/image reference with a fingerprint of the file's contents,
#     so after a deploy no visitor ever mixes new pages with an old cached stylesheet or script.
stamp() { # stamp <asset path> <files to rewrite...>
  local asset=$1; shift
  [[ -f "$OUT$asset" ]] || return 0
  local v; v=$(cksum < "$OUT$asset" | cut -d' ' -f1)
  local f; for f in "$@"; do
    sed -i.bak -E "s#${asset//./\\.}([\" )])#${asset}?v=${v}\1#g" "$f" && rm -f "$f.bak"
  done
}
CSS_FILES=$(find "$OUT/assets/css" -name '*.css' 2>/dev/null || true)
for img in $(cd "$OUT" && find assets/img -type f | sed 's#^#/#'); do stamp "$img" $HTML_FILES $CSS_FILES; done
for asset in $(cd "$OUT" && find assets/css assets/js -type f | sed 's#^#/#'); do stamp "$asset" $HTML_FILES; done

# 3. Every outside link must be on the allow-list (no surprise redirects to other sites).
bad=$(grep -hoE '(href|src|action|content|data-demo-url)="https?://[^"]+"' $HTML_FILES \
  | sed -E 's/^[a-z-]+="//; s/"$//' \
  | grep -vE "^${SITE_URL}(/|$)" | grep -vE "$ALLOWED_EXTERNAL" \
  | grep -vE '^https://[a-z0-9-]+\.(vercel|streamlit|lovable|replit)\.app(/|$)|^https://[a-z0-9-]+\.pages\.dev(/|$)' \
  | sort -u || true)
[[ -z "$bad" ]] || fail "links to sites not on the allow-list:
$bad"

# 4. No script-style links, redirects or inline code (the security policy would block inline code anyway).
if grep -nE '(href|src|action)="(javascript|data|vbscript):' $HTML_FILES; then fail "unsafe link scheme"; fi
if grep -niE 'http-equiv="refresh"' $HTML_FILES; then fail "meta refresh redirect"; fi
if grep -nE '<[a-z][^>]*\s(style|on[a-z]+)=' $HTML_FILES; then fail "inline style or event handler"; fi
while IFS= read -r line; do
  [[ "$line" == *noopener* ]] || fail "link opens a new tab without rel=noopener: $line"
done < <(grep -hoE '<a [^>]*target="_blank"[^>]*>' $HTML_FILES || true)

# 4b. Every page's main structural tags must be closed, or the layout breaks.
for page in $HTML_FILES; do
  stripped=$(perl -0pe "s/<!--.*?-->//gs" "$page")
  for tag in div section article main aside header footer nav ul ol figure; do
    open=$( { printf "%s" "$stripped" | grep -oE "<${tag}[ >]" || true; } | wc -l | tr -d " ")
    close=$( { printf "%s" "$stripped" | grep -oE "</${tag}>" || true; } | wc -l | tr -d " ")
    [[ "$open" == "$close" ]] || fail "unclosed <${tag}> in ${page#$OUT} (${open} opened, ${close} closed)"
  done
done

# 5. Every internal link, script, image, video and PDF must exist.
missing=""
while IFS= read -r ref; do
  path="${ref%%[?#]*}"
  [[ -z "$path" ]] && continue
  [[ "$path" == */ ]] && path="${path}index.html"
  [[ -e "$OUT$path" ]] || missing+="$ref"$'\n'
done < <(grep -hoE '(href|src)="/[^"]*"' $HTML_FILES | sed -E 's/^[a-z]+="//; s/"$//' | sort -u)
[[ -z "$missing" ]] || fail "broken internal links:
$missing"

# 6. Downloads: no active content in PDFs, nothing over the host's file-size limit.
while IFS= read -r pdf; do
  head -c 5 "$pdf" | grep -q '%PDF-' || fail "not a real PDF: $pdf"
  if LC_ALL=C grep -aqE '/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|XFA|SubmitForm|ImportData)[^A-Za-z]' "$pdf"; then
    fail "PDF contains active content: $pdf"
  fi
  if LC_ALL=C grep -aoE '/URI *\((javascript|file|data|vbscript):' "$pdf"; then fail "PDF has an unsafe link: $pdf"; fi
done < <(find "$OUT" -name '*.pdf')
while IFS= read -r big; do fail "file over ${MAX_FILE_MB} MB (Cloudflare limit): $big"; done \
  < <(find "$OUT" -type f -size +"${MAX_FILE_MB}"M)

# 7. Only files a website should serve.
if find "$OUT" -type f \( -name '*.sh' -o -name '*.md' -o -name '.env*' -o -name '*.key' -o -name '*.pem' \) | grep .; then
  fail "files that shouldn't be public are in public/"
fi

echo "Build OK: $(find "$OUT" -type f | wc -l | tr -d ' ') files in $OUT for $SITE_URL"
