// GET  /api/ips?device_id=N -> 查询IP（可按设备筛选）
// POST /api/ips -> 新增IP { device_id, value }
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const deviceId = Number(url.searchParams.get('device_id'));

  if (deviceId) {
    const { results } = await context.env.DB.prepare(
      'SELECT id, device_id, value FROM ips WHERE device_id = ? ORDER BY id ASC'
    ).bind(deviceId).all();
    return Response.json(results);
  }
  const { results } = await context.env.DB.prepare(
    'SELECT id, device_id, value FROM ips ORDER BY id ASC'
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
  const value = (body && body.value ? String(body.value).trim() : '');

  if (!deviceId) {
    return Response.json({ error: '请选择所属设备' }, { status: 400 });
  }
  if (!value) {
    return Response.json({ error: 'IP不能为空' }, { status: 400 });
  }
  try {
    const res = await context.env.DB.prepare(
      'INSERT INTO ips (device_id, value) VALUES (?, ?)'
    ).bind(deviceId, value).run();
    const row = await context.env.DB.prepare(
      'SELECT id, device_id, value FROM ips WHERE id = ?'
    ).bind(res.meta.last_row_id).first();
    return Response.json(row, { status: 201 });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return Response.json({ error: '该设备下已存在相同IP' }, { status: 409 });
    }
    throw e;
  }
}
