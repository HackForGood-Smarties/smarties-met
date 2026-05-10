# Static prototype on Cloud Run.
# Cloud Run hands the container PORT=8080 by default; nginx listens on it.
FROM nginx:1.27-alpine

COPY . /usr/share/nginx/html

# Replace the default server block with one tailored to the prototype:
#   - listen on 8080 (Cloud Run convention)
#   - SPA-style fallback to index.html so #/<anything> deep links work
#   - serve .jsx with text/javascript so the network panel is sane
#     (the browser still transforms via Babel because of the type="text/babel" attribute)
RUN printf '%s\n' \
  'server {' \
  '  listen 8080;' \
  '  root /usr/share/nginx/html;' \
  '  index index.html;' \
  '  include /etc/nginx/mime.types;' \
  '  types {' \
  '    application/javascript jsx;' \
  '  }' \
  '  default_type text/html;' \
  '  location / {' \
  '    try_files $uri $uri/ /index.html;' \
  '  }' \
  '  location /vendor/ {' \
  '    expires 7d;' \
  '    add_header Cache-Control "public, max-age=604800, immutable";' \
  '  }' \
  '}' \
  > /etc/nginx/conf.d/default.conf

EXPOSE 8080
