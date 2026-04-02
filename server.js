const express = require("express");
const { google } = require("googleapis");
const say = require("say");

const app = express();
app.use(express.static("public"));
app.use(express.json());

const WebSocket = require("ws");

app.listen(4000, () => {
  console.log("Servidor bot en http://localhost:4000");
});

const wss = new WebSocket.Server({ port: 4001 });
console.log("🟣 WS en ws://localhost:4001");


/* =========================
   CONFIG
========================= */

const API_KEY = "AIzaSyAU0vJXcrqRl0nfHbXP747zQKVCeg2_8Kg";

const youtube = google.youtube({
  version: "v3",
  auth: API_KEY
});

/* =========================
   ESTADO GLOBAL DEL BOT
========================= */

let currentInterval = null;
let mensajesLeidos = new Set();
let inicializado = false;
let queue = [];
let speaking = false;
let active = true;
let clients = new Set();


/* =========================
   UTILS
========================= */

function getVideoId(url) {
  const match = url.match(/v=([^&]+)/);
  return match ? match[1] : null;
}

/* =========================
   CHAT ID
========================= */

async function getLiveChatId(videoId) {
  const res = await youtube.videos.list({
    part: "liveStreamingDetails",
    id: videoId
  });

  const details = res.data.items[0]?.liveStreamingDetails;

  if (!details?.activeLiveChatId) {
    throw new Error("No es un live activo");
  }

  return details.activeLiveChatId;
}

/* =========================
   VOZ
========================= */

function processQueue() {
  if (speaking || queue.length === 0) return;

  speaking = true;

  const text = queue.shift();

  say.speak(text, undefined, 1.3, () => {
    speaking = false;
    processQueue();
  });
}

/* =========================
   DETENER BOT
========================= */

function stopBot() {
  active = false; // 🔥 esto mata el loop

  mensajesLeidos.clear();
  inicializado = false;
  queue = [];

  console.log("🛑 Bot detenido");
}

/* =========================
   LEER CHAT
========================= */

async function readChat(liveChatId) {
  let nextPageToken = null;
  active = true;

  async function poll() {
    if (!active) return; // 🔥 detener loop

    try {
      const res = await youtube.liveChatMessages.list({
        liveChatId,
        part: "snippet,authorDetails",
        pageToken: nextPageToken
      });

      nextPageToken = res.data.nextPageToken;

      res.data.items.forEach(msg => {
        const id = msg.id;

        if (mensajesLeidos.has(id)) return;
        mensajesLeidos.add(id);

        if (!inicializado) return;

        const text = msg.snippet.displayMessage;
        const user = msg.authorDetails.displayName;

        console.log(`${user}: ${text}`);
        
        clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              user,
              text
            }));
          }
        });

        if (!text) return;

        const cleanText = text
          .replace(/:[^:\s]+:/g, "")
          .replace(/[^\w\sáéíóúñü.,!?]/gi, "");

        queue.push(cleanText);
        processQueue();
      });

      if (!inicializado) {
        inicializado = true;
        console.log("🟡 Bot listo, ahora solo leerá mensajes nuevos...");
      }

      const wait = res.data.pollingIntervalMillis || 2000;

      setTimeout(poll, wait);

    } catch (err) {
      console.log("Error:", err.message);
      setTimeout(poll, 5000);
    }
  }

  poll();
}

/* =========================
   ENDPOINT
========================= */

app.get("/start", async (req, res) => {
  try {
    const url = req.query.url;

    const videoId = getVideoId(url);

    if (!videoId) {
      return res.status(400).json({ error: "URL inválida" });
    }

    // 🔥 detener bot anterior
    stopBot();

    const chatId = await getLiveChatId(videoId);

    console.log("🎯 Nuevo live:", videoId);

    readChat(chatId);

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/.well-known/appspecific/com.chrome.devtools.json", (req, res) => {
  res.json({});
});

app.get("/", (req, res) => {
  res.send("🔥 Bot activo");
});

app.get("/stop", (req, res) => {
  stopBot();
  res.json({ success: true });
});

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("🔌 Cliente conectado");

  ws.on("close", () => {
    clients.delete(ws);
    console.log("❌ Cliente desconectado");
  });
});