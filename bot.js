const { Bot, Keyboard, InlineKeyboard, session } = require('grammy');
const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

// Создаем экземпляр бота
const bot = new Bot(process.env.BOT_TOKEN);

// ID администратора из переменных окружения
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

// Конфигурация JSONBin
const JSONBIN_ID = process.env.JSONBIN_ID;
const JSONBIN_KEY = process.env.JSONBIN_KEY;

// Проверка, что ID загрузился
if (!ADMIN_ID) {
    console.warn('⚠️ ВНИМАНИЕ: ADMIN_ID не указан в .env! Админ-панель будет недоступна.');
}

if (!JSONBIN_ID || !JSONBIN_KEY) {
    console.warn('⚠️ ВНИМАНИЕ: JSONBIN_ID или JSONBIN_KEY не указаны! Посты не будут сохраняться.');
}

// Middleware для логирования
bot.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`${ctx.update.update_id} - обработка заняла ${ms}ms`);
});

// Сессия для хранения временных данных
bot.use(session({ initial: () => ({}) }));

// Явная инициализация бота
bot.init().then(() => {
    console.log('✅ Бот инициализирован, botInfo получен');
}).catch(err => {
    console.error('❌ Ошибка инициализации бота:', err);
});

// === РАБОТА С JSONBIN ===
const LOCAL_DATA_FILE = path.join(__dirname, 'data-backup.json');

// Функция загрузки из JSONBin
async function loadFromJSONBin() {
    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
            headers: { 'X-Access-Key': JSONBIN_KEY }
        });
        
        if (!response.ok) {
            throw new Error(`JSONBin error: ${response.status}`);
        }
        
        const data = await response.json();
        return data.record;
    } catch (error) {
        console.error('❌ Ошибка загрузки из JSONBin:', error);
        
        // Пробуем загрузить из локального бэкапа
        try {
            const localData = await fs.readFile(LOCAL_DATA_FILE, 'utf8');
            return JSON.parse(localData);
        } catch (localError) {
            console.log('📁 Локальный бэкап не найден, создаем новый');
            return { posts: [], reviews: [] };
        }
    }
}

// Функция сохранения в JSONBin
async function saveToJSONBin(data) {
    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Access-Key': JSONBIN_KEY
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            // Сохраняем локальную копию
            await fs.writeFile(LOCAL_DATA_FILE, JSON.stringify(data, null, 2));
            console.log('✅ Данные сохранены в JSONBin и локально');
            return true;
        } else {
            console.error('❌ JSONBin ошибка:', response.status);
            return false;
        }
    } catch (error) {
        console.error('❌ Ошибка сохранения в JSONBin:', error);
        return false;
    }
}

// === ПРОВЕРКА НА АДМИНА ===
function isAdmin(ctx) {
    return ADMIN_ID && ctx.from?.id === ADMIN_ID;
}

// === АДМИН-ПАНЕЛЬ ===

// Команда /admin - панель управления
bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx)) {
        await ctx.reply('⛔ Доступ запрещен');
        return;
    }
    
    const keyboard = new InlineKeyboard()
        .text('📝 Новый пост', 'admin_new_post')
        .row()
        .text('📋 Мои посты', 'admin_list_posts')
        .row()
        .text('💬 Отзывы', 'admin_reviews')
        .row()
        .text('🗑️ Удалить пост', 'admin_delete_post')
        .row()
        .text('🔄 Синхр. с JSONBin', 'admin_sync');
    
    await ctx.reply('🔧 Админ-панель', { reply_markup: keyboard });
});

