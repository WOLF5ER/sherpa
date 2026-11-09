# Явные машины состояний для Sherpa

## Контекст

В приложении 7 процессов с фазами (обновление, туннель, стадия игры, текущий рейд, сквад-подключение, облачная синхронизация, загрузка данных). Их состояние кодируется строковыми полями, булевыми флагами и эвристиками, размазанными по коду. Это уже приводило к багам (tripwire `currentMapId`, React #185), затрудняет DX (непонятно, какие переходы легальны) и AX (агент не видит модель состояний). Цель — сделать машины явными **без изменения поведения**: типы, единые предикаты/переходы и документация.

Решение: **без XState** — проект маленький, zustand-идиоматичный; вместо библиотеки вводим дискриминированные union-типы + центральные transition-функции + справочник машин.

## Изменения

### 1. Новый файл `src/lib/machines.ts` — единая точка правды о стадиях
- `const STAGES = { update: [...], tunnel: [...], game: [...], squad: [...], cloud: [...] } as const` + производные типы.
- Предикаты-хелперы: `updateBusy(stage)`, `tunnelOn(state)`, `tunnelLabel(state)`, `gameInRaid(info)`, `squadStatusLabel`, — с русскими подписями (перенести `STAGE_RU` из PositionPanel.tsx:118 и цепочки из Squad.tsx:149-155, Shell.tsx:201).
- Для каждой машины — функция `next<Domain>(from, event)`, задокументированная JSDoc-диаграммой переходов (текстовая, как `idle →(check) checking →(found) idle …`). Используется в новом коде и тестах; существующие сеттеры делегируют ей.

### 2. Потребители переводятся на хелперы (поведение то же)
- `src/components/Shell.tsx:198`, `src/pages/Profile.tsx:288-299` — рендер обновления через `updateBusy`/подписи.
- `src/pages/Squad.tsx:64-65,142-158` — toggle и статус туннеля через `tunnelOn`/`tunnelLabel` (сейчас «включён» = `up||starting||downloading` — тройное сравнение в трёх местах).
- `src/pages/PositionPanel.tsx`, `src/App.tsx:96` — `gameInRaid` вместо `stage !== 'menu'` / `=== 'menu'`.
- `launcher/sherpa.py` — типизация стадий в docstring-константах (`UPDATE_STAGES`, `TUNNEL_STATES`) рядом с `_update_state`/`_tunnel_state`, guard на py:1062 переписан на `UPDATE_STAGES`-множество; переходы только через существующие `_set_update_state` (без логических изменений).

### 3. Сквад-подключение: фаза вместо boolean (единственное поведение-улучшение)
- `lib/squad.ts` `subscribeSquad`: колбэк `onState(ok: boolean)` → `onState(phase: 'connecting' | 'streaming' | 'polling' | 'offline')` (заменяет неявные `gotData`/watchdog/`delay`).
- `Squad.tsx:74`: чип показывает «подключаюсь…» / «на связи» / «опрос (SSE недоступен)» / «нет связи» вместо двух состояний. UX: пользователь видит, что соединение поднимается, а не «нет связи». Обратная совместимость: этот колбэк используется только в App.tsx/squad-эффектах — обновить все call-сайты (grep `subscribeSquad`).

### 4. Текущий рейд (`store/raids.ts`) — только документация и производное поле
- Логику резки рейдов (GAP_MS и эвристики) **не трогаем** — рискованно и работает.
- Добавляем derived-хелпер `raidPhase(current): 'idle' | 'recording'` + подробный JSDoc-блок над стором с текстовой диаграммой: `idle →(скриншот/лог) recording ⇄(пауза>20мин|смена карты|сброс) idle`.

### 5. Документ `MACHINES.md` в корне
- Для каждой из 7 машин: поле-носитель состояния, диаграмма переходов (mermaid), файлы переходов, известные ловушки (пинг-понг `currentMapId`, SSE-через-туннель). Это главный AX-артефакт: агент по одному файлу понимает все процессы.

## Файлы
- Новые: `src/lib/machines.ts`, `MACHINES.md`
- Правки: `src/components/Shell.tsx`, `src/pages/Profile.tsx`, `src/pages/Squad.tsx`, `src/pages/PositionPanel.tsx`, `src/App.tsx` (+ call-сайты `subscribeSquad`), `src/lib/squad.ts`, `src/store/raids.ts` (только JSDoc), `launcher/sherpa.py` (константы стадий + guard)

## Проверка
1. `npm run lint` (oxlint) и `npx tsc -b` — типы стадий должны поймать рассинхрон.
2. `npm run dev` — вручную: страница Сквад (фазы туннеля и подключения), Profile (обновление), Карты/PositionPanel (стадия игры из логов).
3. Grep-проверка: не осталось прямых строковых сравнений `stage === '...'`/`tunnel_state === '...'` вне `machines.ts` и docstring'ов.
4. Существующее поведение (кроме нового чипа «подключаюсь») — без изменений; в git-диффе по raids.ts/sherpa.py только комментарии и константы.