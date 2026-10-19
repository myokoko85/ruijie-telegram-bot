/**
 * Ruijie Hardware Warranty & Distributor Checker Telegram Bot
 * Fully standalone using native Node.js fetch (No external npm packages required)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Start lightweight HTTP health-check server for Render.com Web Service
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('🤖 Ruijie Warranty Checker Telegram Bot is active and running 24/7!\n');
});
server.listen(PORT, () => {
  console.log(`🌐 Health-check server listening on port ${PORT}`);
});

// Self-ping to keep Render Free Tier alive
if (process.env.RENDER_EXTERNAL_URL) {
  console.log(`⏱️ Keep-alive self-ping enabled: ${process.env.RENDER_EXTERNAL_URL}`);
  setInterval(() => {
    fetch(process.env.RENDER_EXTERNAL_URL).catch(() => {});
  }, 10 * 60 * 1000); // Every 10 mins
}

// 1. Load Bot Token from Environment or config.json
let BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const configPath = path.join(__dirname, 'bot_config.json');
if (!BOT_TOKEN && fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    BOT_TOKEN = config.bot_token;
  } catch (e) {
    console.error('Failed to parse bot_config.json:', e.message);
  }
}

if (!BOT_TOKEN && process.argv[2]) {
  BOT_TOKEN = process.argv[2].trim();
}

if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
  console.log('========================================================');
  console.log('⚠️ TELEGRAM BOT TOKEN မထည့်ရသေးပါ!');
  console.log('ကျေးဇူးပြု၍ အောက်ပါ နည်းလမ်းများအနက် တစ်ခုခုဖြင့် ထည့်ပေးပါ -');
  console.log('၁။ bot_config.json တွင် bot_token ထည့်ခြင်း');
  console.log('၂။ node telegram_bot.js <YOUR_BOT_TOKEN>');
  console.log('၃။ Environment variable TELEGRAM_BOT_TOKEN သတ်မှတ်ခြင်း');
  console.log('========================================================');

  // Create default bot_config.json if not exists
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
      bot_token: "YOUR_TELEGRAM_BOT_TOKEN_HERE"
    }, null, 2));
    console.log(`\n📁 စမ်းသပ်ရန် 'bot_config.json' file ကို တည်ဆောက်ပေးထားပါသည်။ Token ထည့်သွင်းပြီး ပြန်လည် run နိုင်ပါသည်။`);
  }
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// 2. Query Ruijie Official Telemetry API
async function checkRuijieWarranty(sn) {
  const cleanSn = sn.trim().toUpperCase();
  try {
    const res = await fetch('https://www.ruijie.com/api/front-service/guaranteeCheck', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Referer': 'https://www.ruijie.com/en-global/support/warranty/check',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: cleanSn
    });

    const data = await res.json();
    if (data && data.code === 0 && Array.isArray(data.data) && data.data.length > 0) {
      const item = data.data[0];
      const isReplaced = item.isReplaced === '1' || item.isReplaced === 1;
      const isWarranty = item.guaranteeState === '在保';

      return {
        found: true,
        sn: item.devicCode || cleanSn,
        model: item.deviceName || 'Unknown Model',
        supplier: item.companyName || 'Not Disclosed',
        status: isWarranty ? 'In Warranty (အာမခံအတွင်း)' : 'Out of Warranty (အာမခံကုန်ဆုံး)',
        rawStatus: item.guaranteeState,
        startDate: item.guaranteeBeginTimeString || (item.guaranteeBeginTime ? item.guaranteeBeginTime.split(' ')[0] : 'N/A'),
        endDate: item.guaranteeEndTimeString || (item.guaranteeEndTime ? item.guaranteeEndTime.split(' ')[0] : 'N/A'),
        daysRemaining: item.guarantDayNum || 0,
        serviceName: item.serviceName || 'Standard Ruijie Service',
        isReplaced: isReplaced,
        newSn: item.newSn || null
      };
    } else {
      return { found: false, message: 'ဤ Serial Number အတွက် Warranty အချက်အလက် မတွေ့ရှိပါ' };
    }
  } catch (error) {
    console.error('Ruijie API Query Error:', error);
    return { found: false, message: `စစ်ဆေးရာတွင် အမှားဖြစ်ပေါ်ခဲ့သည်: ${error.message}` };
  }
}

// 3. Send Telegram Message
async function sendMessage(chatId, text, options = {}) {
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        ...options
      })
    });
  } catch (e) {
    console.error('Error sending message:', e.message);
  }
}

// 4. Send Chat Action (typing...)
async function sendChatAction(chatId, action = 'typing') {
  try {
    await fetch(`${TELEGRAM_API}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        action: action
      })
    });
  } catch (e) {
    // Ignore action error
  }
}

// 5. Handle Incoming Message
async function handleMessage(msg) {
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const userName = msg.from.first_name || 'မိတ်ဆွေ';

  // Command: /start
  if (text === '/start') {
    const welcomeText = `👋 မင်္ဂလာပါ <b>${userName}</b>!

<b>Ruijie Hardware Warranty & Distributor Checker Bot</b> မှ ကြိုဆိုပါတယ်။

🔍 <b>အသုံးပြုနည်း -</b>
စစ်ဆေးလိုသော Ruijie / Reyee စက်ပစ္စည်း၏ <b>Serial Number (SN)</b> ကို ရိုက်ပို့လိုက်ရုံဖြင့် အာမခံနှင့် တရားဝင် Distributor ကို အလိုအလျောက် စစ်ဆေးပြသပေးပါမည်။

📌 <b>စမ်းသပ်ရန် နမူနာ SN များ -</b>
• <code>G1T04Z4020475</code>
• <code>H1U408R00725A</code>
• <code>G1TK4NG011582</code>`;
    await sendMessage(chatId, welcomeText);
    return;
  }

  // Command: /help
  if (text === '/help') {
    const helpText = `ℹ️ <b>Ruijie Serial Number (SN) ရှာဖွေနည်း</b>

၁။ Router, Switch သို့မဟုတ် AP ၏ နောက်ကျော/အောက်ခြေရှိ Label Sticker တွင် <b>S/N</b> သို့မဟုတ် <b>SN</b> ဟု ရေးထားသော ၁၃-၁၄ လုံးပါ စာလုံး/ဂဏန်း ကို ရှာပါ။
၂။ တွေ့ရှိသော SN ကို ဤ Bot ထံ စာသားအတိုင်း ရိုက်ပို့ပေးပါ။

📌 ဥပမာ - <code>H1U408R00725A</code>`;
    await sendMessage(chatId, helpText);
    return;
  }

  // Detect potential SN (Letters + Numbers, 8 to 25 chars)
  const potentialSnMatch = text.match(/[A-Za-z0-9]{8,25}/);
  if (!potentialSnMatch) {
    await sendMessage(chatId, `⚠️ ကျေးဇူးပြု၍ မှန်ကန်သော <b>Serial Number (SN)</b> ကို ထည့်သွင်းပေးပါခင်ဗျာ။\n\nဥပမာ - <code>G1T04Z4020475</code>`);
    return;
  }

  const sn = potentialSnMatch[0].toUpperCase();
  await sendChatAction(chatId, 'typing');

  const result = await checkRuijieWarranty(sn);

  if (result.found) {
    const isWarranty = result.rawStatus === '在保';
    const statusEmoji = isWarranty ? '✅' : '❌';
    const daysText = isWarranty ? `<b>${result.daysRemaining} ရက်</b> ကျန်ရှိပါသည်` : 'အာမခံ ကုန်ဆုံးပြီးဖြစ်ပါသည်';

    const replyMsg = `🛡️ <b>Ruijie Hardware Warranty Report</b>
━━━━━━━━━━━━━━━━━━━━
📦 <b>Device Model:</b> <code>${result.model}</code>
🔢 <b>Serial Number:</b> <code>${result.sn}</code>
🏢 <b>Official Distributor:</b> <b>${result.supplier}</b>
━━━━━━━━━━━━━━━━━━━━
${statusEmoji} <b>အာမခံ အခြေအနေ:</b> <b>${result.status}</b>
⏳ <b>ကျန်ရှိသည့် သက်တမ်း:</b> ${daysText}
📅 <b>Warranty Period:</b> ${result.startDate} ~ ${result.endDate}
🛠️ <b>Service Level:</b> ${result.serviceName}
🔄 <b>စက်အမျိုးအစား:</b> ${result.isReplaced ? 'Replaced Unit' : 'မူရင်းစက် (Original Device)'}
━━━━━━━━━━━━━━━━━━━━
<i>🔍 Ruijie Official Telemetry မှ အတည်ပြု စစ်ဆေးပေးထားပါသည်။</i>`;

    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🌐 Ruijie Official Portal',
              url: 'https://www.ruijie.com/en-global/support/warranty/check'
            }
          ]
        ]
      }
    };

    await sendMessage(chatId, replyMsg, inlineKeyboard);
  } else {
    await sendMessage(chatId, `❌ <b>Serial Number (${sn})</b> အတွက် Warranty အချက်အလက် မတွေ့ရှိပါခင်ဗျာ။\n\nကျေးဇူးပြု၍ စက်၏ Label Sticker ပေါ်ရှိ SN စာလုံးပေါင်း မှန်/မမှန် ပြန်လည်စစ်ဆေးပေးပါ။`);
  }
}

// 6. Polling loop
let offset = 0;
async function startPolling() {
  console.log('🤖 Ruijie Telegram Bot စတင် လည်ပတ်နေပါပြီ...');
  console.log('📩 Messages များကို စောင့်ဆိုင်းနေပါသည်...\n');

  while (true) {
    try {
      const res = await fetch(`${TELEGRAM_API}/getUpdates?offset=${offset}&timeout=25`);
      const data = await res.json();

      if (data && data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          if (update.message) {
            handleMessage(update.message).catch(err => {
              console.error('Error handling message:', err);
            });
          }
        }
      } else if (data && !data.ok) {
        console.error('Telegram API error:', data.description);
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (err) {
      // Network interruption retry
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

startPolling();
