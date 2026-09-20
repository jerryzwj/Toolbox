// 删除操作通用鉴权：密码来自环境变量 DELETE_PASSWORD
// 返回 null 表示通过，否则返回错误 Response（fail-closed）
export function checkDeleteAuth(context) {
  const expected = context.env.DELETE_PASSWORD;
  if (!expected) {
    return Response.json({ error: '未配置 DELETE_PASSWORD 环境变量，删除已禁用' }, { status: 500 });
  }
  const provided = context.request.headers.get('x-delete-password') || '';
  if (provided !== expected) {
    return Response.json({ error: '删除密码错误' }, { status: 401 });
  }
  return null;
}
