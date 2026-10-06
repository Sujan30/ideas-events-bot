import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { processAnnouncement } from './lib/processAnnouncement.js';
import { EventSheet } from './lib/sheets.js';

const {
  DISCORD_BOT_TOKEN,
  DISCORD_CHANNEL_ID,
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL,
  GOOGLE_SERVICE_ACCOUNT_JSON,
  GOOGLE_SHEET_ID,
  GOOGLE_SHEET_NAME,
} = process.env;

for (const [name, value] of Object.entries({
  DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID, OPENROUTER_API_KEY, OPENROUTER_MODEL,
  GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SHEET_ID,
})) {
  if (!value) throw new Error(`Missing required env var: ${name}`);
}

async function handleAnnouncement(message, sheet) {
  let outcome;
  try {
    outcome = await processAnnouncement(message, sheet, {
      apiKey: OPENROUTER_API_KEY,
      model: OPENROUTER_MODEL,
    });
  } catch (err) {
    console.error(`[process] failed for message ${message.id}:`, err.message);
    await message.react('⚠️').catch(() => {});
    return;
  }

  if (outcome === 'published') {
    await message.react('✅').catch(() => {});
    console.log(`[published] message ${message.id}`);
  } else if (outcome === 'skipped') {
    console.log(`[skip] message ${message.id} is not an event for this year`);
  }
}

async function main() {
  const sheet = new EventSheet({
    credentialsJson: GOOGLE_SERVICE_ACCOUNT_JSON,
    spreadsheetId: GOOGLE_SHEET_ID,
    sheetName: GOOGLE_SHEET_NAME,
  });
  await sheet.init();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Message, Partials.Channel],
  });

  client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}, watching channel ${DISCORD_CHANNEL_ID}`);
  });

  client.on('messageCreate', message => {
    if (message.channelId !== DISCORD_CHANNEL_ID || message.author.bot) return;
    handleAnnouncement(message, sheet);
  });

  client.on('messageUpdate', (_old, newMessage) => {
    if (newMessage.channelId !== DISCORD_CHANNEL_ID || newMessage.author?.bot) return;
    handleAnnouncement(newMessage, sheet);
  });

  client.on('messageDelete', async message => {
    if (message.channelId !== DISCORD_CHANNEL_ID) return;
    try {
      const removed = await sheet.deleteEventByMessageId(message.id);
      if (removed) console.log(`[removed] event for deleted message ${message.id}`);
    } catch (err) {
      console.error(`[sheet] failed to remove event for message ${message.id}:`, err.message);
    }
  });

  await client.login(DISCORD_BOT_TOKEN);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
