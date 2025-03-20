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

searchCache[chatId] = {
    videos,
    page: 1
};

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const currentPage = 1;
    const pageSize = 10;
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageVideos = videos.slice(start, end);

    if (text === '/start') {
        bot.sendMessage(chatId, "Qo'shiq nomini yuboring, YouTube’dan qidiraman!");
    } else {
        bot.sendMessage(chatId, "Qidirilmoqda, biroz kuting...");

        try {
            const results = await ytSearch(text);
            const videos = results.videos;

            if (videos.length === 0) {
                bot.sendMessage(chatId, "Hech narsa topilmadi.");
                return;
            }

            // Qidiruv natijalarini matn ko‘rinishda chiqarish
            let messageText = `🔍 Natijalar ${start + 1}-${Math.min(end, videos.length)} / ${videos.length} ta topildi:\n\n`;
            pageVideos.forEach((video, index) => {
                messageText += `${start + index + 1}. ${video.title} (${video.timestamp}) - ${video.views} views\n`;
            });

            // Tugmalar
            const numButtons = [];
            for (let i = 0; i < pageVideos.length; i++) {
                numButtons.push({ text: `${start + i + 1}`, callback_data: `select_${pageVideos[i].videoId}` });
            }

            const controlButtons = [
                { text: '◀️', callback_data: 'prev' },
                { text: '❌', callback_data: 'delete' },
                { text: '▶️', callback_data: 'next' }
            ];

            searchCache[chatId] = videos; // Cache natijalar

            bot.sendMessage(chatId, messageText, {
                reply_markup: {
                    inline_keyboard: [
                        numButtons.slice(0, 5),
                        numButtons.slice(5, 10),
                        controlButtons
                    ]
                }
            });

        } catch (error) {
            console.error("Xatolik:", error);
            bot.sendMessage(chatId, "Xatolik yuz berdi: " + error.message);
        }
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('select_')) {
        const videoId = data.split('_')[1];
        const videos = searchCache[chatId] || [];
        const selectedVideo = videos.find(v => v.videoId === videoId);

        if (!selectedVideo) {
            bot.sendMessage(chatId, "Video topilmadi.");
            return;
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const fileName = selectedVideo.title.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20);
        const filePath = `/tmp/${fileName}.mp3`;

        bot.sendMessage(chatId, `🎵 Yuklanmoqda: ${selectedVideo.title}`);

        try {
            await youtubedl(videoUrl, {
                output: filePath,
                extractAudio: true,
                audioFormat: 'mp3',
                cookies: './cookies.txt'
            });

            await bot.sendAudio(chatId, filePath, { title: selectedVideo.title });
            fs.unlinkSync(filePath); // Temp faylni o'chirish

        } catch (error) {
            console.error("MP3 yuklashda xatolik:", error);
            bot.sendMessage(chatId, "Xatolik yuz berdi: " + error.message);
        }
    } else if (data === 'prev' || data === 'next') {
        const cache = searchCache[chatId];
        if (!cache) return;
        const selectedVideo = cache.videos.find(v => v.videoId === videoId);

        const totalPages = Math.ceil(cache.videos.length / 10);
        if (data === 'prev' && cache.page > 1) {
            cache.page--;
        }
        if (data === 'next' && cache.page < totalPages) {
            cache.page++;
        }

        const start = (cache.page - 1) * 10;
        const end = start + 10;
        const pageVideos = cache.videos.slice(start, end);

        let messageText = `🔍 Natijalar ${start + 1}-${Math.min(end, cache.videos.length)} / ${cache.videos.length} ta topildi:\n\n`;
        pageVideos.forEach((video, index) => {
            messageText += `${start + index + 1}. ${video.title} (${video.timestamp}) - ${video.views} views\n`;
        });

        const numButtons = [];
        for (let i = 0; i < pageVideos.length; i++) {
            numButtons.push({ text: `${start + i + 1}`, callback_data: `select_${pageVideos[i].videoId}` });
        }

        const controlButtons = [
            { text: '◀️', callback_data: 'prev' },
            { text: '❌', callback_data: 'delete' },
            { text: '▶️', callback_data: 'next' }
        ];

        await bot.editMessageText(messageText, {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: {
                inline_keyboard: [
                    numButtons.slice(0, 5),
                    numButtons.slice(5, 10),
                    controlButtons
                ]
            }
        });

        await bot.answerCallbackQuery(query.id);
    } else if (data === 'delete') {
        bot.deleteMessage(chatId, query.message.message_id);
    } else {
        bot.answerCallbackQuery(query.id, { text: 'Hozircha faqat 1-10 natijalar!' });
    }
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Server ishlayapti...');
});
