# Deploy With Bun And systemd

This guide targets a Debian or Ubuntu VPS with systemd. Pomment listens only on `127.0.0.1`; expose it through Caddy, nginx, or another trusted reverse proxy.

## 1. Install Bun And Dependencies

Install the OS packages needed by Bun, Git, and the production Redis session store:

```sh
sudo apt update
sudo apt install --yes curl unzip git redis-server
sudo systemctl enable --now redis-server
```

Install the Bun version declared in `package.json`, then place the binary at the path used by the service unit:

```sh
curl -fsSL https://bun.sh/install | bash -s -- bun-v1.3.14
sudo install -m 0755 "$HOME/.bun/bin/bun" /usr/local/bin/bun
/usr/local/bin/bun --version
```

Create a dedicated service account. It does not own the application code and cannot log in:

```sh
sudo useradd --system --home-dir /var/lib/pomment-next --shell /usr/sbin/nologin pomment
```

## 2. Install And Build Pomment

Replace `<repository-url>` with this repository's clone URL:

```sh
sudo git clone <repository-url> /opt/pomment-next
sudo /usr/local/bin/bun install --cwd /opt/pomment-next --frozen-lockfile
sudo /usr/local/bin/bun run --cwd /opt/pomment-next build
```

The build command creates `admin-ui/dist`. Production startup deliberately does not rebuild assets.

## 3. Configure Authentication

Generate the administrator password hash interactively from the application directory:

```sh
cd /opt/pomment-next
sudo /usr/local/bin/bun run auth:hash-password
```

Install the environment file and replace the example origin and password hash. Keep the Argon2 PHC string quoted so it remains easy to read safely:

```sh
sudo install -m 0600 /opt/pomment-next/deploy/pomment-next.env.example /etc/pomment-next.env
sudoedit /etc/pomment-next.env
```

`POMMENT_ADMIN_ORIGIN` must be the public HTTPS origin without a trailing slash. Set `POMMENT_CORS_ORIGINS` to the comma-separated exact origins of websites that need browser access to the public API. The default database location works with the service unit's managed state directory. Do not enable `POMMENT_AUTH_INSECURE_COOKIE` in production.

If admin access is intentionally disabled, remove the admin password, origin, session-store, and Redis variables. Public routes will continue to work, while admin routes return HTTP 503.

## 4. Install The Service

```sh
sudo install -m 0644 /opt/pomment-next/deploy/pomment-next.service /etc/systemd/system/pomment-next.service
sudo systemctl daemon-reload
sudo systemctl enable --now pomment-next
sudo systemctl status pomment-next
curl -fsS http://127.0.0.1:8080/api/health
```

The expected health response is:

```json
{"code":200,"data":null}
```

Inspect logs with:

```sh
sudo journalctl -u pomment-next -f
```

## 5. Configure A Reverse Proxy

The proxy must overwrite `X-Real-IP`; Pomment accepts forwarded client-address headers only from its loopback peer.

Example Caddy site:

```caddyfile
comments.example.com {
    reverse_proxy 127.0.0.1:8080 {
        header_up X-Real-IP {remote_host}
    }
}
```

Example nginx location inside an HTTPS server block:

```nginx
location / {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_pass http://127.0.0.1:8080;
}
```

Do not proxy an untrusted client-supplied `X-Real-IP` unchanged.

## Updates

Back up the database, update the root-owned application tree, rebuild the UI, and restart:

```sh
sudo /usr/local/bin/bun run --cwd /opt/pomment-next backup export --db /var/lib/pomment-next/pomment.db --output /root/pomment-backup.jsonl.gz
sudo git -C /opt/pomment-next pull --ff-only
sudo /usr/local/bin/bun install --cwd /opt/pomment-next --frozen-lockfile
sudo /usr/local/bin/bun run --cwd /opt/pomment-next build
sudo systemctl restart pomment-next
curl -fsS http://127.0.0.1:8080/api/health
```

If `deploy/pomment-next.service` changed, reinstall it and run `sudo systemctl daemon-reload` before restarting.
