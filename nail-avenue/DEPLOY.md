# Publishing Nail Avenue

The site is one small Node.js app with a SQLite database file, so it needs a host that gives you
**a persistent disk** (otherwise bookings disappear on every restart). Three easy options:

## A) Render (easiest, ~US$7/month)
1. Put this folder on GitHub (the `.gitignore` keeps `.env` and your database out — never upload `.env`).
2. render.com → New → **Blueprint** → pick the repo. It reads `render.yaml`.
3. When asked, type a **strong ADMIN_PASS**. Deploy.
4. Open the `https://nail-avenue.onrender.com` link. Add your own domain under Settings → Custom Domains.

## B) Railway or Fly.io (Dockerfile included)
Create a service from the repo, add a **volume mounted at `/data`**, and set variables
`ADMIN_USER`, `ADMIN_PASS`, `DATA_DIR=/data`.

## C) Your own VPS
`node server.js` behind Caddy/Nginx for HTTPS, `DATA_DIR` on the server disk, run with pm2 or systemd.

## Before you announce the link
- Choose a **new, strong admin password** (the old one was shared in a chat). 12+ characters.
- Fill in `FACEBOOK_URL` / `INSTAGRAM_URL` in `public/js/config.js`.
- Add your logo files to `public/assets/` if you have them (the site hides them gracefully if missing).
- Book a test appointment, check it in Admin → Calendar, then delete it.

## Backups
Everything lives in the `/data` folder (`nailavenue.db` + `uploads/`). Download or snapshot it regularly
(Render: Disks → Snapshots; VPS: copy the folder).

## Notes
- The server already sends security headers, compresses pages, and exposes `/healthz` for host health checks.
- Wrong admin passwords 5 times pauses sign-in for 15 minutes.