// Обработка админ-кнопок
bot.callbackQuery(/admin_.+/, async (ctx) => {
    if (!isAdmin(ctx)) {
        await ctx.answerCallbackQuery('⛔ Доступ запрещен');
        return;
    }
    
    const action = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();
    
    if (action === 'admin_new_post') {
        await ctx.reply('📝 Отправь мне текст нового поста:');
        ctx.session.awaitingPost = true;
    }
    
    else if (action === 'admin_list_posts') {
        try {
            const data = await loadFromJSONBin();
            
            if (!data.posts || data.posts.length === 0) {
                await ctx.reply('📭 Нет сохраненных постов');
            } else {
                let msg = '📋 *Твои посты:*\n\n';
                data.posts.slice(0, 5).forEach((post, i) => {
                    msg += `${i+1}. ID: \`${post.id}\`\n   ${post.text.substring(0, 50)}...\n`;
                });
                await ctx.reply(msg, { parse_mode: 'Markdown' });
            }
        } catch (e) {
            await ctx.reply('❌ Ошибка загрузки постов');
        }
    }
    
    else if (action === 'admin_reviews') {
        try {
            const data = await loadFromJSONBin();
            
            if (!data.reviews || data.reviews.length === 0) {
                await ctx.reply('📭 Нет отзывов');
            } else {
                let msg = '💬 *Последние отзывы:*\n\n';
                data.reviews.slice(0, 5).forEach((review, i) => {
                    msg += `${i+1}. *${review.author.name}*: ${review.text.substring(0, 100)}...\n`;
                });
                await ctx.reply(msg, { parse_mode: 'Markdown' });
            }
        } catch (e) {
            await ctx.reply('❌ Ошибка загрузки отзывов');
        }
    }
    
    else if (action === 'admin_delete_post') {
        await ctx.reply('🗑️ Введи ID поста для удаления:');
        ctx.session.awaitingDeletePost = true;
    }
    
    else if (action === 'admin_sync') {
        await ctx.reply('🔄 Синхронизация...');
        try {
            const data = await loadFromJSONBin();
            await ctx.reply(`✅ Данные загружены: ${data.posts?.length || 0} постов, ${data.reviews?.length || 0} отзывов`);
        } catch (e) {
            await ctx.reply('❌ Ошибка синхронизации');
        }
    }
});

// Команда /start
bot.command('start', async (ctx) => {
    const firstName = ctx.from.first_name || 'друг';
    
    const keyboard = new InlineKeyboard()
        .text('👤 Обо мне', 'about')
        .row()
        .text('🛠 Навыки', 'skills')
        .row()
        .text('📸 Портфолио', 'portfolio')
        .row()
        .text('📞 Контакты', 'contacts')
        .row()
        .text('🚀 Открыть Mini App', 'open_miniapp');
    
    await ctx.reply(
        `👋 Привет, ${firstName}!\n\n` +
        `Я — Стефан Будимир, и это мой персональный бот-визитка.\n` +
        `Выбери раздел ниже или открой мини-приложение:`,
        { reply_markup: keyboard }
    );
});

// Обработка callback-запросов
bot.callbackQuery('about', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const aboutText = 
        `👤 *Стефан Будимир*\n\n` +
        `Привет! Я — молодой инженер.\n` +
        `Занимаюсь развитием интересных проектов уже 7 лет.\n\n` +
        `✨ *Немного обо мне:*\n` +
        `• Живу в Москве\n` +
        `• Люблю развивать разные проекты\n` +
        `• Мотивирует общение с людьми и хорошая физическая активность\n` +
        `• Ценности: традиционные\n\n` +
        `Я верю, что однажды женюсь. Всегда открыт к новым знакомствам и интересным проектам!`;
    
    const backKeyboard = new InlineKeyboard().text('« Назад', 'back_to_main');
    
    await ctx.editMessageText(aboutText, {
        parse_mode: 'Markdown',
        reply_markup: backKeyboard
    });
});

bot.callbackQuery('skills', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const skillsText = 
        `🛠 *Мои навыки и компетенции*\n\n` +
        `*Основные направления:*\n` +
        `• Коммуникация — ⭐⭐⭐⭐⭐ (21 год)\n` +
        `• Программирование — ⭐⭐⭐⭐ (7 лет)\n` +
        `• Жим лежа — ⭐⭐⭐⭐⭐ (70 кг)\n\n` +
        `*Дополнительно:*\n` +
        `• Радиотехника\n` +
        `• Фортепиано\n` +
        `• Монгольское горловое пение\n\n` +
        `*Языки:*\n` +
        `• Русский — родной\n` +
        `• Английский — B2\n` +
        `• Немецкий — Ich bin Stefan`;
    
    const backKeyboard = new InlineKeyboard().text('« Назад', 'back_to_main');
    
    await ctx.editMessageText(skillsText, {
        parse_mode: 'Markdown',
        reply_markup: backKeyboard
    });
});

