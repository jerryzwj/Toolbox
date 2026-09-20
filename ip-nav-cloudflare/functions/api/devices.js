// GET  /api/devices   -> 设备列表
// POST /api/devices   -> 新增设备 { name }
export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    'SELECT id, name FROM devices ORDER BY id ASC'
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
  const name = (body && body.name ? String(body.name).trim() : '');
  if (!name) {
    return Response.json({ error: '设备名称不能为空' }, { status: 400 });
  }
  try {
    const res = await context.env.DB.prepare(
      'INSERT INTO devices (name) VALUES (?)'
    ).bind(name).run();
    const row = await context.env.DB.prepare(
      'SELECT id, name FROM devices WHERE id = ?'
    ).bind(res.meta.last_row_id).first();
    return Response.json(row, { status: 201 });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return Response.json({ error: '该设备名称已存在' }, { status: 409 });
    }
    throw e;
  }
}
