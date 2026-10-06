# IDEAS Events Bot

Watches the Discord #announcements channel for event posts, extracts the
event details with a free OpenRouter LLM, and publishes them as a row in
the same Google Sheet the website already reads from (see
`../GOOGLE_SHEETS_EVENTS_SETUP.md`). No manual data entry — an officer
just posts the announcement like normal, and the event appears on the site
within seconds (no rebuild/redeploy needed).

Also handles edits (re-extracts and updates the row) and deletions (removes
the row), tracked via a hidden `Message ID` column.

## How it decides what's an event

Any message in the watched channel containing a 📅, 📍, or 📌 emoji (and
longer than 20 characters) is sent to the LLM for extraction. If the model
says it's not actually an event (`isEvent: false`), it's skipped silently.
Published messages get a ✅ reaction; failures get ⚠️ or ❌ so you can spot
problems by scrolling the channel.

## One-time setup

### 1. Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) -> **New Application**.
2. **Bot** tab -> **Reset Token** -> copy it (this is `DISCORD_BOT_TOKEN`). Keep it secret.
3. Still on the **Bot** tab, under **Privileged Gateway Intents**, enable **Message Content Intent**. This is required or the bot can't read message text at all.
4. **OAuth2** tab -> **URL Generator** -> scopes: `bot`. Bot permissions: `View Channel`, `Read Message History`, `Add Reactions`. Copy the generated URL, open it, and invite the bot to your server (needs Manage Server permission on your Discord account).
5. In Discord, enable **Developer Mode** (Settings -> Advanced), then right-click the #announcements channel -> **Copy Channel ID** (this is `DISCORD_CHANNEL_ID`).

### 2. OpenRouter (free LLM)

1. Sign up at [openrouter.ai](https://openrouter.ai).
2. **Keys** -> **Create Key** (this is `OPENROUTER_API_KEY`).
3. Browse [openrouter.ai/models?max_price=0](https://openrouter.ai/models?max_price=0) and pick a current free text model that supports structured JSON output (the free-model lineup changes over time). Set its exact ID string as `OPENROUTER_MODEL`.

### 3. Google Sheet write access

The site reads events via public CSV export (read-only). Writing rows
requires real API auth:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) -> create/select a project.
2. **APIs & Services -> Library** -> enable **Google Sheets API**.
3. **APIs & Services -> Credentials** -> **Create Credentials -> Service Account**. Give it any name.
4. Open the created service account -> **Keys** -> **Add Key -> Create new key -> JSON**. This downloads a `.json` file.
5. Open that file, and set its full content (as one line) as `GOOGLE_SERVICE_ACCOUNT_JSON`.
6. Open the events Google Sheet -> **Share** -> add the service account's `client_email` (found in the JSON) as **Editor**.
7. Add a `Message ID` column header to row 1 of the sheet (any empty column) — this is how the bot tracks edits/deletions.
8. `GOOGLE_SHEET_ID` is the long ID in the sheet's URL: `docs.google.com/spreadsheets/d/{THIS_PART}/edit`.

### 4. Configure and run locally (optional, to test)

```bash
cp .env.example .env
# fill in .env with the values from steps 1-3
npm install
npm start
```

### 5. Deploy (Railway)

Render's free tier sleeps after 15 minutes of inactivity, which breaks a
bot that needs to stay connected — use Railway instead (~$5/month free
credit covers a small bot running 24/7):

1. Push this `discord-bot/` folder to a GitHub repo (or use the existing monorepo).
2. [railway.app](https://railway.app) -> **New Project -> Deploy from GitHub repo** -> select it, set the root directory to `discord-bot/`.
3. In Railway's **Variables** tab, paste in everything from your `.env`.
4. Railway auto-detects `npm start` and keeps the process running persistently.

## Credentials checklist (send these to Claude only via a local `.env` file, never pasted in chat)

- `DISCORD_BOT_TOKEN`
- `DISCORD_CHANNEL_ID`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEET_NAME` (optional, defaults to `Sheet1`)
