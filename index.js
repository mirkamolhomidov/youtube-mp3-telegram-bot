const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const youtubedl = require('youtube-dl-exec');
const ytSearch = require('yt-search');
const fs = require('fs');

const TOKEN = process.env.TELEGRAM_TOKEN;
const URL = process.env.BASE_URL;

const app = express();
const bot = new TelegramBot(TOKEN, { polling: false });

const searchCache = {};

app.post('/bot', express.json(), (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200); // Webhook so‘roviga darhol javob
});

bot.setWebHook(`${URL}/bot`);

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '/start') {
        bot.sendMessage(chatId, "Qo'shiq nomini yuboring, YouTube’dan qidiraman!");
    } else {
        const loadingMessage = await bot.sendMessage(chatId, "🔎 Qidirilmoqda, biroz kuting...");
        try {
            const results = await ytSearch(text);
            const videos = results.videos;

            if (videos.length === 0) {
                bot.sendMessage(chatId, "Hech narsa topilmadi.");
                return;
            }

            searchCache[chatId] = {
                videos,
                page: 1
            };

            const pageSize = 10;
            const start = 0;
            const end = start + pageSize;
            const pageVideos = videos.slice(start, end);

            let messageText = `🔍 Natijalar ${start + 1}-${Math.min(end, videos.length)} / ${videos.length} ta topildi:\n\n`;
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

            await bot.sendMessage(chatId, messageText, {
                reply_markup: {
                    inline_keyboard: [
                        numButtons.slice(0, 5),
                        numButtons.slice(5, 10),
                        controlButtons
                    ]
                }
            });

            // Qidiruv tugagach yuklanmoqda xabarini o'chirish
            bot.deleteMessage(chatId, loadingMessage.message_id);

        } catch (error) {
            console.error("Xatolik:", error);
            bot.sendMessage(chatId, "Xatolik yuz berdi: " + error.message);
        }
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const cache = searchCache[chatId];

    if (!cache) {
        await bot.answerCallbackQuery(query.id, { text: "Qidiruv natijasi topilmadi." });
        return;
    }

    if (data.startsWith('select_')) {
        const videoId = data.split('_')[1];
        const selectedVideo = cache.videos.find(v => v.videoId === videoId);

        if (!selectedVideo) {
            await bot.answerCallbackQuery(query.id, { text: "Video topilmadi." });
            return;
        }

        await bot.answerCallbackQuery(query.id, { text: "🎵 Yuklanmoqda..." }); // darhol javob

        // Yuklash jarayonini fonda bajarish
        (async () => {
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const fileName = selectedVideo.title.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20);
            const filePath = `/tmp/${fileName}.mp3`;

            const loadingMsg = await bot.sendMessage(chatId, `🎵 Yuklanmoqda: ${selectedVideo.title}`);

            try {
                await youtubedl(videoUrl, {
                    output: filePath,
                    extractAudio: true,
                    audioFormat: 'mp3',
                    cookies: './cookies.txt'
                });

                // Fayl mavjudligini tekshirish va yuborish
                if (fs.existsSync(filePath)) {
                    const fileStream = fs.createReadStream(filePath);
                    await bot.sendAudio(chatId, fileStream, { title: selectedVideo.title });
                    fs.unlinkSync(filePath); // Faylni o‘chirish
                } else {
                    await bot.sendMessage(chatId, "❌ Faylni yuklashda muammo yuz berdi.");
                }

            } catch (error) {
                console.error("MP3 yuklashda xatolik:", error);
                await bot.sendMessage(chatId, "Xatolik yuz berdi: " + error.message);
            }

            // Yuklanmoqda xabarini o‘chirish
            bot.deleteMessage(chatId, loadingMsg.message_id);

        })();

    } else if (data === 'prev' || data === 'next') {
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
        await bot.deleteMessage(chatId, query.message.message_id);
        await bot.answerCallbackQuery(query.id);
    }
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Server ishlayapti...');
});
