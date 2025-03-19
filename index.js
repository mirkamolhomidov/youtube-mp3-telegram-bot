const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { exec } = require('yt-dlp-exec');
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

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Qo\'shiq nomini yuboring, YouTube’dan qidiraman!');
});

bot.on('message', async (msg) => {
    if (msg.text.startsWith('/start')) return;

    const result = await ytSearch(msg.text);
    const videos = result.videos.slice(0, 10);

    if (videos.length === 0) {
        return bot.sendMessage(msg.chat.id, 'Hech narsa topilmadi.');
    }

    searchResults[msg.chat.id] = videos;

    let buttons = videos.map((v, i) => [{
        text: `${i + 1}. ${v.title.substring(0, 30)}`, callback_data: `${i}`
    }]);

    bot.sendMessage(msg.chat.id, 'Topilgan qo‘shiqlar:', {
        reply_markup: {
            inline_keyboard: buttons
        }
    });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const index = parseInt(query.data);
    const video = searchResults[chatId][index];

    bot.sendMessage(chatId, `Yuklanmoqda: ${video.title}`);

    const fileName = `${chatId}_${Date.now()}.mp3`;

    exec(video.url, {
        output: fileName,
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: 0
    }).then(() => {
        bot.sendAudio(chatId, fs.createReadStream(fileName)).then(() => {
            fs.unlinkSync(fileName);
        });
    }).catch((err) => {
        bot.sendMessage(chatId, 'Xatolik yuz berdi.');
        console.error(err);
    });
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Server ishlayapti...');
});
