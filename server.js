import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import { Telegraf } from "telegraf";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(bodyParser.json());
app.use(express.static(__dirname));
/* ==============================
   TELEGRAM BOT (WEBHOOK ONLY)
================================ */

const bot = new Telegraf(process.env.BOT_TOKEN);

// invite_link -> createdAt
const inviteMap = new Map();

async function createInvite(channelId) {
  const link = await bot.telegram.createChatInviteLink(channelId, {
    member_limit: 1,
    expire_date: Math.floor(Date.now() / 1000) + 600 // 10 min
  });

  inviteMap.set(link.invite_link, Date.now());
  return link.invite_link;
}

// bot.on("chat_member", async (ctx) => {
//   const member = ctx.chatMember.new_chat_member;
//   if (!member || member.status !== "member") return;

//   const invite = ctx.chatMember.invite_link?.invite_link;
//   if (!invite || !inviteMap.has(invite)) {
//     await ctx.telegram.banChatMember(ctx.chat.id, member.user.id);
//     return;
//   }

//   inviteMap.delete(invite);
// });

/* ==============================
   DATA MODEL
================================ */

const startAppMap = {
  "apftg234": {
    shortLink: "https://shorturl.io/fjdj44",
    tempKey: "secret123X9LmPq",
    channelID: -1003665228542
  }
};

// hashedIP -> startapp
const ipMap = new Map();

/* ==============================
   HELPERS
================================ */

function getIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress
  );
}

function hashIP(ip) {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

function verifyTelegram(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");

  const dataCheck = [...params.entries()]
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = crypto
    .createHash("sha256")
    .update(process.env.BOT_TOKEN)
    .digest();

  const hmac = crypto
    .createHmac("sha256", secret)
    .update(dataCheck)
    .digest("hex");

  return hmac === hash;
}

/* ==============================
   FIRST PAGE (WEBAPP VERIFY)
================================ */

app.post("/verify", (req, res) => {
  const { initData, startapp } = req.body;

  if (!verifyTelegram(initData)) {
    return res.status(403).json({ error: "Invalid Telegram data" });
  }

  const config = startAppMap[startapp];
  if (!config) {
    return res.status(404).json({ error: "Invalid startapp" });
  }

  const ipHash = hashIP(getIP(req));

  // store TEMP permission
  ipMap.set(ipHash, startapp);

  // redirect to shortener
  res.json({ redirect: config.shortLink });
});

/* ==============================
   FINAL PAGE (TEMPKEY)
================================ */

app.get("/tempkey/:secret", async (req, res) => {
  const { secret } = req.params;

  const ipHash = hashIP(getIP(req));

  if (!ipMap.has(ipHash)) {
    return res.status(403).send("Access denied");
  }

  const startapp = ipMap.get(ipHash);
  const config = startAppMap[startapp];

  if (!config || config.tempKey !== secret) {
    return res.status(403).send("Access denied");
  }

  // consume mapping
  ipMap.delete(ipHash);

  const invite = await createInvite(config.channelID);

  res.send(`
    <html>
      <body>
        <h3>Access Granted ✅</h3>
        <a href="${invite}">Join Telegram</a>
      </body>
    </html>
  `);
});

/* ==============================
   TELEGRAM WEBHOOK
================================ */

// app.post(`/webhook/${process.env.BOT_TOKEN}`, (req, res) => {
//   bot.handleUpdate(req.body);
//   res.sendStatus(200);
// });

/* ==============================
   START SERVER
================================ */

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
