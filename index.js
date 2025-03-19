const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const youtubedl = require('youtube-dl-exec');
const ytSearch = require('yt-search');
const fs = require('fs');

const TOKEN = process.env.TELEGRAM_TOKEN;
const URL = process.env.BASE_URL;

const app = express();

const bot = new TelegramBot(TOKEN, { polling: false });

app.post('/bot', express.json(), (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

bot.setWebHook(`${URL}/bot`);

let searchResults = {};

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '/start') {
        bot.sendMessage(chatId, "Qo'shiq nomini yuboring, YouTube’dan qidiraman!");
    } else {
        bot.sendMessage(chatId, "Qidirilmoqda, biroz kuting...");

        try {
            console.log(`Qidirilmoqda: ${text}`);
            // YouTube qidiruv
            const results = await ytSearch(text);
            console.log("Natijalar topildi:", results);

            const videos = results.videos;

            if (videos.length === 0) {
                bot.sendMessage(chatId, "Hech narsa topilmadi.");
                return;
            }

            // Tugmalar bilan natijalarni chiqarish
            const buttons = videos.slice(0, 10).map((video, index) => {
                return [{ text: `${index + 1}. ${video.title}`, callback_data: video.videoId }];
            });

            bot.sendMessage(chatId, "Topilgan qo‘shiqlar:", {
                reply_markup: { inline_keyboard: buttons },
            });

        } catch (error) {
            console.error("Xatolik:", error);
            bot.sendMessage(chatId, "Xatolik yuz berdi: " + error.message);
        }
    }
});


bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const videoId = query.data;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`Foydalanuvchi tanladi: ${videoUrl}`);

    bot.sendMessage(chatId, `Yuklanmoqda: ${videoId} (Audio)`);

    try {
        const filePath = `/tmp/${videoId}.mp3`;
        console.log(`Audio yuklanmoqda: ${filePath}`);

        await ytdlp(videoUrl, { output: filePath, extractAudio: true, audioFormat: 'mp3' });

        await bot.sendAudio(chatId, filePath);
        console.log("Yuborildi:", filePath);

    } catch (error) {
        console.error("MP3 yuklashda xatolik:", error);
        bot.sendMessage(chatId, "Xatolik yuz berdi: " + error.message);
    }
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Server ishlayapti...');
});
