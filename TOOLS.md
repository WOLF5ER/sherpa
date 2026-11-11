# Окружение этой машины (для агентов и будущего себя)

Проверено 2026-11-11. Не выводи «инструмента нет» по отсутствию в PATH текущей сессии — сначала смотри сюда.

## GitHub CLI — УСТАНОВЛЁН (WinGet), авторизован под WOLF5ER

- Путь: `C:\Users\artem\AppData\Local\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe`
- В **Git Bash он НЕ на PATH** (`which gh` → not found) — это не значит, что его нет. Вызывай по полному пути.
- `gh auth status` → Logged in as WOLF5ER (keyring), scopes: repo, gist, read:org.
- В cmd/PowerShell пользовательский PATH его содержит, поэтому `publish.bat` из cmd работает штатно.

## Python для сборки лаунчера

- Системный (пользовательский) Python 3.13: `C:\Users\artem\AppData\Local\Programs\Python\Python313\` — там стоят PyInstaller и pywebview.
- В Git Bash `python` указывает на ВНУТРЕННИЙ managed-рантайм Kimi, в нём PyInstaller НЕТ.
- Для шагов build-exe.bat из Git Bash: `cmd //c "python -m PyInstaller ..."` (двойной слэш — иначе Git Bash съедает `/c`).

## Релизный цикл

1. Поднять версию: `npm version X.Y.Z --no-git-tag-version` (package.json → dist/version.json при сборке). **Строго ДО `npm run build`**: если поднять версию после сборки, в zip уедет старый version.json — приложение обновится, но будет показывать старую версию и снова предлагать обновление (было в 0.1.79). Перед сборкой exe закрыть запущенный Sherpa.exe — иначе PyInstaller не перезапишет `_internal` (WinError 5).
2. `npm run build`.
3. exe: `cmd //c "python -m PyInstaller --noconfirm --clean --distpath release --workpath build-pyi launcher\sherpa.spec"`.
4. zip: `powershell -NoProfile -Command "Compress-Archive -Force -Path 'release\Sherpa\*' -DestinationPath 'release\Sherpa-X.Y.Z.zip'"`.
5. Заметки: `release\notes-X.Y.Z.md` (папка `release/` в .gitignore — заметки локальные, не коммитятся).
6. `git push origin HEAD`.
7. Публикация: `gh release create vX.Y.Z release\Sherpa-X.Y.Z.zip --title "Sherpa X.Y.Z" --notes-file release\notes-X.Y.Z.md` (gh — по полному пути выше).

## Прочее

- `launcher\bin\cloudflared.exe` — уже лежит в репозитории-комплекте, перекачивать не нужно.
- Headless-скриншоты UI: `puppeteer-core` (ставить `npm i puppeteer-core --no-save`) + Edge `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`. Dev-сервер фоном не держать — статик-сервер dist внутри того же скрипта.
