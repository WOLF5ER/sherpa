@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul || (echo Нужен Python 3.10+ : https://www.python.org/downloads/ & pause & exit /b 1)

python -c "import webview" 2>nul || (
  echo Ставлю pywebview...
  python -m pip install --quiet pywebview || (echo Не удалось установить pywebview & pause & exit /b 1)
)

if not exist "dist\index.html" (
  echo Сборки нет, собираю приложение (нужен Node.js)...
  call npm install || (pause & exit /b 1)
  call npm run build || (pause & exit /b 1)
)

python launcher\sherpa.py
