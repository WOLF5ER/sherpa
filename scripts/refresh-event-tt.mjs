#!/usr/bin/env node
/**
 * Подтягивает id ивентовых заданий из TarkovTracker и переписывает блок TT_IDS в src/data/eventTasks.ts.
 *
 * Зачем: прогресс из TarkovTracker приходит по их id, а у наших ивентовых заданий id синтетические
 * (`hw-…`), потому что в tarkov.dev ивента нет. Скрипт сопоставляет по названию и дописывает id —
 * тогда импорт прогресса помечает ивентовые задания автоматически.
 *
 * Запуск: node scripts/refresh-event-tt.mjs [--dry]
 * TT добавляет квесты постепенно: пока известно только «Rumors», остальное появится позже.
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILE = path.join(ROOT, 'src', 'data', 'eventTasks.ts')
const URL = 'https://tarkovtracker.org/api/tarkov/tasks-core?gameMode=regular&lang=en'
const dry = process.argv.includes('--dry')

const norm = (s) => s.toLowerCase().replace(/^halloween:\s*/, '').replace(/[^\p{L}\p{N}]/gu, '')

async function main() {
  const res = await fetch(URL, { headers: { 'User-Agent': 'Sherpa-event-tt/1.0 (+https://github.com/WOLF5ER/sherpa)' } })
  if (!res.ok) throw new Error(`TarkovTracker: HTTP ${res.status}`)
  const body = await res.json()
  const tasks = body?.data?.tasks ?? []
  if (tasks.length < 300) throw new Error(`TarkovTracker вернул ${tasks.length} задач — похоже на сбой, не трогаю файл`)

  const ttByName = new Map()
  for (const t of tasks) ttByName.set(norm(t.nameEn ?? t.name ?? ''), t.id)

  const src = await readFile(FILE, 'utf8')
  const defs = [...src.matchAll(/id: '(hw-[^']+)',\s*name: '[^']*',\s*nameEn: '([^']+)'/g)].map((m) => ({ id: m[1], nameEn: m[2] }))
  if (defs.length < 10) throw new Error(`в файле найдено ${defs.length} заданий — не похоже на eventTasks.ts`)

  const found = []
  const missing = []
  for (const d of defs) {
    const tt = ttByName.get(norm(d.nameEn))
    if (tt) found.push([d.id, tt])
    else missing.push(d.nameEn)
  }

  console.log(`в файле заданий: ${defs.length} | нашлось в TarkovTracker: ${found.length}`)
  for (const [id, tt] of found) console.log('  ', id, '->', tt)
  if (missing.length) console.log('ещё нет в TarkovTracker:', missing.length)

  const block = [
    '  /* tt-ids:start */',
    ...found.map(([id, tt]) => `  '${id}': '${tt}',`),
    '  /* tt-ids:end */',
  ].join('\n')

  const next = src.replace(/  \/\* tt-ids:start \*\/[\s\S]*?  \/\* tt-ids:end \*\//, block)
  if (next === src) { console.log('без изменений'); return }
  if (dry) { console.log('\n--dry: файл не изменён'); return }
  await writeFile(FILE, next, 'utf8')
  console.log('обновлён блок TT_IDS')
}

main().catch((e) => {
  console.error('ОШИБКА:', e.message)
  process.exit(1)
})
