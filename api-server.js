const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Расширенное логирование
app.use((req, res, next) => {
    console.log(`\n📨 ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    next();
});

app.use(cors({
    origin: '*', // В продакшене заменить на конкретный домен
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Защищенные переменные из .env
const BOT_TOKEN = process.env.BOT_TOKEN;
const BIN_ID = process.env.JSONBIN_ID;
const API_KEY = process.env.JSONBIN_KEY;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const TON_ADDRESS = process.env.TON_ADDRESS;

console.log('📦 Конфигурация:');
console.log('- BOT_TOKEN:', BOT_TOKEN ? '✅' : '❌');
console.log('- BIN_ID:', BIN_ID ? '✅' : '❌');
console.log('- API_KEY:', API_KEY ? '✅' : '❌');
console.log('- ADMIN_ID:', ADMIN_ID);
console.log('- TON_ADDRESS:', TON_ADDRESS ? '✅' : '❌');

// Функция проверки initData
function validateTelegramData(initData) {
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');
        
        const dataCheckString = Array.from(urlParams.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
        
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');
        
        const isValid = calculatedHash === hash;
        console.log('🔐 Проверка initData:', isValid ? '✅' : '❌');
        return isValid;
    } catch (error) {
        console.error('❌ Ошибка валидации:', error);
        return false;
    }
}

// Middleware для проверки всех запросов
app.use(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ Нет Authorization header');
        return res.status(401).json({ error: 'No auth token' });
    }
    
    const initData = authHeader.slice(7);
    const isValid = validateTelegramData(initData);
    
    if (!isValid) {
        return res.status(403).json({ error: 'Invalid signature' });
    }
    
    // Расшифровываем данные пользователя
    try {
        const params = new URLSearchParams(initData);
        const userStr = params.get('user');
        if (userStr) {
            req.user = JSON.parse(decodeURIComponent(userStr));
            req.isAdmin = req.user.id === ADMIN_ID;
            console.log(`👤 Пользователь: ${req.user.id} (admin: ${req.isAdmin})`);
        }
    } catch (e) {
        console.log('⚠️ Нет данных пользователя');
    }
    
    next();
});

// Эндпоинт для получения данных
app.get('/api/data', async (req, res) => {
    console.log('📥 Запрос данных из JSONBin...');
    
    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
            headers: { 'X-Access-Key': API_KEY }
        });
        
        if (!response.ok) {
            console.error('❌ JSONBin ошибка:', response.status);
            return res.status(response.status).json({ error: 'JSONBin error' });
        }
        
        const data = await response.json();
        console.log('✅ Данные получены, постов:', data.record.posts?.length);
        res.json(data.record);
    } catch (error) {
        console.error('❌ Ошибка JSONBin:', error);
        res.status(500).json({ error: 'Failed to load data' });
    }
});

// Эндпоинт для сохранения данных
app.post('/api/data', async (req, res) => {
    console.log('📤 Сохранение данных...');
    
    // Проверяем права (админ или автор)
    if (!req.isAdmin) {
        console.log('⛔ Недостаточно прав для сохранения');
        return res.status(403).json({ error: 'Admin only' });
    }
    
    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Access-Key': API_KEY
            },
            body: JSON.stringify(req.body)
        });
        
        if (response.ok) {
            console.log('✅ Данные сохранены');
            res.json({ success: true });
        } else {
            console.error('❌ JSONBin ошибка:', response.status);
            res.status(response.status).json({ error: 'Failed to save' });
        }
    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Эндпоинт для проверки прав
app.get('/api/check-admin', (req, res) => {
    res.json({ isAdmin: req.isAdmin || false });
});

// Эндпоинт для получения TON адреса
app.get('/api/ton-address', (req, res) => {
    res.json({ address: TON_ADDRESS });
});

app.listen(3002, () => {
    console.log('\n✅ API Server запущен на порту 3002');
    console.log('📍 http://localhost:3002');
    console.log('🔐 Валидация initData включена\n');
});