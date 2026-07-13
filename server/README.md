# CMS Engine — Shared Library Server

A small REST API that backs the "My Library" feature in `cms-engine-by-mvs.html` with a shared, multi-PC datastore instead of per-browser `localStorage`. Reads are open; creating, editing, and deleting library entries requires a per-department passcode.

Runs identically whether hosted locally on a LAN machine or deployed to a cloud host — same code, different environment variables.

## Setup

```bash
cd server
npm install
cp .env.example .env   # edit PORT / DB_PATH / CORS_ORIGIN as needed
```

Set a passcode for each department before staff start saving (repeat per department):

```bash
node scripts/seed-passcodes.js front-desk "1234"
node scripts/seed-passcodes.js f-and-b "5678"
node scripts/seed-passcodes.js housekeeping "9012"
node scripts/seed-passcodes.js general "0000"
```

Re-run the same command to rotate a passcode later.

Start the server:

```bash
npm start
```

It listens on `PORT` (default `4000`) and stores data in a SQLite file at `DB_PATH` (default `./data/library.db`).

## Deploying locally (LAN)

1. Install Node.js LTS on an always-on machine at the location (mini-PC, NAS, or back-office PC).
2. Copy this `server/` directory over, run `npm install --production`.
3. Set `DB_PATH` to a writable directory, and `CORS_ORIGIN` to the URL(s) the frontend is served from.
4. Run it as a persistent service:
   - Linux: a `systemd` unit with `ExecStart=node server.js` and `Restart=on-failure`.
   - Windows: `nssm` or Task Scheduler set to run at startup.
   - Docker/NAS: `docker build -t cms-library . && docker run -d -p 4000:4000 -v $(pwd)/data:/data --restart unless-stopped cms-library`.
5. Give the machine a static local IP (DHCP reservation on the router).
6. Enter `http://<that-machine's-LAN-IP>:4000` as the Server URL in the app's Server Settings on every PC that should use it.
7. If the network isn't a trusted, staff-only segment, put a reverse proxy (e.g. Caddy) in front for HTTPS — passcodes should not travel over plaintext HTTP on an untrusted network.

## Deploying to the cloud

Use a host that supports a **persistent volume** (SQLite must survive restarts/redeploys) — e.g. Render, Fly.io, or Railway. Do not use a purely ephemeral/serverless tier.

1. Push `server/` to a Git repo (or subdirectory) connected to the host.
2. Attach a persistent disk/volume, mount it, and set `DB_PATH` to a path on that volume (e.g. `/data/library.db`).
3. Set `CORS_ORIGIN` to the frontend's deployed origin(s).
4. Deploy. The host provisions HTTPS automatically.
5. Enter the resulting `https://...` URL as the Server URL in the app's Server Settings.

## Backups

The SQLite file is the only copy of the library unless you back it up:

- Schedule a nightly copy (or `sqlite3 library.db "VACUUM INTO 'backup.db'"` for an atomic snapshot) to separate storage.
- The app's own "Export JSON" button is a manual, human-triggered backup any staff member can run at any time.
- To restore: stop the server, replace the `.db` file with a backup, restart.

## API

Base path `/api/v1`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/entries` | open | `?department=&q=&limit=&offset=`, metadata only |
| GET | `/entries/export` | open | same filters, full records incl. snapshot |
| GET | `/entries/:id` | open | full record incl. snapshot |
| POST | `/entries` | passcode | `{name, department, created_by, passcode, snapshot}` |
| PUT | `/entries/:id` | passcode | `{name?, created_by?, passcode, snapshot?}` (department cannot be changed) |
| DELETE | `/entries/:id` | passcode | `{passcode}` |
| POST | `/entries/import` | passcode | `{department, passcode, entries: [...]}` |
| POST | `/auth/verify` | rate-limited | `{department, passcode}` -> `{valid}` |
| GET | `/departments` | open | list of `{key, label}` |
| GET | `/health` | open | liveness check |
