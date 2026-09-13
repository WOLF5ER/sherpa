@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [1/3] Сборка сайта...
call npm install || (pause & exit /b 1)
call npm run build || (pause & exit /b 1)
echo [2/3] Упаковка в Sherpa.exe (PyInstaller)...
python -c "import PyInstaller" 2>nul || python -m pip install --quiet pyinstaller pywebview || (pause & exit /b 1)
python -m PyInstaller --noconfirm --clean --distpath release --workpath build-pyi launcher\sherpa.spec || (pause & exit /b 1)
echo [3/3] Архив для друзей...
for /f "tokens=2 delims=:, " %%v in ('findstr /c:"\"version\"" package.json') do set VER=%%~v
powershell -NoProfile -Command "Compress-Archive -Force -Path 'release\Sherpa\*' -DestinationPath ('release\Sherpa-' + '%VER%' + '.zip')"
echo.
echo Готово: release\Sherpa\Sherpa.exe  и  release\Sherpa-%VER%.zip
pause
