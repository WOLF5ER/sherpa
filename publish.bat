@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Публикация релиза на GitHub: Sherpa у друзей сама увидит новую версию и предложит поставить.
rem Порядок: поднять версию в package.json → build-exe.bat → закоммитить → publish.bat [файл-с-заметками.md]
for /f "tokens=2 delims=:, " %%v in ('findstr /c:"\"version\"" package.json') do set VER=%%~v
if not exist "release\Sherpa-%VER%.zip" (echo Нет release\Sherpa-%VER%.zip — сначала build-exe.bat & pause & exit /b 1)
where gh >nul 2>nul || (echo Нужен GitHub CLI: winget install GitHub.cli, потом gh auth login & pause & exit /b 1)
set NOTES=release\notes-%VER%.md
if "%~1" neq "" set NOTES=%~1
git push origin HEAD || (pause & exit /b 1)
echo Публикую релиз v%VER% (release\Sherpa-%VER%.zip)...
if exist "%NOTES%" (
  gh release create v%VER% "release\Sherpa-%VER%.zip" --title "Sherpa %VER%" --notes-file "%NOTES%" || (pause & exit /b 1)
) else (
  echo   Заметок %NOTES% нет — соберу список изменений из коммитов.
  gh release create v%VER% "release\Sherpa-%VER%.zip" --title "Sherpa %VER%" --generate-notes || (pause & exit /b 1)
)
echo.
echo Готово: https://github.com/WOLF5ER/sherpa/releases/tag/v%VER%
echo Sherpa.exe у друзей проверяет релизы при запуске и раз в 6 часов; кнопка «проверить» — в профиле.
pause
