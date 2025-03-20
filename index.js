const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const ytSearch = require('yt-search');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.TELEGRAM_TOKEN;
const URL = process.env.BASE_URL;
const app = express();
const bot = new TelegramBot(TOKEN, { polling: false });
const searchCache = {};

app.post('/bot', express.json(), (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

bot.setWebHook(`${URL}/bot`);

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '/start') {
        bot.sendMessage(chatId, "🎶 Qidiruv uchun qo‘shiq nomini yuboring:");
        return;
    }

    const loadingMsg = await bot.sendMessage(chatId, "🔎 Qidirilmoqda...");

    try {
        const results = await ytSearch(text);
        const videos = results.videos.slice(0, 30);

        if (videos.length === 0) {
            await bot.editMessageText("⚠️ Hech narsa topilmadi.", { chat_id: chatId, message_id: loadingMsg.message_id });
            return;
        }

        const page = 1;
        searchCache[chatId] = { videos, page };
        await showPage(chatId, videos, page, loadingMsg.message_id);

    } catch (error) {
        await bot.editMessageText("Xatolik: " + error.message, { chat_id: chatId, message_id: loadingMsg.message_id });
    }
});

async function showPage(chatId, videos, page, messageId) {
    const pageSize = 10;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageVideos = videos.slice(start, end);

    let text = `🔍 Natijalar ${start + 1}-${Math.min(end, videos.length)} / ${videos.length}:\n\n`;
    pageVideos.forEach((v, i) => {
        text += `${start + i + 1}. ${v.title} (${v.timestamp})\n`;
    });

    const buttons = [];
    for (let i = 0; i < pageVideos.length; i++) {
        buttons.push({ text: `${start + i + 1}`, callback_data: `select_${pageVideos[i].videoId}` });
    }

    const controlButtons = [
        { text: '◀️', callback_data: 'prev' },
        { text: '❌', callback_data: 'delete' },
        { text: '▶️', callback_data: 'next' }
    ];

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
            inline_keyboard: [
                buttons.slice(0, 5),
                buttons.slice(5, 10),
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
        const video = cache.videos.find(v => v.videoId === videoId);
        if (!video) {
            bot.sendMessage(chatId, "Video topilmadi.");
            return;
        }

        const downloadingMsg = await bot.sendMessage(chatId, `🎵 Yuklanmoqda: ${video.title}`);
        const tempMp4 = path.resolve(__dirname, `${videoId}.mp4`);
        const outputMp3 = path.resolve(__dirname, `${videoId}.mp3`);

        try {
            // MP4 faylga yuklash
            const stream = ytdl(video.url, { filter: 'audioonly' });
            const fileWriteStream = fs.createWriteStream(tempMp4);
            stream.pipe(fileWriteStream);

            fileWriteStream.on('finish', () => {
                // MP3 ga aylantirish
                ffmpeg(tempMp4)
                    .audioBitrate(128)
                    .save(outputMp3)
                    .on('end', async () => {
                        await bot.sendAudio(chatId, outputMp3, { title: video.title });
                        fs.unlinkSync(tempMp4);
                        fs.unlinkSync(outputMp3);
                        await bot.deleteMessage(chatId, downloadingMsg.message_id);
                    })
                    .on('error', async (err) => {
                        console.error(err);
                        await bot.sendMessage(chatId, "Xatolik: Aylantirishda muammo.");
                        await bot.deleteMessage(chatId, downloadingMsg.message_id);
                    });
            });

            stream.on('error', async (err) => {
                console.error(err);
                await bot.sendMessage(chatId, "Xatolik: Yuklab olishda muammo.");
                await bot.deleteMessage(chatId, downloadingMsg.message_id);
            });

        } catch (err) {
            console.error(err);
            await bot.sendMessage(chatId, "Xatolik yuz berdi: " + err.message);
            await bot.deleteMessage(chatId, downloadingMsg.message_id);
        }

    } else if (data === 'prev' || data === 'next') {
        const totalPages = Math.ceil(cache.videos.length / 10);
        if (data === 'prev' && cache.page > 1) cache.page--;
        if (data === 'next' && cache.page < totalPages) cache.page++;
        await showPage(chatId, cache.videos, cache.page, query.message.message_id);
        await bot.answerCallbackQuery(query.id);

    } else if (data === 'delete') {
        await bot.deleteMessage(chatId, query.message.message_id);
    }
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Server ishga tushdi...');
});
