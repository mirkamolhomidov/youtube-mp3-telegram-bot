const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { exec } = require('yt-dlp-exec');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const TOKEN = process.env.TELEGRAM_TOKEN;
const URL = process.env.BASE_URL;

const app = express();

const bot = new TelegramBot(TOKEN, { polling: false });

// Webhook endpoint
app.post('/bot', express.json(), (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Set webhook
bot.setWebHook(`${URL}/bot`);

let searchResults = {};

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Qo\'shiq nomini yuboring, YouTube’dan qidiraman!');
});

bot.on('message', async (msg) => {
    if (msg.text.startsWith('/start')) return;

    const query = encodeURIComponent(msg.text);
    const url = `https://www.youtube.com/results?search_query=${query}`;
    
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    let videos = [];

    $('a#video-title').each((i, elem) => {
        if (i < 10) {
            const title = $(elem).text().trim();
            const link = 'https://www.youtube.com' + $(elem).attr('href');
            videos.push({ title, link });
        }
    });

    searchResults[msg.chat.id] = videos;

    let buttons = videos.map((v, i) => [{ text: `${i + 1}. ${v.title}`, callback_data: `${i}` }]);

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

    exec(video.link, {
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
