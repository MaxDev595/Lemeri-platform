@echo off
chcp 65001 >nul
cd /d "%~dp0"
set LOG=%~dp0deploy-lemeri-log.txt
echo Lemeri: tests, commit and push. Log: %LOG%
(
  echo === status ===
  git status --short
  echo.
  echo === tests ===
  call npm.cmd test
  echo TESTS_EXIT=%ERRORLEVEL%
) > "%LOG%" 2>&1
findstr /C:"TESTS_EXIT=0" "%LOG%" >nul
if errorlevel 1 (
  echo TESTS FAILED - nothing pushed >> "%LOG%"
  echo Tests failed, nothing was pushed. See deploy-lemeri-log.txt
  pause
  exit /b 1
)
(
  echo.
  echo === commit + push ===
  git add -u
  git add src tests docs
  git commit -m "Payment cancellation: customer request with comment, admin approval; fix admin payment lists"
  git push
  echo PUSH_EXIT=%ERRORLEVEL%
  git log -1 --oneline
) >> "%LOG%" 2>&1
echo Done. See deploy-lemeri-log.txt
pause
