@echo off
chcp 65001 >nul
cd /d "%~dp0"
set LOG=%~dp0deploy-openai-log.txt
echo Lemeri: switch to OpenAI and deploy. Log: %LOG%
(
  echo === branch / status ===
  git rev-parse --abbrev-ref HEAD
  git status --short
  echo.
  echo === cloudflare secrets ===
  call npx.cmd wrangler secret list
  echo.
  echo === tests ===
  call npm.cmd test
  echo TESTS_EXIT=%ERRORLEVEL%
) > "%LOG%" 2>&1
findstr /C:"TESTS_EXIT=0" "%LOG%" >nul
if errorlevel 1 (
  echo TESTS FAILED - nothing pushed >> "%LOG%"
  echo Tests failed, nothing was pushed. See deploy-openai-log.txt
  pause
  exit /b 1
)
(
  echo.
  echo === commit + push ===
  git add -u
  git commit -m "Switch AI to OpenAI, remove Groq; never 500 when the AI provider is misconfigured"
  git push
  echo PUSH_EXIT=%ERRORLEVEL%
  git log -1 --oneline
) >> "%LOG%" 2>&1
echo Done. See deploy-openai-log.txt
pause
