const TelegramBot = require('node-telegram-bot-api');
const ytSearch = require('yt-search');

const token = 'BOT_TOKEN'; // BOT TOKENINGIZ
const bot = new TelegramBot(token, { polling: true });

let searchCache = {};

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, '🎶 YouTube → MP3 botga xush kelibsiz!\nQidiruv uchun musiqa nomini yuboring.');
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const query = msg.text;

    if (query.startsWith('/')) return; // Komandalarni o'tkazib yuborish

    const searchingMsg = await bot.sendMessage(chatId, "🔍 Qidirilmoqda...");

    try {
        const results = await ytSearch(query);
        const videos = results.videos.slice(0, 20);

        if (videos.length === 0) {
            await bot.editMessageText("Hech narsa topilmadi.", { chat_id: chatId, message_id: searchingMsg.message_id });
            return;
        }

        searchCache[chatId] = { videos, page: 1 };
        await showPage(chatId, videos, 1, searchingMsg.message_id);
    } catch (err) {
        console.error(err);
        await bot.editMessageText("Xatolik yuz berdi.", { chat_id: chatId, message_id: searchingMsg.message_id });
    }
});

async function showPage(chatId, videos, page, messageId) {
    const start = (page - 1) * 10;
    const end = start + 10;
    const pageVideos = videos.slice(start, end);

    let message = `🔍 Natijalar ${start + 1}-${Math.min(end, videos.length)} / ${videos.length}:\n\n`;

    pageVideos.forEach((video, index) => {
        message += `${index + 1}. ${video.title} (${video.timestamp})\n`;
    });

    const buttons = pageVideos.map((video, index) => ([{
        text: (index + 1).toString(),
        callback_data: `select_${video.videoId}`
    }]));

    const navButtons = [];
    if (page > 1) navButtons.push({ text: '◀️', callback_data: 'prev' });
    navButtons.push({ text: '❌', callback_data: 'delete' });
    if (end < videos.length) navButtons.push({ text: '▶️', callback_data: 'next' });

    buttons.push(navButtons);

    await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: buttons }
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

        try {
            // MP3 API dan link
            const mp3Url = `https://youtube-mp3-download.api-sound.xyz/api/button/mp3/${videoId}`;

            // Foydalanuvchiga link yuborish
            await bot.sendMessage(chatId, `🎶 <b>${video.title}</b>\n<a href="${mp3Url}">🔗 Yuklash</a>`, { parse_mode: "HTML" });

            await bot.deleteMessage(chatId, downloadingMsg.message_id);
        } catch (err) {
            console.error(err);
            await bot.sendMessage(chatId, "Xatolik yuz berdi.");
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
