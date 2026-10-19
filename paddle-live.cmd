@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo  Lemeri: Paddle LIVE setup (Cloudflare secrets)
echo  Prices are filled in automatically. You will be asked to
echo  paste: legal details, then 3 Paddle keys. Paste + Enter.
echo ============================================================
echo.
echo --- Price IDs (created in Paddle live catalog) ---
echo pri_01m54mmreyg4mkpc26qrqvyjvy| npx.cmd wrangler secret put PADDLE_STARTER_PRICE_ID
echo pri_01m54mq584adybyw538j3na6sm| npx.cmd wrangler secret put PADDLE_STARTER_YEARLY_PRICE_ID
echo pri_01m54mvafrsjg3j9h72fatqfqz| npx.cmd wrangler secret put PADDLE_CUSTOM_PRICE_ID
echo pri_01m54mxtrzwvamtdjcbk1xhjw2| npx.cmd wrangler secret put PADDLE_CUSTOM_YEARLY_PRICE_ID
echo.
echo --- Legal details for /legal pages (Paddle checks them) ---
echo Company or sole proprietor name, exactly as in documents:
call npx.cmd wrangler secret put LEMIRI_LEGAL_ENTITY
echo Registration number (IIN / BIN):
call npx.cmd wrangler secret put LEMIRI_LEGAL_ID
echo Legal address:
call npx.cmd wrangler secret put LEMIRI_LEGAL_ADDRESS
echo Country:
call npx.cmd wrangler secret put LEMIRI_LEGAL_COUNTRY
echo Support email:
call npx.cmd wrangler secret put LEMIRI_SUPPORT_EMAIL
echo.
echo --- Paddle LIVE keys (Paddle - Developer tools - Authentication / Notifications) ---
echo Live API key (pdl_live_apikey_...):
call npx.cmd wrangler secret put PADDLE_API_KEY
echo Live client-side token (live_...):
call npx.cmd wrangler secret put PADDLE_CLIENT_TOKEN
echo Webhook secret key (Notifications - Lemeri production billing - Edit):
call npx.cmd wrangler secret put PADDLE_WEBHOOK_SECRET
echo.
echo --- Switching Lemeri to LIVE payments ---
echo production| npx.cmd wrangler secret put PADDLE_ENVIRONMENT
echo.
echo Done. Check https://lemeriai.com/legal/terms and submit the domain in Paddle.
pause
