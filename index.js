const TelegramBot = require('node-telegram-bot-api')
const youtubedl = require('youtube-dl-exec')
const ytSearch = require('yt-search')
const fs = require('fs')
const path = require('path')
require('dotenv').config()

const TOKEN = process.env.TELEGRAM_TOKEN
if (!TOKEN) {
  console.error('TELEGRAM_TOKEN topilmadi!')
  process.exit(1)
}

const bot = new TelegramBot(TOKEN, { polling: true })

const searchCache = {}
const userStates = {}

bot.on('message', async msg => {
  const chatId = msg.chat.id
  const text = msg.text

  if (!text) return

  if (text === '/start') {
    await bot.sendMessage(
      chatId,
      "Qo'shiq nomini yuboring, YouTube’dan qidiraman!"
    )
    return
  }

  const loadingMessage = await bot.sendMessage(
    chatId,
    '🔎 Qidirilmoqda, biroz kuting...'
  )

  try {
    const results = await ytSearch(text)
    const videos = results.videos
    if (videos.length === 0) {
      await bot.sendMessage(chatId, 'Hech narsa topilmadi.')
      await bot.deleteMessage(chatId, loadingMessage.message_id)
      return
    }

    searchCache[chatId] = {
      videos,
      page: 1,
    }

    const sendResults = (page = 1) => {
      const pageSize = 10
      const start = (page - 1) * pageSize
      const end = start + pageSize
      const pageVideos = videos.slice(start, end)

      let messageText = `🔍 Natijalar ${start + 1}-${Math.min(
        end,
        videos.length
      )} / ${videos.length} ta topildi:\n\n`
      pageVideos.forEach((video, index) => {
        messageText += `${start + index + 1}. ${video.title} (${
          video.timestamp
        }) - ${video.views} views\n`
      })

      const numButtons = []
      for (let i = 0; i < pageVideos.length; i++) {
        numButtons.push({
          text: `${start + i + 1}`,
          callback_data: `select_${pageVideos[i].videoId}`,
        })
      }

      const controlButtons = [
        { text: '◀️', callback_data: 'prev' },
        { text: '❌', callback_data: 'delete' },
        { text: '▶️', callback_data: 'next' },
      ]

      bot.sendMessage(chatId, messageText, {
        reply_markup: {
          inline_keyboard: [
            numButtons.slice(0, 5),
            numButtons.slice(5, 10),
            controlButtons,
          ],
        },
      })

      userStates[chatId] = {
        messageText,
        replyMarkup: [
          numButtons.slice(0, 5),
          numButtons.slice(5, 10),
          controlButtons,
        ],
      }
    }

    sendResults(1)
    await bot.deleteMessage(chatId, loadingMessage.message_id)
  } catch (err) {
    console.error('Qidiruvda xatolik:', err)
    await bot.sendMessage(chatId, 'Xatolik yuz berdi: ' + err.message)
    await bot.deleteMessage(chatId, loadingMessage.message_id)
  }
})

bot.on('callback_query', async query => {
  const chatId = query.message.chat.id
  const data = query.data
  const cache = searchCache[chatId]

  if (!cache) {
    await bot.answerCallbackQuery(query.id, {
      text: 'Qidiruv natijasi topilmadi.',
      show_alert: true,
    })
    return
  }

  if (data.startsWith('select_')) {
    await bot.answerCallbackQuery(query.id, { text: '🎵 Yuklanmoqda...' })

    const videoId = data.split('_')[1]
    const selectedVideo = cache.videos.find(v => v.videoId === videoId)

    if (!selectedVideo) {
      await bot.sendMessage(chatId, 'Video topilmadi.')
      return
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
    const safeTitle = selectedVideo.title
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .substring(0, 20)
    const filePath = path.join(
      __dirname,
      'tmp',
      `${safeTitle}_${Date.now()}.mp3`
    )

    if (!fs.existsSync(path.join(__dirname, 'tmp'))) {
      fs.mkdirSync(path.join(__dirname, 'tmp'))
    }

    const loadingMsg = await bot.sendMessage(
      chatId,
      `🎵 Yuklanmoqda: ${selectedVideo.title}`
    )

    try {
      await youtubedl(videoUrl, {
        output: filePath,
        extractAudio: true,
        audioFormat: 'mp3',
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
      })

      if (fs.existsSync(filePath)) {
        await bot.sendAudio(chatId, fs.createReadStream(filePath), {
          title: selectedVideo.title,
        })

        fs.unlink(filePath, err => {
          if (err) console.error('Faylni o‘chirishda xato:', err)
        })
      } else {
        await bot.sendMessage(chatId, '❌ Faylni yuklashda muammo yuz berdi.')
      }
    } catch (error) {
      console.error('MP3 yuklashda xatolik:', error)
      await bot.sendMessage(chatId, 'Xatolik: ' + error.message)
    }

    await bot.deleteMessage(chatId, loadingMsg.message_id)
  } else if (data === 'prev' || data === 'next') {
    await bot.answerCallbackQuery(query.id)

    const totalPages = Math.ceil(cache.videos.length / 10)
    if (data === 'prev' && cache.page > 1) cache.page--
    if (data === 'next' && cache.page < totalPages) cache.page++

    const pageSize = 10
    const start = (cache.page - 1) * pageSize
    const end = start + pageSize
    const pageVideos = cache.videos.slice(start, end)

    let messageText = `🔍 Natijalar ${start + 1}-${Math.min(
      end,
      cache.videos.length
    )} / ${cache.videos.length} ta topildi:\n\n`
    pageVideos.forEach((video, index) => {
      messageText += `${start + index + 1}. ${video.title} (${
        video.timestamp
      }) - ${video.views} views\n`
    })

    const numButtons = []
    for (let i = 0; i < pageVideos.length; i++) {
      numButtons.push({
        text: `${start + i + 1}`,
        callback_data: `select_${pageVideos[i].videoId}`,
      })
    }

    const controlButtons = [
      { text: '◀️', callback_data: 'prev' },
      { text: '❌', callback_data: 'delete' },
      { text: '▶️', callback_data: 'next' },
    ]

    try {
      await bot.editMessageText(messageText, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            numButtons.slice(0, 5),
            numButtons.slice(5, 10),
            controlButtons,
          ],
        },
      })
    } catch (err) {
      console.error('Edit xatolik:', err)
    }
  } else if (data === 'delete') {
    try {
      await bot.deleteMessage(chatId, query.message.message_id)
    } catch (err) {
      console.error('Delete xatolik:', err)
    }
    await bot.answerCallbackQuery(query.id)
  }
})
