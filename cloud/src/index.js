// Sherpa Sync — Cloudflare Worker.
// Роуты:
//   GET  /auth/discord?state=…   → редирект на Discord OAuth (state прокидывается как есть — его сгенерировал лаунчер)
//   GET  /auth/callback?code&state → обмен кода на профиль Discord, выдача токена Sherpa, редирект в лаунчер http://127.0.0.1:<port>/api/auth/callback
//   GET  /me                      → кто я (Bearer-токен)
//   GET  /state                   → снимок прогресса ({savedAt, keys}) или 204
//   PUT  /state                   → сохранить снимок (JSON ≤ 2 МБ, savedAt обязателен)
//   POST /logout                  → отозвать токен
//   GET  /raids                   → индекс истории рейдов {list, deleted} или 204
//   PUT  /raids                   → сохранить индекс
//   GET  /raids/<id>              → рейд с точками; PUT — сохранить; DELETE — удалить
// KV: tok:<token> → {id, name, avatar, at};  state:<discordId> → снимок (метаданные: savedAt)
//     raids:<discordId> → индекс;  raid:<discordId>:<raidId> → рейд

const MAX_RAID = 1024 * 1024
const RAID_ID = /^[a-z0-9]{6,40}$/

const MAX_STATE = 2 * 1024 * 1024
const TOKEN_TTL = 60 * 60 * 24 * 180 // полгода без входа — токен умирает

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
const text = (s, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

function decodeState(raw) {
  try {
    const s = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/')))
    const port = Number(s.port)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return null
    if (typeof s.nonce !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(s.nonce)) return null
    return { port, nonce: s.nonce }
  } catch { return null }
}

function randomToken() {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

async function auth(req, env) {
  const h = req.headers.get('authorization') || ''
  const m = /^Bearer ([a-f0-9]{64})$/.exec(h)
  if (!m) return null
  const raw = await env.SYNC.get(`tok:${m[1]}`)
  if (!raw) return null
  return { token: m[1], user: JSON.parse(raw) }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const p = url.pathname

    if (req.method === 'GET' && p === '/') return text('Sherpa Sync: жив.')

    if (req.method === 'GET' && p === '/auth/discord') {
      const st = url.searchParams.get('state') || ''
      if (!decodeState(st)) return text('bad state', 400)
      const q = new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID, response_type: 'code', scope: 'identify', prompt: 'none',
        redirect_uri: `${url.origin}/auth/callback`, state: st,
      })
      return Response.redirect(`https://discord.com/oauth2/authorize?${q}`, 302)
    }

    if (req.method === 'GET' && p === '/auth/callback') {
      const st = decodeState(url.searchParams.get('state') || '')
      const code = url.searchParams.get('code')
      if (!st || !code) return text('Discord не вернул код входа. Закрой вкладку и попробуй ещё раз из Sherpa.', 400)
      const tr = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code', code, redirect_uri: `${url.origin}/auth/callback`,
        }),
      })
      if (!tr.ok) return text(`Discord отказал в обмене кода (${tr.status}). Попробуй ещё раз из Sherpa.`, 502)
      const tok = await tr.json()
      const ur = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${tok.access_token}` } })
      if (!ur.ok) return text(`Discord не отдал профиль (${ur.status}).`, 502)
      const u = await ur.json()
      const user = {
        id: String(u.id),
        name: u.global_name || u.username || 'Discord',
        avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null,
        at: Date.now(),
      }
      const token = randomToken()
      await env.SYNC.put(`tok:${token}`, JSON.stringify(user), { expirationTtl: TOKEN_TTL })
      const back = new URL(`http://127.0.0.1:${st.port}/api/auth/callback`)
      back.searchParams.set('token', token)
      back.searchParams.set('nonce', st.nonce)
      return Response.redirect(back.toString(), 302)
    }

    // ── дальше только с токеном ──
    const a = await auth(req, env)
    if (!a) return json({ error: 'unauthorized' }, 401)

    if (req.method === 'GET' && p === '/me') return json(a.user)

    if (req.method === 'POST' && p === '/logout') {
      await env.SYNC.delete(`tok:${a.token}`)
      return json({ ok: true })
    }

    if (req.method === 'GET' && p === '/state') {
      const raw = await env.SYNC.get(`state:${a.user.id}`)
      if (!raw) return new Response(null, { status: 204 })
      return new Response(raw, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
    }

    if (req.method === 'PUT' && p === '/state') {
      const len = Number(req.headers.get('content-length') || 0)
      if (len > MAX_STATE) return json({ error: 'too large' }, 413)
      const body = await req.text()
      if (body.length > MAX_STATE) return json({ error: 'too large' }, 413)
      let snap
      try { snap = JSON.parse(body) } catch { return json({ error: 'bad json' }, 400) }
      if (!snap || typeof snap.savedAt !== 'number' || !snap.keys || typeof snap.keys !== 'object') return json({ error: 'bad snapshot' }, 400)
      // страховка от пустого снимка (свежий экземпляр без прогресса не должен затирать облако)
      const prof = snap.keys['sherpa:profile']
      if (typeof prof !== 'string' || prof.length < 50) return json({ error: 'empty snapshot' }, 400)
      // не даём старому снимку затереть новый (второй ПК с отставшими часами / гонка)
      const cur = await env.SYNC.getWithMetadata(`state:${a.user.id}`)
      const curAt = Number(cur?.metadata?.savedAt || 0)
      if (curAt > snap.savedAt) return json({ ok: false, stale: true, savedAt: curAt }, 409)
      await env.SYNC.put(`state:${a.user.id}`, body, { metadata: { savedAt: snap.savedAt } })
      return json({ ok: true, savedAt: snap.savedAt })
    }

    if (p === '/raids') {
      const key = `raids:${a.user.id}`
      if (req.method === 'GET') {
        const raw = await env.SYNC.get(key)
        if (!raw) return new Response(null, { status: 204 })
        return new Response(raw, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
      }
      if (req.method === 'PUT') {
        const body = await req.text()
        if (body.length > MAX_RAID) return json({ error: 'too large' }, 413)
        let idx
        try { idx = JSON.parse(body) } catch { return json({ error: 'bad json' }, 400) }
        if (!idx || !Array.isArray(idx.list) || !idx.deleted || typeof idx.deleted !== 'object') return json({ error: 'bad index' }, 400)
        await env.SYNC.put(key, body)
        return json({ ok: true })
      }
    }
    const rm = /^\/raids\/([a-z0-9]{6,40})$/.exec(p)
    if (rm) {
      const key = `raid:${a.user.id}:${rm[1]}`
      if (req.method === 'GET') {
        const raw = await env.SYNC.get(key)
        if (!raw) return json({ error: 'not found' }, 404)
        return new Response(raw, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
      }
      if (req.method === 'PUT') {
        const body = await req.text()
        if (body.length > MAX_RAID) return json({ error: 'too large' }, 413)
        let r
        try { r = JSON.parse(body) } catch { return json({ error: 'bad json' }, 400) }
        if (!r || r.id !== rm[1] || !Array.isArray(r.points)) return json({ error: 'bad raid' }, 400)
        await env.SYNC.put(key, body)
        return json({ ok: true })
      }
      if (req.method === 'DELETE') {
        await env.SYNC.delete(key)
        return json({ ok: true })
      }
    }

    return json({ error: 'not found' }, 404)
  },
}
