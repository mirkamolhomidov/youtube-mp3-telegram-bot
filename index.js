const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

// O'zgartiriladigan sozlamalar
const TOKEN = process.env.TELEGRAM_TOKEN;
const URL = process.env.BASE_URL;
const PORT = process.env.PORT || 3000;

const app = express();
const bot = new TelegramBot(TOKEN, { polling: false });

app.use(express.json());
app.post('/bot', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

bot.setWebHook(`${URL}/bot`);

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '/start') {
        bot.sendMessage(chatId, "Qo'shiq nomini yoki YouTube havolasini yuboring, men uni topib, MP3 formatida yuboraman.");
    } else {
        const searchMessage = await bot.sendMessage(chatId, "🔎 Qidirilmoqda...");

        try {
            let videoUrl;

            // Agar foydalanuvchi to'g'ridan-to'g'ri YouTube havolasini yuborgan bo'lsa
            if (ytdl.validateURL(text)) {
                videoUrl = text;
            } else {
                // YouTube'da qidirish
                const searchResults = await ytdl.search(text, { limit: 1 });
                if (searchResults.length === 0) {
                    await bot.editMessageText("Hech narsa topilmadi.", { chat_id: chatId, message_id: searchMessage.message_id });
                    return;
                }
                videoUrl = `https://www.youtube.com/watch?v=${searchResults[0].id}`;
            }

            const info = await ytdl.getInfo(videoUrl);
            const title = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20);
            const filePath = path.join(__dirname, `${title}.mp3`);

            await bot.editMessageText(`🎵 Yuklanmoqda: ${info.videoDetails.title}`, { chat_id: chatId, message_id: searchMessage.message_id });

            const audioStream = ytdl(videoUrl, { quality: 'highestaudio' });
            const ffmpegProcess = ffmpeg(audioStream)
                .audioBitrate(128)
                .save(filePath)
                .on('end', async () => {
                    await bot.sendAudio(chatId, filePath, { title: info.videoDetails.title });
                    fs.unlinkSync(filePath); // Vaqtinchalik faylni o'chirish
                    await bot.deleteMessage(chatId, searchMessage.message_id); // Yuklanmoqda xabarini o'chirish
                })
                .on('error', async (error) => {
                    console.error("MP3 yuklashda xatolik:", error);
                    await bot.editMessageText("Xatolik yuz berdi: " + error.message, { chat_id: chatId, message_id: searchMessage.message_id });
                });

        } catch (error) {
            console.error("Xatolik:", error);
            await bot.editMessageText("Xatolik yuz berdi: " + error.message, { chat_id: chatId, message_id: searchMessage.message_id });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server ${PORT}-portda ishlamoqda...`);
});
