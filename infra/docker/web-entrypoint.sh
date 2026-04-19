#!/bin/sh
set -eu

cat <<EOF >/usr/share/nginx/html/env.js
window.__APP_ENV__ = {
  VITE_API_URL: '${VITE_API_URL:-http://localhost:3000/api}',
  VITE_SUPABASE_URL: '${VITE_SUPABASE_URL:-}',
  VITE_SUPABASE_ANON_KEY: '${VITE_SUPABASE_ANON_KEY:-}'
};
EOF

exec nginx -g 'daemon off;'

