@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Lemiri AI
echo === Lemiri AI: локальный запуск на http://localhost:3001 ===
echo.
echo [1/3] Установка зависимостей (первый раз 1-3 минуты)...
call npm install --no-audit --no-fund || goto :fail
echo [2/3] Генерация Prisma...
call npx prisma generate || goto :fail

rem Если в .env нет настоящей базы — поднимаем локальную (данные в папке .local-db).
findstr /r /c:"^DATABASE_URL=postgresql://USER" .env >nul 2>&1
if %errorlevel%==0 (
  echo [i] В .env нет базы — запускаю локальную базу в отдельном окне...
  start "Lemiri DB (не закрывать)" cmd /k node scripts\local-db.mjs
  set DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres
  timeout /t 8 /nobreak >nul
)

echo [3/3] Запуск сайта...
rem Адрес должен совпадать с портом, иначе кабинет отклонит запросы.
set PUBLIC_APP_URL=http://localhost:3001
start "" cmd /c "timeout /t 20 /nobreak >nul & start http://localhost:3001"
call npx next dev -p 3001
goto :eof

:fail
echo.
echo [!] Ошибка — пришлите скрин этого окна.
pause
