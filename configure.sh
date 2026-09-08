#!/bin/sh
# Replace the placeholders across the site. Run once, before the first deploy.
#
#   ./configure.sh <domain> <email> <owner name> <jurisdiction>
#
# Example:
#   ./configure.sh imeigen.dev hello@imeigen.dev "Jane Doe" "India"

set -eu

if [ $# -ne 4 ]; then
  sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

DOMAIN=$(printf '%s' "$1" | sed 's|^https\{0,1\}://||; s|/$||')
EMAIL=$2
OWNER=$3
JURISDICTION=$4

FILES=$(find . -type f \( -name '*.html' -o -name '*.xml' -o -name '*.txt' \) ! -name 'ads.txt.example')

for f in $FILES; do
  sed -i.bak \
    -e "s|https://example\.com|https://$DOMAIN|g" \
    -e "s|contact@example\.com|$EMAIL|g" \
    -e "s|__OWNER__|$OWNER|g" \
    -e "s|__JURISDICTION__|$JURISDICTION|g" \
    "$f"
  rm -f "$f.bak"
done

echo "Configured for https://$DOMAIN"
printf 'Remaining placeholders: '
if grep -rl 'example\.com\|__OWNER__\|__JURISDICTION__' --include='*.html' --include='*.xml' --include='*.txt' . 2>/dev/null | grep -v 'ads.txt.example'; then
  echo "(see above — these still need attention)"
else
  echo "none"
fi
