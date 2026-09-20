// DELETE /api/devices/:id -> 删除设备及其全部 IP 和端口（需删除密码）
import { checkDeleteAuth } from '../../_auth.js';

export async function onRequestDelete(context) {
  const authErr = checkDeleteAuth(context);
  if (authErr) return authErr;

  const id = Number(context.params.id);
  if (!id) {
    return Response.json({ error: '无效ID' }, { status: 400 });
  }
  // 级联删除：先删该设备下的端口和IP，再删设备
  await context.env.DB.prepare('DELETE FROM navs WHERE device_id = ?').bind(id).run();
  await context.env.DB.prepare('DELETE FROM ips WHERE device_id = ?').bind(id).run();
  await context.env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(id).run();
  return Response.json({ success: true });
}
