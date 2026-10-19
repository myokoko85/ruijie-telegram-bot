/**
 * Ruijie Hardware Warranty & Distributor Checker Telegram Bot
 * with Real-Time Query Tracking, Admin Alerts & Web Analytics Dashboard
 * 
 * Standalone Node.js (No external npm packages required)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// ==========================================
// 1. CONFIGURATION & ADMIN SETUP
// ==========================================
const configPath = path.join(__dirname, 'bot_config.json');
let botConfig = {};
if (fs.existsSync(configPath)) {
  try {
    botConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error('Failed to parse bot_config.json:', e.message);
  }
}

let BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || botConfig.bot_token;
if (!BOT_TOKEN && process.argv[2]) {
  BOT_TOKEN = process.argv[2].trim();
}

let ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || botConfig.admin_chat_id || null;

if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
  console.log('========================================================');
  console.log('⚠️ TELEGRAM BOT TOKEN မထည့်ရသေးပါ!');
  console.log('ကျေးဇူးပြု၍ bot_config.json သို့မဟုတ် Environment Variable တွင် ထည့်ပေးပါ');
  console.log('========================================================');
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ==========================================
// 2. QUERY LOGGING & PERSISTENCE
// ==========================================
const logsPath = path.join(__dirname, 'query_logs.json');
let queryLogs = [];

function loadLogs() {
  if (fs.existsSync(logsPath)) {
    try {
      queryLogs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
      if (!Array.isArray(queryLogs)) queryLogs = [];
    } catch (e) {
      queryLogs = [];
    }
  }
}

function saveLogs() {
  try {
    // Keep last 1,000 queries to prevent memory bloating
    if (queryLogs.length > 1000) {
      queryLogs = queryLogs.slice(queryLogs.length - 1000);
    }
    fs.writeFileSync(logsPath, JSON.stringify(queryLogs, null, 2));
  } catch (e) {
    console.error('Failed to save query_logs.json:', e.message);
  }
}

loadLogs();

function getMyanmarTime() {
  const now = new Date();
  // Myanmar is UTC+6:30
  const mmtOffset = 6.5 * 60 * 60 * 1000;
  const mmtDate = new Date(now.getTime() + mmtOffset);
  
  const yyyy = mmtDate.getUTCFullYear();
  const mm = String(mmtDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(mmtDate.getUTCDate()).padStart(2, '0');
  let hh = mmtDate.getUTCHours();
  const min = String(mmtDate.getUTCMinutes()).padStart(2, '0');
  const ss = String(mmtDate.getUTCSeconds()).padStart(2, '0');
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  const hhStr = String(hh).padStart(2, '0');

  return `${dd}/${mm}/${yyyy} ${hhStr}:${min}:${ss} ${ampm} (MMT)`;
}

// Record a new query
function logQuery({ user, chat, sn, result }) {
  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    timeMMT: getMyanmarTime(),
    userId: user.id,
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown User',
    username: user.username ? `@${user.username}` : 'No Username',
    chatType: chat.type,
    chatTitle: chat.title || (chat.type === 'private' ? 'Private Chat' : 'Group Chat'),
    sn: sn,
    found: result.found,
    model: result.found ? result.model : 'Not Found',
    supplier: result.found ? result.supplier : 'N/A',
    status: result.found ? result.status : 'Invalid / Not Found',
    daysRemaining: result.found ? result.daysRemaining : 0
  };

  queryLogs.push(entry);
  saveLogs();

  // Console output (visible in Render logs)
  console.log(`[QUERY] ${entry.timeMMT} | User: ${entry.name} (${entry.username}) | SN: ${entry.sn} | Model: ${entry.model} | Dist: ${entry.supplier}`);

  // Notify Admin in real-time
  if (ADMIN_CHAT_ID && String(ADMIN_CHAT_ID) !== String(user.id)) {
    notifyAdmin(entry).catch(err => {
      console.error('Admin notification error:', err.message);
    });
  }

  return entry;
}

// Real-time alert to Admin Telegram
async function notifyAdmin(log) {
  const alertText = `🔔 <b>[New Warranty Query Alert]</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>User:</b> ${escapeHtml(log.name)} (${log.username})
🆔 <b>User ID:</b> <code>${log.userId}</code>
💬 <b>Chat:</b> ${escapeHtml(log.chatTitle)} (${log.chatType})
━━━━━━━━━━━━━━━━━━━━
🔢 <b>Serial Number:</b> <code>${log.sn}</code>
📦 <b>Model:</b> <code>${log.model}</code>
🏢 <b>Distributor:</b> <b>${escapeHtml(log.supplier)}</b>
🛡️ <b>Status:</b> ${log.status}
⏳ <b>Days Left:</b> ${log.daysRemaining} days
⏰ <b>Time:</b> <code>${log.timeMMT}</code>`;

  await sendMessage(ADMIN_CHAT_ID, alertText);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ==========================================
// 3. HTTP SERVER & WEB ANALYTICS DASHBOARD
// ==========================================
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // 1. Health check endpoint for Render
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head><title>Ruijie Warranty Checker Bot</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body style="font-family: system-ui, sans-serif; background: #0f172a; color: white; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center;">
        <div style="background: #1e293b; padding: 32px; border-radius: 16px; border: 1px solid #334155; max-width: 450px;">
          <div style="font-size: 48px; margin-bottom: 12px;">🤖</div>
          <h2 style="margin: 0 0 8px 0; color: #60a5fa;">Ruijie Warranty Telegram Bot</h2>
          <p style="color: #94a3b8; font-size: 14px; margin-bottom: 24px;">Bot is active and running 24/7 on Cloud.</p>
          <div style="display: inline-block; background: #10b981; color: white; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 13px;">🟢 Status: Online</div>
          <div style="margin-top: 24px;">
            <a href="/admin" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; font-size: 14px;">📊 Open Admin Analytics</a>
          </div>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // 2. Web Admin Analytics Dashboard
  if (url.pathname === '/admin') {
    const totalQueries = queryLogs.length;
    const uniqueUsers = new Set(queryLogs.map(l => l.userId)).size;
    const successfulQueries = queryLogs.filter(l => l.found).length;

    // Build Table Rows (reverse chronological order)
    const recentLogs = [...queryLogs].reverse().slice(0, 100);
    const rowsHtml = recentLogs.map((l, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
        <td style="padding: 12px 14px; color: #64748b;">${recentLogs.length - idx}</td>
        <td style="padding: 12px 14px; color: #334155; white-space: nowrap;">${l.timeMMT}</td>
        <td style="padding: 12px 14px;">
          <div style="font-weight: 600; color: #0f172a;">${escapeHtml(l.name)}</div>
          <div style="font-size: 11px; color: #0284c7;">${l.username} (ID: ${l.userId})</div>
        </td>
        <td style="padding: 12px 14px; font-family: monospace; font-weight: bold; color: #2563eb;">${l.sn}</td>
        <td style="padding: 12px 14px; font-weight: 600; color: #1e293b;">${l.model}</td>
        <td style="padding: 12px 14px; color: #475569;">${escapeHtml(l.supplier)}</td>
        <td style="padding: 12px 14px;">
          ${l.found ? `<span style="background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 11px;">In Warranty (${l.daysRemaining}d)</span>` : `<span style="background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 11px;">Not Found</span>`}
        </td>
        <td style="padding: 12px 14px; color: #64748b; font-size: 11px;">${escapeHtml(l.chatTitle)}</td>
      </tr>
    `).join('');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ruijie Bot Analytics & User Query Logs</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
          .container { max-width: 1200px; margin: 0 auto; }
          .card { background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); margin-bottom: 24px; }
          .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
          .stat-box { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
          .stat-num { font-size: 28px; font-weight: bold; color: #0066ff; margin-top: 6px; }
          .table-container { overflow-x: auto; background: white; border-radius: 12px; border: 1px solid #e2e8f0; }
          table { width: 100%; border-collapse: collapse; text-align: left; }
          th { background: #f1f5f9; padding: 12px 14px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; }
          .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
          .refresh-btn { background: #0066ff; color: white; text-decoration: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header-row">
            <div>
              <h1 style="margin: 0; font-size: 22px;">📊 Ruijie Bot User Query Analytics</h1>
              <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Real-time User Activity & Hardware Warranty Query Logs</p>
            </div>
            <a href="/admin" class="refresh-btn">🔄 Refresh Data</a>
          </div>

          <div class="stats-grid">
            <div class="stat-box">
              <div style="color: #64748b; font-size: 13px; font-weight: 600;">Total Queries</div>
              <div class="stat-num">${totalQueries}</div>
            </div>
            <div class="stat-box">
              <div style="color: #64748b; font-size: 13px; font-weight: 600;">Unique Users</div>
              <div class="stat-num" style="color: #10b981;">${uniqueUsers}</div>
            </div>
            <div class="stat-box">
              <div style="color: #64748b; font-size: 13px; font-weight: 600;">Found Hardware</div>
              <div class="stat-num" style="color: #8b5cf6;">${successfulQueries}</div>
            </div>
            <div class="stat-box">
              <div style="color: #64748b; font-size: 13px; font-weight: 600;">Bot Status</div>
              <div class="stat-num" style="color: #10b981; font-size: 22px;">🟢 24/7 Live</div>
            </div>
          </div>

          <div class="card" style="padding: 0;">
            <div style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; font-weight: bold; font-size: 15px;">
              Recent Search History (Last ${recentLogs.length} Queries)
            </div>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date & Time</th>
                    <th>User</th>
                    <th>Serial Number</th>
                    <th>Product Model</th>
                    <th>Distributor / Company</th>
                    <th>Warranty Status</th>
                    <th>Chat Origin</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 32px; color: #94a3b8;">No queries recorded yet. Send an SN to the bot to see logs here.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // 3. API endpoint for raw JSON logs
  if (url.pathname === '/api/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(queryLogs, null, 2));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`🌐 Analytics Web Server listening on port ${PORT}`);
});

// Self-ping to keep Render Free Tier alive
if (process.env.RENDER_EXTERNAL_URL) {
  console.log(`⏱️ Keep-alive self-ping enabled: ${process.env.RENDER_EXTERNAL_URL}`);
  setInterval(() => {
    fetch(process.env.RENDER_EXTERNAL_URL).catch(() => {});
  }, 10 * 60 * 1000);
}

// ==========================================
// 4. RUIJIE TELEMETRY QUERY FUNCTION
// ==========================================
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

// ==========================================
// 5. TELEGRAM API HELPER FUNCTIONS
// ==========================================
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

async function sendChatAction(chatId, action = 'typing') {
  try {
    await fetch(`${TELEGRAM_API}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: action })
    });
  } catch (e) {}
}

// ==========================================
// 6. MESSAGE DISPATCHER & ADMIN COMMANDS
// ==========================================
async function handleMessage(msg) {
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const user = msg.from;
  const text = msg.text.trim();
  const userName = user.first_name || 'မိတ်ဆွေ';
  const isAdmin = ADMIN_CHAT_ID && String(ADMIN_CHAT_ID) === String(user.id);

  // 1. Command: /start
  if (text === '/start') {
    const welcomeText = `👋 မင်္ဂလာပါ <b>${escapeHtml(userName)}</b>!

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

  // 2. Command: /myid (Check your Telegram User ID)
  if (text === '/myid') {
    await sendMessage(chatId, `🆔 <b>Your Telegram Info:</b>\n\n• <b>User ID:</b> <code>${user.id}</code>\n• <b>Name:</b> ${escapeHtml(userName)}\n• <b>Username:</b> ${user.username ? '@' + user.username : 'None'}\n• <b>Role:</b> ${isAdmin ? '⭐ Admin' : 'User'}`);
    return;
  }

  // 3. Command: /setadmin (Claim / Set current user as Admin)
  if (text.startsWith('/setadmin') || text.startsWith('/claimadmin')) {
    ADMIN_CHAT_ID = String(user.id);
    botConfig.admin_chat_id = ADMIN_CHAT_ID;
    try {
      fs.writeFileSync(configPath, JSON.stringify(botConfig, null, 2));
    } catch (e) {}

    await sendMessage(chatId, `🎉 <b>Admin အဖြစ် အောင်မြင်စွာ သတ်မှတ်ပြီးပါပြီ!</b>\n\nမိတ်ဆွေ၏ User ID (<code>${user.id}</code>) ကို Admin အဖြစ် မှတ်သားထားလိုက်ပါပြီ။\n\nယခုမှစ၍ အခြားသူများ Bot ထဲတွင် SN စစ်ဆေးတိုင်း မိတ်ဆွေထံသို့ ချက်ချင်း Notification ပို့ပေးမည် ဖြစ်ပါသည်။\n\n📊 အောက်ပါ Command များဖြင့် စာရင်းကြည့်နိုင်ပါသည် -\n• /stats - သုံးစွဲမှု စာရင်းချုပ်\n• /recent - နောက်ဆုံး စစ်ဆေးသွားသော စာရင်းများ`);
    return;
  }

  // 4. Admin Command: /stats
  if (text === '/stats') {
    if (!isAdmin) {
      await sendMessage(chatId, `⚠️ ဤ Command သည် <b>Bot Admin</b> သီးသန့် ဖြစ်ပါသည်။ မိတ်ဆွေက Bot ပိုင်ရှင်ဖြစ်ပါက /setadmin ဟု ရိုက်ပေးပါ။`);
      return;
    }

    const totalQueries = queryLogs.length;
    const uniqueUsers = new Set(queryLogs.map(l => l.userId)).size;
    const foundCount = queryLogs.filter(l => l.found).length;

    // Count by distributor
    const distCount = {};
    queryLogs.filter(l => l.found).forEach(l => {
      distCount[l.supplier] = (distCount[l.supplier] || 0) + 1;
    });
    const topDists = Object.entries(distCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `• ${name}: <b>${count} ခု</b>`)
      .join('\n') || 'မရှိသေးပါ';

    // Count by model
    const modelCount = {};
    queryLogs.filter(l => l.found).forEach(l => {
      modelCount[l.model] = (modelCount[l.model] || 0) + 1;
    });
    const topModels = Object.entries(modelCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `• ${name}: <b>${count} ခု</b>`)
      .join('\n') || 'မရှိသေးပါ';

    const statsMsg = `📊 <b>Ruijie Bot Usage Statistics</b>
━━━━━━━━━━━━━━━━━━━━
📈 <b>Total Queries:</b> <b>${totalQueries} ကြိမ်</b>
👥 <b>Total Unique Users:</b> <b>${uniqueUsers} ယောက်</b>
✅ <b>Valid Hardware Found:</b> <b>${foundCount} ခု</b>
━━━━━━━━━━━━━━━━━━━━
🏢 <b>Top Searched Distributors:</b>
${topDists}

📦 <b>Top Searched Models:</b>
${topModels}
━━━━━━━━━━━━━━━━━━━━
💡 <i>Web Browser ဖြင့် ဇယားကြည့်ရန် /admin link ကို ဖွင့်နိုင်ပါသည်။</i>`;

    await sendMessage(chatId, statsMsg);
    return;
  }

  // 5. Admin Command: /recent or /history
  if (text === '/recent' || text === '/history') {
    if (!isAdmin) {
      await sendMessage(chatId, `⚠️ ဤ Command သည် <b>Bot Admin</b> သီးသန့် ဖြစ်ပါသည်။`);
      return;
    }

    if (queryLogs.length === 0) {
      await sendMessage(chatId, `ℹ️ လက်ရှိတွင် မည်သည့် Query မှတ်တမ်းမှ မရှိသေးပါခင်ဗျာ။`);
      return;
    }

    const recent = [...queryLogs].reverse().slice(0, 5);
    let historyText = `📋 <b>နောက်ဆုံး စစ်ဆေးသွားသော စာရင်းများ (${recent.length} ခု)</b>\n━━━━━━━━━━━━━━━━━━━━\n`;

    recent.forEach((l, i) => {
      historyText += `<b>${i + 1}. ${escapeHtml(l.name)}</b> (${l.username})\n`;
      historyText += `🔢 SN: <code>${l.sn}</code> | 📦 ${l.model}\n`;
      historyText += `🏢 Dist: ${escapeHtml(l.supplier)}\n`;
      historyText += `⏰ ${l.timeMMT}\n━━━━━━━━━━━━━━━━━━━━\n`;
    });

    await sendMessage(chatId, historyText);
    return;
  }

  // 6. Regular Warranty Query (Extract SN from message)
  const potentialSnMatch = text.match(/[A-Za-z0-9]{8,25}/);
  if (!potentialSnMatch) {
    await sendMessage(chatId, `⚠️ ကျေးဇူးပြု၍ မှန်ကန်သော <b>Serial Number (SN)</b> ကို ထည့်သွင်းပေးပါခင်ဗျာ။\n\nဥပမာ - <code>G1T04Z4020475</code>`);
    return;
  }

  const sn = potentialSnMatch[0].toUpperCase();
  await sendChatAction(chatId, 'typing');

  const result = await checkRuijieWarranty(sn);

  // Log user activity
  logQuery({ user: user, chat: msg.chat, sn: sn, result: result });

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

// ==========================================
// 7. TELEGRAM POLLING WORKER
// ==========================================
let offset = 0;
async function startPolling() {
  console.log('🤖 Ruijie Telegram Bot with Analytics စတင် လည်ပတ်နေပါပြီ...');
  console.log(`📊 Admin Web Dashboard: http://localhost:${PORT}/admin\n`);

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
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

startPolling();
