const { Bot, Keyboard, InlineKeyboard, session } = require('grammy');
const fs = require('fs').promises;
const path = require('path');
const express = require('express');
require('dotenv').config();

// Создаем экземпляр бота
const bot = new Bot(process.env.BOT_TOKEN);

// ID администратора из переменных окружения
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

// Проверка, что ID загрузился
if (!ADMIN_ID) {
    console.warn('⚠️ ВНИМАНИЕ: ADMIN_ID не указан в .env! Админ-панель будет недоступна.');
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

// === РАБОТА С ДАННЫМИ ===
const LOCAL_DATA_FILE = path.join(__dirname, 'data-backup.json');

// Проверка на админа
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
            const data = await fs.readFile(LOCAL_DATA_FILE, 'utf8').catch(() => '{"posts":[],"reviews":[]}');
            const json = JSON.parse(data);
            
            if (json.posts.length === 0) {
                await ctx.reply('📭 Нет сохраненных постов');
            } else {
                let msg = '📋 *Твои посты:*\n\n';
                json.posts.slice(0, 5).forEach((post, i) => {
                    msg += `${i+1}. ID: \`${post.id}\`\n   ${post.text.substring(0, 50)}...\n\n`;
                });
                await ctx.reply(msg, { parse_mode: 'Markdown' });
            }
        } catch (e) {
            await ctx.reply('❌ Ошибка загрузки постов');
        }
    }
    
    else if (action === 'admin_reviews') {
        try {
            const data = await fs.readFile(LOCAL_DATA_FILE, 'utf8').catch(() => '{"posts":[],"reviews":[]}');
            const json = JSON.parse(data);
            
            if (json.reviews.length === 0) {
                await ctx.reply('📭 Нет отзывов');
            } else {
                let msg = '💬 *Последние отзывы:*\n\n';
                json.reviews.slice(0, 5).forEach((review, i) => {
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
        await ctx.reply('🔄 Синхронизация с JSONBin... (функция в разработке)');
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
            
            const post = {
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
            
            try {
                const data = await fs.readFile(LOCAL_DATA_FILE, 'utf8').catch(() => '{"posts":[],"reviews":[]}');
                const json = JSON.parse(data);
                json.posts.unshift(post);
                await fs.writeFile(LOCAL_DATA_FILE, JSON.stringify(json, null, 2));
                await ctx.reply(`✅ Пост сохранен!\n\nID: \`${post.id}\``, { parse_mode: 'Markdown' });
                console.log('💾 Пост сохранен локально');
            } catch (e) {
                await ctx.reply('❌ Ошибка сохранения');
                console.error('Ошибка сохранения:', e);
            }
            return;
        }
        
        if (ctx.session.awaitingDeletePost) {
            ctx.session.awaitingDeletePost = false;
            const postId = parseInt(ctx.message.text);
            
            try {
                const data = await fs.readFile(LOCAL_DATA_FILE, 'utf8');
                const json = JSON.parse(data);
                const initialLength = json.posts.length;
                json.posts = json.posts.filter(p => p.id !== postId);
                
                if (json.posts.length < initialLength) {
                    await fs.writeFile(LOCAL_DATA_FILE, JSON.stringify(json, null, 2));
                    await ctx.reply(`✅ Пост с ID ${postId} удален`);
                } else {
                    await ctx.reply(`❌ Пост с ID ${postId} не найден`);
                }
            } catch (e) {
                await ctx.reply('❌ Ошибка удаления');
                console.error('Ошибка удаления:', e);
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
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL; // Render сам подставит URL

if (WEBHOOK_URL) {
    // На Render - используем webhook
    console.log('🌐 Режим: Webhook на Render');
    
    // Создаем Express приложение
    const app = express();
    app.use(express.json());
    
    // Главная страница для проверки Render
    app.get('/', (req, res) => {
        res.status(200).send(`
            <html>
                <head>
                    <title>Stefan Budimir Bot</title>
                    <meta charset="utf-8">
                    <style>
                        body { 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
                            text-align: center; 
                            padding: 40px 20px; 
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            min-height: 100vh;
                            margin: 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .container {
                            max-width: 600px;
                            background: rgba(255,255,255,0.1);
                            backdrop-filter: blur(10px);
                            padding: 40px;
                            border-radius: 20px;
                            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
                        }
                        h1 { 
                            font-size: 48px; 
                            margin-bottom: 20px;
                            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                        }
                        .success { 
                            background: rgba(76, 175, 80, 0.3);
                            padding: 15px;
                            border-radius: 30px;
                            margin: 20px 0;
                            border: 2px solid #4CAF50;
                        }
                        a { 
                            color: white; 
                            text-decoration: none;
                            background: rgba(255,255,255,0.2);
                            padding: 12px 30px;
                            border-radius: 30px;
                            display: inline-block;
                            margin-top: 20px;
                            transition: all 0.3s;
                        }
                        a:hover {
                            background: rgba(255,255,255,0.3);
                            transform: scale(1.05);
                        }
                        code {
                            background: rgba(0,0,0,0.3);
                            padding: 4px 8px;
                            border-radius: 8px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🤖 Telegram Bot</h1>
                        <div class="success">
                            ✅ Bot is running and webhook is set!
                        </div>
                        <p style="font-size: 20px;">Bot: <b>@stefan_budimir_bot</b></p>
                        <p>Webhook endpoint: <code>/webhook</code></p>
                        <p>Status: <span style="color: #4CAF50;">● Online</span></p>
                        <a href="https://t.me/stefan_budimir_bot" target="_blank">👉 Open in Telegram</a>
                    </div>
                </body>
            </html>
        `);
    });
    
    // Health check для Render (обязательно!)
    app.get('/health', (req, res) => {
        res.status(200).send('OK');
    });
    
    // Webhook эндпоинт для Telegram (ИСПРАВЛЕННАЯ ВЕРСИЯ)
    app.post('/webhook', (req, res) => {
        console.log('📨 Получен POST запрос на /webhook');
        console.log('  Headers:', JSON.stringify(req.headers, null, 2));
        console.log('  Body:', JSON.stringify(req.body, null, 2));

        try {
            // Важно: нужно отправить ответ, даже если бот упадет
            bot.handleUpdate(req.body).then(() => {
                console.log('✅ Бот успешно обработал обновление');
                res.status(200).send('OK');
            }).catch((err) => {
                console.error('❌ Бот упал при обработке:', err);
                res.status(200).send('OK'); // Все равно отвечаем OK, чтобы Telegram не слал повторно
            });
        } catch (error) {
            console.error('❌ Критическая ошибка в обработчике вебхука:', error);
            res.status(500).send('Internal Server Error');
        }
    });
    
    // Устанавливаем webhook в Telegram
    (async () => {
        try {
            const webhookUrl = `${WEBHOOK_URL}/webhook`;
            
            // Сначала удалим старый вебхук, чтобы избежать конфликтов
            await bot.api.deleteWebhook();
            console.log('✅ Старый вебхук удален');
            
            // Устанавливаем новый
            await bot.api.setWebhook(webhookUrl);
            console.log(`✅ Webhook установлен на ${webhookUrl}`);
            
            // Проверяем статус
            const webhookInfo = await bot.api.getWebhookInfo();
            console.log('📊 Информация о вебхуке:', webhookInfo);
        } catch (error) {
            console.error('❌ Ошибка установки webhook:', error);
        }
    })();
    
    // Запускаем сервер
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Сервер webhook запущен на порту ${PORT}`);
        console.log(`📅 Время запуска: ${new Date().toLocaleString()}`);
        console.log(`👑 Админ ID: ${ADMIN_ID}`);
        console.log(`🌐 URL сервера: ${WEBHOOK_URL}`);
        console.log(`🔗 Webhook URL: ${WEBHOOK_URL}/webhook`);
    });
    
} else {
    // Локально - используем polling
    console.log('🔄 Режим: Polling (локально)');
    
    bot.start({
        onStart: (botInfo) => {
            console.log(`✅ Бот @${botInfo.username} запущен в режиме polling!`);
            console.log(`📅 Время запуска: ${new Date().toLocaleString()}`);
            if (ADMIN_ID) {
                console.log(`👑 Админ ID: ${ADMIN_ID} (из .env)`);
            }
        }
    });
}

// Обработка ошибок
bot.catch((err) => {
    console.error('❌ Ошибка бота:', err);
});

// Корректное завершение
async function shutdown(signal) {
    console.log(`\n👋 Получен сигнал ${signal}. Останавливаем бота...`);
    try {
        await bot.stop();
        console.log('✅ Бот успешно остановлен');
        process.exit(0);
    } catch (err) {
        console.error('❌ Ошибка при остановке:', err);
        process.exit(1);
    }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));