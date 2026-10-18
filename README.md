# Yatric

Yatric is an endurance training app with an AI coach. Fill in a short form about your race and your running, and the coach assesses where you stand, agrees a goal with you, and writes a periodized plan week by week. As you train, your Garmin activities and recovery data come back into the app, and the coach keeps the plan honest: it reviews each week, predicts your race time from your sessions, and changes the plan with you in a chat.

- **Plans built online** from a form, with your Garmin history when it's synced: 5K to marathon, road or trail, 3 to 30 weeks.
- **A coach you can talk to**, who reads your plan, your activities and your recovery, and proposes changes you apply (or undo) in one click.
- **Weekly reviews**: planned against done, missed sessions, easy runs that weren't easy, how you slept.
- **Load and recovery**: acute:chronic workload ratio, HRV, sleep, readiness, resting heart rate, with warnings when they drift.
- **Race prediction** that moves with your training (Riegel, Daniels VDOT, Tanda, speed at race heart rate).
- **Garmin Connect**: structured workouts sent to your watch, with paces that follow your zones when they change; activities and wellness synced back.
- **Exports**: calendar (.ics), Zwift (.zwo), Garmin (.fit), TrainerRoad/ERG (.mrc).
- Works on phones, and installs on the home screen.

Yatric is open source (MIT) and can be self-hosted.

## Self-hosting

