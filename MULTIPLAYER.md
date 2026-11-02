# Two-player private rooms

Implemented: six-character private room codes, two seats, 1v1 (blue/red) and co-op (both blue), preset robots, ready votes, shared three-second countdown and match phases, shared fuel/score, per-driver controls, shared pause, return-to-lobby after a match, explicit leave, and a 30-second disconnect reservation with automatic connection retry. AUTO remains driver-controlled.

## Run locally

Install Node.js 22 or newer, then from this directory:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm start
```

Open `http://localhost:3000` in two browser windows. Select **Private room · 2 players**, create a room, then join from the second window with its code. Choose robots, then both click **Ready up**. The server hosts the frontend locally as well as `/ws` and `/health`.

Tests:

```sh
corepack pnpm test
```

The server tests start a temporary loopback listener. The multiplayer physics test simulates a complete 166-second co-op match and checks fuel conservation.

## Deploy to Render

1. Create a Render account and a GitHub/GitLab repository containing this directory's contents. Do not upload `node_modules`, `.git`, `.env`, or old ZIP files. Put `package.json`, `pnpm-lock.yaml`, `render.yaml`, `server/`, and `dist/` at the repository root.
2. In Render choose **New → Blueprint**, connect that repository, and use the included `render.yaml`. It declares a free Node web service, build command `corepack pnpm install --frozen-lockfile`, start command `node server/index.cjs`, and health check `/health`. Alternatively create a Node Web Service with those same settings. If this directory is nested in your repository, set Root Directory to `field-lab` instead.
3. After deployment open `https://YOUR-SERVICE.onrender.com/health`; it should report `{"ok":true,"rooms":0}`. The Render URL also serves the whole game and automatically uses its own multiplayer server.
4. To keep playing on the existing Netlify URL, set `globalThis.FIELD_LAB_SERVER_URL` in `dist/server-config.js` to the Render HTTPS URL and upload the updated `dist` folder to Netlify. Before that permanent connection is made, each player can enter the same Render URL under **Private room → Server connection**; it is saved in that browser.
5. Open the game on two devices, create/join a room, and verify 1v1 and co-op. The current deployment is prepared, not hosted on Render yet.

Render accepts secure WebSockets on the same public port as HTTP. The server binds to `0.0.0.0` and honors Render's `PORT`. `ALLOWED_ORIGINS` is a comma-separated list and already includes `https://stunning-flan-fd1b50.netlify.app`. Same-origin Render pages and localhost are also accepted. Add a custom frontend domain there before using it.

References: https://render.com/docs/websocket and https://render.com/docs/blueprint-spec

## Architecture and first-version limits

- Node.js + `ws`; browser-native WebSocket client. No game-server credentials or secrets in the frontend. Room codes are invite secrets; anyone with the code can claim an available seat.
- The room creator’s browser owns the authoritative physics, clock, fuel and score. The server manages rooms, sanitizes guest input, and relays snapshots. This is intended for private matches between trusted players; a modified host can change the simulation.
- The host runs a 120 Hz world step with adaptive contact substeps, receives guest input at up to 30 Hz, and sends snapshots at up to 20 Hz. Both clients interpolate snapshots and predict their own robot within a bounded window. The host should keep the game tab visible; hiding it pauses the match.
- Guest inputs older than 300 ms become neutral. Hiding the host tab pauses the shared match; hiding or unfocusing a guest browser releases controls. Help releases controls. P pauses/resumes for both players. Leaving ends the match and returns the remaining player to the lobby.
- A dropped connection pauses the match; the same open tab retries with a private seat token. The seat expires after 30 seconds. Refreshing/closing the tab loses that token; wait for the reservation to expire before joining again. A successful reconnect stays paused until a player presses Resume.
- Rooms live in memory on one server instance. Deploys/restarts discard rooms. Keep one instance; multi-instance routing requires shared room ownership and is not implemented. A free Render service can sleep when idle and take time to wake. It is suitable for initial testing, not an availability guarantee.
- Default maximum: four rooms and 32 connections. No room browser, accounts, public matchmaking, spectators, persistent match history, 3v3, or bots. Co-op follows the existing active/inactive schedule; both players share blue's score. Shot and accuracy telemetry is room-wide; inventory and speed are per-driver.
- Full fuel positions are relayed at up to 20 Hz. The host must stay connected and have enough CPU to run the field. Server backpressure skips snapshots for slow clients, and payload/rate limits reject oversized or excessive input.

## Live verification still required after Render deployment

The local tests exercise real WebSockets and two Chrome clients. Internet latency, Render cold starts, and sustained multi-room load cannot be validated until the server is hosted. Recheck disconnect recovery and play a full match from two devices once the Render URL exists.

