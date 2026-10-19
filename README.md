# Ruijie Warranty & Distributor Checker Telegram Bot

A lightweight, standalone Node.js Telegram Bot that checks Ruijie & Reyee hardware warranty, supplier company name, and product specifications directly from Ruijie Official Telemetry.

## Deployment on Render.com (24/7 Free Hosting)

1. Create a new GitHub repository and push this folder.
2. Sign in to [Render.com](https://render.com).
3. Click **New +** -> **Web Service**.
4. Connect your GitHub repository.
5. Configure settings:
   - **Name:** `ruijie-warranty-bot`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node telegram_bot.js`
   - **Instance Type:** `Free`
6. Add Environment Variable:
   - Key: `TELEGRAM_BOT_TOKEN`
   - Value: `8776564962:AAHTzk49ErxAS5aohkaMj2TsCmKguFBPuqM`
7. Click **Deploy Web Service**!
