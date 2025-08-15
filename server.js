import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import Pino from "pino";
import express from "express";
import sharp from "sharp";

// Servidor HTTP só pra manter vivo no host
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("Bot de figurinhas rodando ✅"));
app.listen(PORT, () => console.log(`HTTP ok na porta ${PORT}`));

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: true, // QR aparece no console
    auth: state,
    logger: Pino({ level: "silent" }),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    console.log(
      "Conexão:",
      connection || "",
      lastDisconnect?.error?.message || ""
    );
  });

  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages?.[0];
    if (!msg?.message || msg.key.fromMe) return;

    // Se tiver mídia
    const tipo = Object.keys(msg.message)[0];
    if (["imageMessage", "videoMessage"].includes(tipo)) {
      try {
        const buffer = await downloadMediaMessage(
          msg,
          "buffer",
          {},
          { logger: Pino({ level: "silent" }) }
        );

        let stickerBuffer;

        if (tipo === "imageMessage") {
          // Redimensiona imagem p/ 512x512 e converte pra WebP
          stickerBuffer = await sharp(buffer)
            .resize(512, 512)
            .webp()
            .toBuffer();
        } else {
          // Se for vídeo, manda direto (Baileys lida com conversão)
          stickerBuffer = buffer;
        }

        await sock.sendMessage(msg.key.remoteJid, {
          sticker: { url: undefined, file: stickerBuffer },
          contextInfo: {
            externalAdReply: {
              title: "Bot do gaabrzx",
              body: "Feito com Baileys",
            },
          },
        });
      } catch (err) {
        console.error("Erro ao processar mídia:", err);
        await sock.sendMessage(msg.key.remoteJid, {
          text: "Não consegui processar essa mídia 😔",
        });
      }
    }
  });
}

startBot().catch((err) => console.error("Erro fatal:", err));
