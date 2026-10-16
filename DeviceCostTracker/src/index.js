export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // API 路由
    if (path.startsWith('/api/')) {
      return handleApi(request, env, url);
    }

    // 静态资源由 [assets] 自动处理
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });
  }
};

async function handleApi(request, env, url) {
  const path = url.pathname;

  // 可选密码保护：设置 ADMIN_PASSWORD secret 后启用
  if (env.ADMIN_PASSWORD) {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace('Bearer ', '');
    if (token !== env.ADMIN_PASSWORD) {
      return json({ error: 'Unauthorized' }, 401);
    }
  }

  // GET /api/devices
  if (path === '/api/devices' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM devices ORDER BY CASE WHEN retire_date IS NULL THEN 0 ELSE 1 END, COALESCE(retire_date, buy_date) DESC'
    ).all();
    return json(results);
  }

  // POST /api/devices
  if (path === '/api/devices' && request.method === 'POST') {
    const body = await request.json();
    const id = body.id || genId();
    await env.DB.prepare(`
      INSERT INTO devices (id, name, icon, buy_price, buy_date, retire_date, sell_price)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.name,
      body.icon || '📱',
      body.buyPrice,
      body.buyDate,
      body.retireDate || null,
      body.sellPrice || 0
    ).run();
    return json({ id });
  }

  // PUT /api/devices/:id
  const putMatch = path.match(/^\/api\/devices\/(.+)$/);
  if (putMatch && request.method === 'PUT') {
    const id = putMatch[1];
    const body = await request.json();
    await env.DB.prepare(`
      UPDATE devices SET
        name = ?, icon = ?, buy_price = ?, buy_date = ?,
        retire_date = ?, sell_price = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      body.name,
      body.icon || '📱',
      body.buyPrice,
      body.buyDate,
      body.retireDate || null,
      body.sellPrice || 0,
      id
    ).run();
    return json({ ok: true });
  }

  // DELETE /api/devices/:id
  if (putMatch && request.method === 'DELETE') {
    const id = putMatch[1];
    await env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Not Found' }, 404);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