bot.callbackQuery('portfolio', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const portfolioText = 
        `📸 *Мои проекты и работы*\n\n` +
        `*Проект 1:* Support Bot\n` +
        `Телеграм-бот, с функцией крипто-переводов, на базе TON-Connect\n` +
        `🔗 @baldezhniki_support_bot\n\n` +
        `*Проект 2:* [Название]\n` +
        `ожидайте.\n` +
        `🔗 [Ссылка]\n\n` +
        `*Проект 3:* [Название]\n` +
        `ожидайте.\n` +
        `🔗 [Ссылка]\n\n` +
        `Больше работ можно увидеть в моем мини-приложении 👇`;
    
    const keyboard = new InlineKeyboard()
        .text('« Назад', 'back_to_main')
        .row()
        .text('🚀 Открыть Mini App', 'open_miniapp');
    
    await ctx.editMessageText(portfolioText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
});

bot.callbackQuery('contacts', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const contactsText = 
        `📞 *Мои контакты*\n\n` +
        `📧 Email: [secret]\n` +
        `💼 LinkedIn: [secret]\n` +
        `🐙 GitHub: [super_secret]\n` +
        `📱 Telegram: @stefan_budimir_bot\n` +
        `🌐 Сайт: [netu]\n\n` +
        `📲 *Соцсети:*\n` +
        `• Instagram: https://www.instagram.com/mc_budi_top?igsh=b2w1ZXltdG1iaW40\n` +
        `• Twitter: [ссылка]\n` +
        `• Facebook: [ссылка]\n\n` +
        `Всегда на связи! Буду рад новым знакомствам и предложениям ✨`;
    
    const backKeyboard = new InlineKeyboard()
        .text('« Назад', 'back_to_main')
        .row()
        .text('📱 Поделиться контактом', 'share_contact');
    
    await ctx.editMessageText(contactsText, {
        parse_mode: 'Markdown',
        reply_markup: backKeyboard
    });
});

bot.callbackQuery('open_miniapp', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const miniAppUrl = 'https://stefan-budimir-miniapp.vercel.app';
    
    const keyboard = new InlineKeyboard().url('🚀 Открыть Mini App', miniAppUrl);
    
    await ctx.reply(
        'Нажми кнопку ниже, чтобы открыть мое мини-приложение:',
        { reply_markup: keyboard }
    );
});

bot.callbackQuery('share_contact', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const contactKeyboard = new Keyboard()
        .requestContact('📱 Отправить мой контакт')
        .resized();
    
    await ctx.reply(
        'Нажми кнопку ниже, чтобы поделиться своим контактом:',
        { reply_markup: { keyboard: contactKeyboard, one_time_keyboard: true, resize_keyboard: true } }
    );
});

bot.callbackQuery('back_to_main', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const keyboard = new InlineKeyboard()
        .text('👤 Обо мне', 'about')
        .row()
        .text('🛠 Навыки', 'skills')
        .row()
        .text('📸 Портфолио', 'portfolio')
        .row()
        .text('📞 Контакты', 'contacts')
        .row()
        .text('🚀 Открыть Mini App', 'open_miniapp');
    
    await ctx.editMessageText(
        'Главное меню. Выбери раздел:',
        { reply_markup: keyboard }
    );
});

