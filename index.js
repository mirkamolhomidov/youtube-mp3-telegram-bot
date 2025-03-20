import express from "express";
import { Telegraf, Markup } from "telegraf";
import ytSearch from "yt-search";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import ytdl from "ytdl-core";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Webhook sozlamasi
app.use(express.json());
app.post(`/${bot.secretPathComponent()}`, (req, res) => {
    bot.handleUpdate(req.body);
    res.status(200).send("OK");
});

const BASE_URL = process.env.BASE_URL;
const PAGE_SIZE = 10;
const userSessions = new Map();

// Webhook server ishga tushirish
app.listen(3000, async () => {
    console.log("Webhook server running on port 3000");
    await bot.telegram.setWebhook(`${BASE_URL}/${bot.secretPathComponent()}`);
});

// Start komandasi
bot.start((ctx) => {
    ctx.reply("🎵 YouTube MP3 botiga xush kelibsiz!\nQo'shiq nomini yuboring:");
});

// Qidiruv funksiyasi
bot.on("text", async (ctx) => {
    const query = ctx.message.text;
    const searchMessage = await ctx.reply("🔍 Qidirilmoqda...");
    const results = await ytSearch(query);

    if (!results.videos.length) {
        ctx.reply("Hech narsa topilmadi.");
        return;
    }

    const videos = results.videos.slice(0, 50); // 50 ta natija
    const pages = Math.ceil(videos.length / PAGE_SIZE);

    // Foydalanuvchi sessiyasini saqlash
    userSessions.set(ctx.from.id, {
        videos,
        currentPage: 1,
        searchMessageId: searchMessage.message_id,
    });

    sendResultsPage(ctx, 1);
});

// Qidiruv natijalarini sahifalash
async function sendResultsPage(ctx, page) {
    const session = userSessions.get(ctx.from.id);
    if (!session) return;

    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const videoButtons = session.videos.slice(start, end).map((video, index) =>
        [Markup.button.callback(`${start + index + 1}. ${video.title.slice(0, 25)}`, `audio_${start + index}`)]
    );

    const navButtons = [];
    if (page > 1) navButtons.push(Markup.button.callback("◀️ Oldingi", "prev"));
    navButtons.push(Markup.button.callback("❌ Bekor qilish", "cancel"));
    if (end < session.videos.length) navButtons.push(Markup.button.callback("▶️ Keyingi", "next"));

    await ctx.reply(`Natijalar (Sahifa ${page}):`, Markup.inlineKeyboard([...videoButtons, navButtons]));
}

// Callback tugmalar
bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const session = userSessions.get(ctx.from.id);
    if (!session) return ctx.answerCbQuery();

    if (data.startsWith("audio_")) {
        const index = parseInt(data.split("_")[1]);
        const video = session.videos[index];

        await ctx.answerCbQuery("Yuklanmoqda...");

        const downloadingMessage = await ctx.reply(`🎵 Yuklanmoqda: ${video.title}`);

        const stream = ytdl(video.url, { filter: "audioonly", quality: "highestaudio" });
        const filePath = `audio_${ctx.from.id}.mp3`;

        ffmpeg(stream)
            .setFfmpegPath(ffmpegPath)
            .audioBitrate(128)
            .save(filePath)
            .on("end", async () => {
                await ctx.replyWithAudio(
                    { source: fs.createReadStream(filePath) },
                    { title: video.title }
                );
                fs.unlinkSync(filePath);
                await ctx.deleteMessage(downloadingMessage.message_id);
                await ctx.deleteMessage(session.searchMessageId);
                userSessions.delete(ctx.from.id);
            })
            .on("error", async (err) => {
                console.error(err);
                await ctx.reply("Xatolik yuz berdi.");
            });
    } else if (data === "next") {
        session.currentPage++;
        await sendResultsPage(ctx, session.currentPage);
        ctx.answerCbQuery();
    } else if (data === "prev") {
        session.currentPage--;
        await sendResultsPage(ctx, session.currentPage);
        ctx.answerCbQuery();
    } else if (data === "cancel") {
        await ctx.deleteMessage();
        await ctx.answerCbQuery("Bekor qilindi.");
        userSessions.delete(ctx.from.id);
    }
});
