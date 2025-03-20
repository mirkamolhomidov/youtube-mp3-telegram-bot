require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const ytSearch = require('yt-search');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { PassThrough } = require('stream');

ffmpeg.setFfmpegPath(ffmpegPath);

const TOKEN = process.env.TELEGRAM_TOKEN;
const URL = process.env.BASE_URL;
const PORT = process.env.PORT || 3000;

const app = express();
const bot = new TelegramBot(TOKEN, { polling: false });

bot.setWebHook(`${URL}/bot${TOKEN}`);

app.use(express.json());
app.post(`/bot${TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

const searchCache = {};

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '/start') {
        return bot.sendMessage(chatId, "Qo'shiq nomini yuboring, YouTube’dan qidiraman!");
    }

    bot.sendMessage(chatId, "🔎 Qidirilmoqda...");

    try {
        const results = await ytSearch(text);
        const videos = results.videos.slice(0, 20);
        if (!videos.length) return bot.sendMessage(chatId, "Hech narsa topilmadi.");

        searchCache[chatId] = { videos, page: 1 };

        await sendPage(chatId, 1);
    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "Xatolik yuz berdi.");
    }
});

async function sendPage(chatId, page) {
    const cache = searchCache[chatId];
    if (!cache) return;

    const pageSize = 10;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageVideos = cache.videos.slice(start, end);

    let message = `🔍 Natijalar ${start + 1}-${Math.min(end, cache.videos.length)}:\n\n`;
    pageVideos.forEach((v, i) => {
        message += `${start + i + 1}. ${v.title} (${v.timestamp})\n`;
    });

    const numButtons = pageVideos.map((v, i) => ({
        text: `${start + i + 1}`,
        callback_data: `select_${v.videoId}`
    }));

    const controlButtons = [];
    if (page > 1) {
        controlButtons.push({ text: '◀️ Oldingi', callback_data: 'prev' });
    }
    if (end < cache.videos.length) {
        controlButtons.push({ text: 'Keyingi ▶️', callback_data: 'next' });
    }
    controlButtons.push({ text: '❌', callback_data: 'delete' });

    await bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                numButtons.slice(0, 5),
                numButtons.slice(5, 10),
                controlButtons
            ]
        }
    });
}

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const cache = searchCache[chatId];

    if (!cache) return;

    if (data.startsWith('select_')) {
        const videoId = data.split('_')[1];
        const selected = cache.videos.find(v => v.videoId === videoId);
        if (!selected) return bot.sendMessage(chatId, "Video topilmadi.");

        const loadingMsg = await bot.sendMessage(chatId, `🎵 Yuklanmoqda: ${selected.title}`);

        try {
            const stream = new PassThrough();
            ffmpeg(`https://www.youtube.com/watch?v=${videoId}`)
                .format('mp3')
                .audioBitrate(128)
                .on('error', (err) => {
                    console.error('FFMPEG Error:', err);
                    bot.sendMessage(chatId, "Audio konvertatsiya qilishda xatolik yuz berdi.");
                })
                .pipe(stream);

            await bot.sendAudio(chatId, stream, { title: selected.title });

            bot.deleteMessage(chatId, loadingMsg.message_id);
        } catch (e) {
            console.error(e);
            bot.sendMessage(chatId, "Xatolik: " + e.message);
        }
    } else if (data === 'prev' || data === 'next') {
        if (data === 'prev' && cache.page > 1) cache.page--;
        if (data === 'next' && cache.page < Math.ceil(cache.videos.length / 10)) cache.page++;
        await bot.editMessageText('⏳', {
            chat_id: chatId,
            message_id: query.message.message_id
        });
        await sendPage(chatId, cache.page);
    } else if (data === 'delete') {
        await bot.deleteMessage(chatId, query.message.message_id);
    }

    bot.answerCallbackQuery(query.id);
});

app.listen(PORT, () => {
    console.log(`Bot ishga tushdi: ${URL}`);
});
