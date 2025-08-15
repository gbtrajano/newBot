// ======== IMPORTAÇÕES ========
import baileys from "@whiskeysockets/baileys";
import Pino from "pino";
import express from "express";
import sharp from "sharp";

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} = baileys;

// ======== SERVIDOR HTTP ========
// Apenas para manter vivo no host (Render, Railway, etc.)
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("Bot de figurinhas rodando ✅"));
app.listen(PORT, () => console.log(`HTTP ok na porta ${PORT}`));

// ======== BOT WHATSAPP ========
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: Pino({ level: "silent" }),
  });

  // Salvar credenciais ao atualizar
  sock.ev.on("creds.update", saveCreds);

  // Evento de conexão + exibição de QR
  sock.ev.on("connection.update", ({ qr, connection, lastDisconnect }) => {
    if (qr) {
      console.log("📲 Escaneie este QR Code (gere visualmente se necessário):");
      console.log(qr); // copiar e colar num site de QR ou app gerador
    }
    console.log(
      "Conexão:",
      connection || "",
      lastDisconnect?.error?.message || ""
    );
  });

  // Evento de novas mensagens
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages?.[0];
    if (!msg?.message || msg.key.fromMe) return;

    const tipo = Object.keys(msg.message)[0];

    // Verifica se é imagem ou vídeo para figurinha
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
          // Redimensiona para 512x512 e converte para WebP
          stickerBuffer = await sharp(buffer)
            .resize(512, 512)
            .webp()
            .toBuffer();
        } else {
          // Para vídeo, envia direto (Baileys cuida da conversão)
          stickerBuffer = buffer;
        }

        await sock.sendMessage(msg.key.remoteJid, {
          sticker: stickerBuffer,
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