**Requirements:** Docker, or Node.js 22.5+ (for the built-in `node:sqlite` module). The coach needs an [Anthropic API key](https://console.anthropic.com/); everything else works without it.

### 1. Build and run

```bash
git clone https://github.com/tpuiseux/yatric.git
cd yatric
docker build --build-arg BASE_PATH= -t yatric .
```

`BASE_PATH` is baked in at build time: leave it empty to serve from the domain root, or set it (e.g. `/yatric`) to put the app behind a reverse proxy on a subpath.

```yaml
# compose.yml
services:
  yatric:
    image: yatric
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - YATRIC_DB_PATH=/data/yatric.db
      - ORIGIN=https://your-domain.example
      - PORT=3000
    volumes:
      - ./data:/data
```

Copy [`.env.example`](.env.example) to `.env`, fill it in, then `docker compose up -d`.

### 2. Configuration

| Variable                                      | Purpose                                                                                                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `YATRIC_DB_PATH`                              | SQLite database file (default `data/yatric.db`).                                                                                                                                                                                                             |
| `ORIGIN`                                      | The public URL of the app, required by SvelteKit's form protection.                                                                                                                                                                                          |
| `SIGNUP_INVITE_CODE`                          | Opens sign-ups at `/signup` to people who have this code. Unset: sign-ups are closed.                                                                                                                                                                        |
| `ANTHROPIC_API_KEY`                           | Enables the coach (chat, weekly reviews, plan creation). Create the key inside a workspace, with credits on the account.                                                                                                                                     |
| `COACH_MODEL`, `COACH_EFFORT`                 | Model and effort for the chat (default `claude-opus-5-5`, `medium`).                                                                                                                                                                                         |
| `COACH_PLAN_MODEL`, `COACH_PLAN_EFFORT`       | Model and effort for plan creation (default `claude-opus-5-5`, `high`).                                                                                                                                                                                      |
| `COACH_DAILY_LIMIT`, `COACH_PLAN_DAILY_LIMIT` | Messages and plans per athlete per day (default 40 and 3).                                                                                                                                                                                                   |
| `COACH_TIMEZONE`                              | Timezone for "today" and the daily limits (default `Europe/Paris`).                                                                                                                                                                                          |
| `GARMIN_BRIDGE_URL`, `GARMIN_BRIDGE_TOKEN`    | The Garmin bridge, see below.                                                                                                                                                                                                                                |
| `ADDRESS_HEADER`, `XFF_DEPTH`                 | Behind a reverse proxy, the header carrying the client IP, so login and sign-up limits apply per client: `X-Real-IP` if nginx sets `proxy_set_header X-Real-IP $remote_addr;`, or `X-Forwarded-For` with `XFF_DEPTH=1`. Use only the header your proxy sets. |

### 3. Accounts

Athletes create their account at `/signup` with the invite code. You can also create accounts yourself from a clone of the repo, pointed at the same database file:

```bash
npm install
YATRIC_DB_PATH=./data/yatric.db npm run create-user -- --email you@example.com --name "Your Name"
```

It prompts for a password (or pass `--password`).

A plan is created from the "Create a plan" form, or imported as a JSON file following [`src/schema/training-plan.ts`](src/schema/training-plan.ts).

### 4. Garmin Connect (optional)

Workouts can be sent to a connected Garmin account (Settings → Garmin, then "Send to Garmin" on a workout), and connected accounts sync back their activities and recovery data (sleep, HRV, resting heart rate, training readiness, training load). The sync runs when a plan is opened and the last one is over 6 hours old, or from Settings → Garmin → "Sync now".

This goes through a small Python bridge running next to the app. The app never talks to Garmin directly, and the bridge must **never** be exposed publicly. Keep the files of `garmin-bridge/` together wherever it runs.

```bash
cd garmin-bridge
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
GARMIN_BRIDGE_TOKEN=<a random secret> ./venv/bin/python3 garmin_bridge.py --host 127.0.0.1 --port 8420
```

Then set `GARMIN_BRIDGE_URL=http://127.0.0.1:8420` and the same `GARMIN_BRIDGE_TOKEN` in the app's environment. From a Docker container, use the host's address instead of `127.0.0.1` (`http://172.17.0.1:8420` on Linux, `http://host.docker.internal:8420` on Docker Desktop). Bound to anything other than `127.0.0.1`, the bridge refuses to start without a token.

Each athlete gets their own Garmin session token, stored under `~/.garmin-tokens-multiuser/<user id>.json` (`--multiuser-tokenstore-dir`). Their password is used once, in memory, to open that session, which then refreshes itself.

Under systemd, read the bridge's errors with `journalctl -u <service>`: the athlete only sees a short message.

#### When Garmin blocks logins from your server

Garmin's sign-in often rejects password logins from datacenter IPs (`HTTP 403` / `429`, ending in `All login strategies exhausted`). Token refreshes from the same server keep working, so log in once from a home connection and copy the session over:

1. On your computer, with the bridge's venv installed, the athlete logs in (it prompts for email, password and MFA code, and only talks to Garmin):

   ```bash
   cd garmin-bridge
   ./venv/bin/python3 login_local.py --out ~/garmin-token.json
   ```

2. Copy the file to the server as that athlete's token, then delete the local copy:

   ```bash
   scp ~/garmin-token.json your-server:.garmin-tokens-multiuser/<user id>.json
   ssh your-server chmod 600 .garmin-tokens-multiuser/<user id>.json
   rm ~/garmin-token.json
   ```

3. Mark the account as connected in the app's database:

   ```bash
   docker exec <container> node -e "new (require('node:sqlite').DatabaseSync)('/data/yatric.db').prepare(\"INSERT INTO garmin_credentials (user_id, tokenstore_path) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET connected_at = datetime('now')\").run(<user id>, 'multiuser:<user id>')"
   ```

### 5. On a phone

The plan opens on today, one row per day, with plan details behind the ☰ menu. To install it, open it in Safari, then Share → **Add to Home Screen** (Android/Chrome: menu → **Install app**), and log in once inside the installed app.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm run test         # vitest
npm run typecheck    # svelte-check
npm run format       # prettier
```

## Credits and license

Yatric started as a fork of [claude-coach](https://github.com/felixrieseberg/claude-coach) by Felix Rieseberg, whose coaching reference and plan format it builds on. MIT License, see [LICENSE.md](LICENSE.md).

Yatric is an independent project, not affiliated with or endorsed by Anthropic or Garmin. Claude is a trademark of Anthropic, PBC; Garmin and Garmin Connect are trademarks of Garmin Ltd.
