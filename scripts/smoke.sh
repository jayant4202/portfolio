#!/usr/bin/env bash
# Post-deploy smoke test against a live URL. Needs only bash, curl and openssl.
#
#   bash scripts/smoke.sh https://jayantgoswami.com
#
# Exits non-zero if any check fails. Run automatically by .github/workflows/smoke.yml after every
# production deploy and once a day.
set -uo pipefail

BASE="${1:-https://jayantgoswami.com}"
HOST="${BASE#https://}"
HOST="${HOST%%/*}"
pass=0
failed=0

ok()   { echo "  ✓ $1"; pass=$((pass + 1)); }
okif() { if [[ "$1" == "0" ]]; then ok "$2"; else bad "$3"; fi; }  # okif <exit status> <pass msg> <fail msg>
bad()  { echo "  ✗ $1"; failed=$((failed + 1)); }
check() { if eval "$2" >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi; }

headers() { curl -sS -I --max-time 15 "$1" | tr -d '\r'; }
status()  { curl -sS -o /dev/null --max-time 15 -w '%{http_code}' "$@"; }

echo "Smoke test: $BASE"

echo "Pages and security headers"
required=(strict-transport-security content-security-policy reporting-endpoints x-content-type-options
  x-frame-options referrer-policy permissions-policy cross-origin-opener-policy cross-origin-embedder-policy
  cross-origin-resource-policy x-permitted-cross-domain-policies origin-agent-cluster)
for path in / /work /about /demos /privacy /.well-known/security.txt; do
  h=$(headers "$BASE$path")
  code=$(echo "$h" | head -1 | awk '{print $2}')
  if [[ "$code" == "200" ]]; then ok "$path → 200"; else bad "$path → $code"; fi
  missing=""
  for name in "${required[@]}"; do echo "$h" | grep -qi "^$name:" || missing+=" $name"; done
  if [[ -z "$missing" ]]; then ok "$path has all ${#required[@]} security headers"; else bad "$path missing:$missing"; fi
  echo "$h" | grep -qiE '^x-request-id: [0-9a-f]{32}$'; okif $? "$path has a trace ID" "$path has no trace ID"
done
h=$(headers "$BASE/")
check "CSP blocks inline script" "echo \"\$h\" | grep -i '^content-security-policy:' | grep -v unsafe-inline | grep -q \"script-src 'self'\""
check "CSP enforces Trusted Types" "echo \"\$h\" | grep -qi \"require-trusted-types-for 'script'\""
check "HSTS is at least one year" "echo \"\$h\" | grep -iE '^strict-transport-security: max-age=([0-9]{8,}|3[2-9][0-9]{6})'"
check "no cookies are set" "! echo \"\$h\" | grep -qi '^set-cookie'"
check "no X-Powered-By header" "! echo \"\$h\" | grep -qi '^x-powered-by'"

echo "Redirects and errors"
check "http redirects to https" "[[ \$(status -o /dev/null -w '%{redirect_url}' http://$HOST/) == https://* ]]"
check "unknown page → 404" "[[ \$(status $BASE/smoke-test-missing-page) == 404 ]]"
check "POST / → 405" "[[ \$(status -X POST $BASE/) == 405 ]]"
check "/security.txt → 301" "[[ \$(status $BASE/security.txt) == 301 ]]"
check "no open redirect via //evil.example" "[[ \$(status -o /dev/null -w '%{redirect_url}' $BASE//evil.example) != *evil.example* ]]"

echo "Private files are not served"
for path in /build.sh /README.md /package.json /functions/_middleware.js /.env /.git/config /_headers; do
  check "$path → 404" "[[ \$(status $BASE$path) == 404 ]]"
done

echo "Report endpoint"
check "valid report → 204" "[[ \$(status -X POST -H 'content-type: application/csp-report' --data '{\"csp-report\":{\"violated-directive\":\"smoke-test\"}}' $BASE/api/report) == 204 ]]"
check "wrong content type → 415" "[[ \$(status -X POST -H 'content-type: text/plain' --data x $BASE/api/report) == 415 ]]"

echo "TLS"
check "TLS 1.3 supported" "echo | openssl s_client -tls1_3 -connect $HOST:443 -servername $HOST 2>/dev/null | grep -q 'TLSv1.3'"
check "TLS 1.1 refused" "! (echo | openssl s_client -tls1_1 -connect $HOST:443 -servername $HOST 2>/dev/null | grep -q 'Cipher is [A-Z]')"
expiry=$(echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [[ -n "$expiry" ]]; then
  exp_s=$(date -j -f "%b %d %T %Y %Z" "$expiry" +%s 2>/dev/null || date -d "$expiry" +%s)
  days=$(( (exp_s - $(date +%s)) / 86400 ))
  (( days > 14 )); okif $? "certificate valid for $days more days" "certificate expires in $days days"
else
  bad "could not read certificate"
fi

echo "Content"
sec=$(curl -sS --max-time 15 "$BASE/.well-known/security.txt")
check "security.txt canonical uses this host" "echo \"\$sec\" | grep -q \"^Canonical: https://$HOST/\""
exp=$(echo "$sec" | sed -n 's/^Expires: //p')
exp_s=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${exp%%.*}" +%s 2>/dev/null || date -d "$exp" +%s 2>/dev/null || echo 0)
(( (exp_s - $(date +%s)) / 86400 > 30 )); okif $? "security.txt not near expiry" "security.txt expires within 30 days — renew it"
check "canonical link points at this host" "curl -sS $BASE/ | grep -q \"rel=\\\"canonical\\\" href=\\\"https://$HOST\""
check "sitemap uses this host" "curl -sS $BASE/sitemap.xml | grep -q \"<loc>https://$HOST/\""

echo
echo "$pass passed, $failed failed"
(( failed == 0 ))
