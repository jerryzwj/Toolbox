// GET  /api/navs?device_id=N -> 查询端口（可按设备筛选）
// POST /api/navs -> 新增端口 { device_id, name, port }
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const deviceId = Number(url.searchParams.get('device_id'));

  if (deviceId) {
    const { results } = await context.env.DB.prepare(
      'SELECT id, device_id, name, port FROM navs WHERE device_id = ? ORDER BY id ASC'
    ).bind(deviceId).all();
    return Response.json(results);
  }
  const { results } = await context.env.DB.prepare(
    'SELECT id, device_id, name, port FROM navs ORDER BY id ASC'
  ).all();
  return Response.json(results);
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }
  const deviceId = Number(body && body.device_id);
  const name = (body && body.name ? String(body.name).trim() : '');
  const port = (body && body.port ? String(body.port).trim() : '');

  if (!deviceId) {
    return Response.json({ error: '请选择所属设备' }, { status: 400 });
  }
  if (!name || !port) {
    return Response.json({ error: '服务名称和端口不能为空' }, { status: 400 });
  }
  const res = await context.env.DB.prepare(
    'INSERT INTO navs (device_id, name, port) VALUES (?, ?, ?)'
  ).bind(deviceId, name, port).run();
  const row = await context.env.DB.prepare(
    'SELECT id, device_id, name, port FROM navs WHERE id = ?'
  ).bind(res.meta.last_row_id).first();
  return Response.json(row, { status: 201 });
}
