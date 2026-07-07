# Fridge

**A shared to-do list for the people you live with. Put it on the fridge.**

Fridge is an open-source, self-hosted shared task app modeled on fridge whiteboards. Each person writes in their own ink color. Three cards — **Now**, **Soon**, **Later** — keep today's tasks in front of you and everything else out of your head. No accounts required, no tracking: one passphrase opens your shared workspace from any device.

This project is inspired and influenced by movements of people breaking up with Google, and building their own self-hosted apps and functions. Feel free to fork the code and apply to your own VPS instance. 

## Why

Shared lists shouldn't require a Google account, and your household's errands shouldn't live in an ad company's cloud. Fridge is one Node file and one HTML file. Your data is plain JSON on a disk you control, readable in any text editor, exportable to CSV in one click.

![Now Screenshot in Light Mode](now-light-screenshot.png)
![Now Screenshot in Dark Mode](now-dark-screenshot.png)

## How it works

- **Now** is a fresh dated card every day. Write the few things that matter; unfinished items carry to tomorrow's card automatically (marked ››). Past cards stay browsable.
- **Soon** holds important tasks that aren't for today. Pull from it when filling your day.
- **Later** collects ideas and aspirations so they stop taking up headspace.

- Everyone in the workspace writes in their own ink, and has their own ink color; a filled circle and strikethrough show who checked an item off.
- Checked items sink to the bottom of the card. "Clear" archives them, nothing is deleted.
- Changes sync live between devices. There's a done log, CSV export, full JSON backup, light/dark themes, renameable cards, and a compact 3×5 popup window.
- Works solo too, the second person is optional and can be added later.

The reasoning behind the design decisions are documented in [DESIGN.md](DESIGN.md).

![Soon Screenshot](soon-screenshot.png)
![Later Screenshot](later-screenshot.png)

## Run it in 30 seconds

Requires [Node.js](https://nodejs.org) 18+. No dependencies, no build step, no database.

```bash
git clone https://github.com/unfriendlyamendment/fridge
cd fridge
node server.js
```

Open http://localhost:4321, choose a shared passphrase, and start writing. On a Mac you can also just double-click `Start Cards.command`.

Options: `PORT=8080 node server.js`, `DATA_DIR=/somewhere node server.js`, `TZ=America/New_York node server.js` (the daily card flips at midnight in the server's timezone).

## The passphrase model

There are no usernames. A passphrase *is* a workspace: typing it from any device opens that workspace. This is the whole login system, and it's the "key under the doormat" tradeoff — wonderfully simple, and exactly as strong as the phrase you choose. Use a full phrase is recommended ("tangerine bicycle"), not a word, especially on a server other people can reach. Creating a workspace with a passphrase that already exists is rejected, so workspaces can't collide.

## Your data

Everything lives in `data/`, human-readable:

```
data/workspaces/<id>/
  config.json    names, ink colors, card names, hashed passphrase
  cards.json     all cards and items
  archive.json   every cleared/removed item, forever
  backups/       one automatic snapshot per day
```

Writes are atomic, so a crash can't corrupt files. Tasks record who wrote them and when, who completed them and when, and how many days they've carried over. To back everything up, copy `data/`. To take your data elsewhere, use Export CSV or Download full backup in the app's profile menu.

## Self-hosting on the internet

Any always-on Linux box works: a $4–6/mo VPS (Hetzner, DigitalOcean, Interserver...) or a Raspberry Pi at home behind [Tailscale](https://tailscale.com) for private household use. The VPS recipe:

**1. DNS** — add an A record for your subdomain pointing at the server's IP.

**2. On the server** (Ubuntu, as root):

```bash
apt update && apt upgrade -y
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable

# Node (via NodeSource; any version 18+)
curl -fsSL https://deb.nodesource.com/setup_26.x | bash -
apt install -y nodejs

git clone https://github.com/unfriendlyamendment/fridge /opt/fridge
```

**3. Run it as a service:**

```bash
cat > /etc/systemd/system/fridge.service <<'EOF'
[Unit]
Description=Fridge
After=network.target

[Service]
WorkingDirectory=/opt/fridge
ExecStart=/usr/bin/node server.js
Environment=PORT=4321
Environment=TZ=America/New_York
Restart=always

[Install]
WantedBy=multi-user.target
EOF
systemctl enable --now fridge
```

**4. HTTPS with Caddy** (automatic certificates):

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

cat > /etc/caddy/Caddyfile <<'EOF'
your.domain.here {
    reverse_proxy localhost:4321
}
EOF
systemctl reload caddy
```

**5. Backups** — the app snapshots itself daily on the server; pull an offsite copy periodically from your own machine:

```bash
rsync -av root@YOUR_SERVER:/opt/fridge/data/ ~/fridge-backup/
```

RAM: the server idles around 50 MB and comfortably serves hundreds of workspaces on the smallest VPS tier.

A note on public instances: Fridge was designed for households and friends. If you open an instance to strangers, know that rate limiting and per-workspace quotas are not built in yet — contributions welcome.

## Code structure

Two files. `server.js` is a zero-dependency Node HTTP server: JSON file storage with atomic writes, workspaces keyed by hashed passphrase, server-sent events for live sync, and one `/api/action` endpoint handling all mutations. `public/index.html` is the entire frontend: one global state object, one `render()` function, and an EventSource connection — every change anywhere redraws every open device. If you can read those two files, you understand the whole app.

## License

[MIT](LICENSE) © 2026 [Hazel / Brownish Studio](https://brownish.studio)
