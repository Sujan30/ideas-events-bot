import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { processAnnouncement } from './lib/processAnnouncement.js';
import { EventSheet } from './lib/sheets.js';
import { log, warn, logError } from './lib/log.js';

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
    logError('process', 'failed', err, { messageId: message.id });
    await message.react('⚠️').catch(() => {});
    return;
  }

  if (outcome === 'published') {
    await message.react('✅').catch(() => {});
    log('published', 'event is in the sheet', { messageId: message.id });
  } else if (outcome === 'skipped') {
    log('skip', 'message not published', { messageId: message.id });
  }
}

async function main() {
  log('startup', 'config', {
    channelId: DISCORD_CHANNEL_ID,
    model: OPENROUTER_MODEL,
    spreadsheetId: GOOGLE_SHEET_ID,
    sheetName: GOOGLE_SHEET_NAME || 'Sheet1 (default)',
    node: process.version,
  });
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
    log('discord', `logged in as ${client.user.tag}`, { watchingChannel: DISCORD_CHANNEL_ID });
    const channel = client.channels.cache.get(DISCORD_CHANNEL_ID);
    log('discord', channel ? 'watched channel is visible' : 'WATCHED CHANNEL NOT VISIBLE TO BOT (check channel id / permissions)', {
      channelName: channel?.name,
      guilds: client.guilds.cache.map(g => g.name),
    });
  });

  client.on('warn', msg => warn('discord', msg));
  client.on('error', err => logError('discord', 'client error', err));
  client.on('shardDisconnect', (event, id) => warn('discord', 'shard disconnected', { shard: id, code: event.code }));
  client.on('shardReconnecting', id => warn('discord', 'shard reconnecting', { shard: id }));
  client.on('shardResume', id => log('discord', 'shard resumed', { shard: id }));

  client.on('messageCreate', message => {
    if (message.channelId !== DISCORD_CHANNEL_ID || message.author.bot) return;
    log('discord', 'messageCreate', { messageId: message.id, author: message.author.tag, length: message.content?.length ?? 0 });
    handleAnnouncement(message, sheet);
  });

  client.on('messageUpdate', (_old, newMessage) => {
    if (newMessage.channelId !== DISCORD_CHANNEL_ID || newMessage.author?.bot) return;
    log('discord', 'messageUpdate', { messageId: newMessage.id, partial: newMessage.partial, length: newMessage.content?.length ?? 0 });
    handleAnnouncement(newMessage, sheet);
  });

  client.on('messageDelete', async message => {
    if (message.channelId !== DISCORD_CHANNEL_ID) return;
    try {
      const removed = await sheet.deleteEventByMessageId(message.id);
      log('removed', removed ? 'deleted row for deleted message' : 'no row for deleted message', { messageId: message.id });
    } catch (err) {
      logError('sheet', 'failed to remove event', err, { messageId: message.id });
    }
  });

  await client.login(DISCORD_BOT_TOKEN);
}

process.on('unhandledRejection', err => logError('process', 'unhandled rejection', err));

main().catch(err => {
  logError('fatal', 'startup failed', err);
  process.exit(1);
});
