// DELETE /api/ips/:id -> 删除指定IP（需删除密码）
import { checkDeleteAuth } from '../../_auth.js';

export async function onRequestDelete(context) {
  const authErr = checkDeleteAuth(context);
  if (authErr) return authErr;

  const id = Number(context.params.id);
  if (!id) {
    return Response.json({ error: '无效ID' }, { status: 400 });
  }
  await context.env.DB.prepare('DELETE FROM ips WHERE id = ?').bind(id).run();
  return Response.json({ success: true });
}