// Обработка текстовых сообщений
bot.on('message:text', async (ctx) => {
    // Сначала проверяем админские сессии
    if (isAdmin(ctx)) {
        if (ctx.session.awaitingPost) {
            ctx.session.awaitingPost = false;
            
            const newPost = {
                id: Date.now(),
                author: {
                    id: ADMIN_ID,
                    name: 'Стефан Будимир',
                    username: 'stefan_budimir'
                },
                date: new Date().toISOString(),
                text: ctx.message.text,
                likes: 0,
                likedBy: [],
                comments: []
            };
            
            // Загружаем текущие данные из JSONBin
            const currentData = await loadFromJSONBin();
            
            // Добавляем новый пост
            if (!currentData.posts) currentData.posts = [];
            currentData.posts.unshift(newPost);
            
            // Сохраняем обратно в JSONBin
            if (await saveToJSONBin(currentData)) {
                await ctx.reply(`✅ Пост сохранен в JSONBin!\n\nID: \`${newPost.id}\``, { parse_mode: 'Markdown' });
            } else {
                await ctx.reply('❌ Ошибка сохранения в JSONBin');
            }
            return;
        }
        
        if (ctx.session.awaitingDeletePost) {
            ctx.session.awaitingDeletePost = false;
            const postId = parseInt(ctx.message.text);
            
            const currentData = await loadFromJSONBin();
            const initialLength = currentData.posts?.length || 0;
            currentData.posts = (currentData.posts || []).filter(p => p.id !== postId);
            
            if (currentData.posts.length < initialLength) {
                if (await saveToJSONBin(currentData)) {
                    await ctx.reply(`✅ Пост с ID ${postId} удален`);
                } else {
                    await ctx.reply('❌ Ошибка удаления');
                }
            } else {
                await ctx.reply(`❌ Пост с ID ${postId} не найден`);
            }
            return;
        }
    }
    
    // Если не админские сессии, обрабатываем обычные сообщения
    const text = ctx.message.text.toLowerCase();
    
    if (text.includes('привет') || text.includes('здравствуй')) {
        await ctx.reply('Привет! 👋 Рад тебя видеть! Напиши /start чтобы узнать обо мне.');
    } else if (text.includes('пока') || text.includes('до свидания')) {
        await ctx.reply('До встречи! Буду ждать твоего возвращения! 👋');
    } else if (text.includes('спасибо')) {
        await ctx.reply('Пожалуйста! 😊 Обращайся ещё!');
    } else {
        await ctx.reply('Я не совсем понял твоё сообщение. Напиши /start, чтобы увидеть меню.');
    }
});

// Обработка контакта
bot.on('message:contact', async (ctx) => {
    const contact = ctx.message.contact;
    await ctx.reply(
        `Спасибо, ${contact.first_name}! Я получил твой контакт и скоро свяжусь с тобой. 📱`
    );
});

// === WEBHOOK НАСТРОЙКИ ДЛЯ RENDER ===
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL;

if (WEBHOOK_URL) {
    console.log('🌐 Режим: Webhook на Render');
    
    const app = express();
    app.use(express.json());
    
    app.get('/', (req, res) => {
        res.status(200).send(`
            <html>
                <head><title>Stefan Budimir Bot</title></head>
                <body style="font-family:Arial; text-align:center; padding:50px;">
                    <h1>🤖 Bot is running!</h1>
                    <p>Telegram bot @stefan_budimir_bot is active.</p>
                    <p><a href="https://t.me/stefan_budimir_bot" target="_blank">Open in Telegram</a></p>
                </body>
            </html>
        `);
    });
    
    app.get('/health', (req, res) => {
        res.status(200).send('OK');
    });
    
    app.post('/webhook', (req, res) => {
        bot.handleUpdate(req.body).then(() => res.status(200).send('OK'));
    });
    
    (async () => {
        try {
            await bot.api.deleteWebhook();
            await bot.api.setWebhook(`${WEBHOOK_URL}/webhook`);
            console.log(`✅ Webhook установлен на ${WEBHOOK_URL}/webhook`);
        } catch (error) {
            console.error('❌ Ошибка установки webhook:', error);
        }
    })();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Сервер webhook запущен на порту ${PORT}`);
        console.log(`👑 Админ ID: ${ADMIN_ID}`);
    });
    
} else {
    console.log('🔄 Режим: Polling (локально)');
    bot.start();
}

// Обработка ошибок
bot.catch((err) => {
    console.error('❌ Ошибка бота:', err);
});

// Синхронизация при запуске
(async () => {
    console.log('🔄 Синхронизация с JSONBin...');
    const data = await loadFromJSONBin();
    console.log(`✅ Загружено: ${data.posts?.length || 0} постов, ${data.reviews?.length || 0} отзывов`);
})();