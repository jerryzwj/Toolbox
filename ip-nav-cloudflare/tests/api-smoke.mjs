// API 冒烟测试：用内存 Mock 模拟 D1，验证 devices/ips/navs 增删查 + 删除密码校验 + 级联删除
import assert from 'node:assert';

const store = { devices: [], ips: [], navs: [] };
let nextId = { devices: 1, ips: 1, navs: 1 };

// 模拟 D1 的 prepare().bind().all()/first()/run()（支持 SELECT/DELETE 的 WHERE 条件）
const mockDB = {
  prepare(sql) {
    let bound = [];
    const stmt = {
      bind(...args) { bound = args; return stmt; },
      async all() {
        const m = sql.match(/FROM\s+(\w+)(?:\s+WHERE\s+(\w+)\s*=\s*\?)?/i);
        const table = m[1];
        const col = m[2];
        let rows = store[table].map(r => ({ ...r }));
        if (col) rows = rows.filter(r => r[col] === bound[0]);
        return { results: rows };
      },
      async first() {
        const table = sql.match(/FROM\s+(\w+)\s+WHERE id = \?/i)[1];
        const row = store[table].find(r => r.id === bound[0]);
        return row ? { ...row } : null;
      },
      async run() {
        if (/^DELETE/i.test(sql)) {
          const m = sql.match(/^DELETE FROM\s+(\w+)(?:\s+WHERE\s+(\w+)\s*=\s*\?)?/i);
          const table = m[1];
          const col = m[2];
          store[table] = store[table].filter(r => col ? r[col] !== bound[0] : true);
          return { success: true, meta: { changes: 1 } };
        }
        const table = sql.match(/INSERT INTO\s+(\w+)/)[1];
        const id = nextId[table]++;
        const rec = { id, created_at: 'now' };
        if (table === 'devices') rec.name = bound[0];
        if (table === 'ips') { rec.device_id = bound[0]; rec.value = bound[1]; }
        if (table === 'navs') { rec.device_id = bound[0]; rec.name = bound[1]; rec.port = bound[2]; }
        // 模拟 UNIQUE 约束（与 schema.sql 一致）
        if (table === 'devices' && store.devices.some(r => r.name === rec.name)) {
          throw new Error('UNIQUE constraint failed: devices.name');
        }
        if (table === 'ips' && store.ips.some(r => r.device_id === rec.device_id && r.value === rec.value)) {
          throw new Error('UNIQUE constraint failed: ips.device_id, ips.value');
        }
        store[table].push(rec);
        return { success: true, meta: { last_row_id: id, changes: 1 } };
      }
    };
    return stmt;
  }
};

function makeCtx(overrides = {}) {
  return {
    env: { DB: mockDB },
    params: {},
    request: new Request('http://local', { method: 'GET' }),
    ...overrides
  };
}
function jsonReq(body, method = 'POST') {
  return new Request('http://local', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}
function delCtx(id, password, extraEnv = {}) {
  return makeCtx({
    params: { id: String(id) },
    request: new Request('http://local', {
      method: 'DELETE',
      headers: password === undefined ? {} : { 'x-delete-password': password }
    }),
    env: { DB: mockDB, DELETE_PASSWORD: 'secret123', ...extraEnv }
  });
}

const { onRequestGet: getDevices, onRequestPost: postDevice } = await import('../functions/api/devices.js');
const { onRequestDelete: delDevice } = await import('../functions/api/devices/[id].js');
const { onRequestGet: getIps, onRequestPost: postIp } = await import('../functions/api/ips.js');
const { onRequestDelete: delIp } = await import('../functions/api/ips/[id].js');
const { onRequestGet: getNavs, onRequestPost: postNav } = await import('../functions/api/navs.js');
const { onRequestDelete: delNav } = await import('../functions/api/navs/[id].js');

// ===== 设备 =====
let res = await getDevices(makeCtx());
assert.deepStrictEqual(await res.json(), []);
console.log('PASS: GET /api/devices (空列表)');

res = await postDevice(makeCtx({ request: jsonReq({ name: '客厅软路由' }) }));
assert.strictEqual(res.status, 201);
const dev1 = await res.json();
assert.strictEqual(dev1.name, '客厅软路由');
console.log('PASS: POST /api/devices');

res = await postDevice(makeCtx({ request: jsonReq({ name: '客厅软路由' }) }));
assert.strictEqual(res.status, 409, '重名设备应拒绝');
console.log('PASS: POST /api/devices (重名 -> 409)');

res = await postDevice(makeCtx({ request: jsonReq({ name: '  ' }) }));
assert.strictEqual(res.status, 400);
console.log('PASS: POST /api/devices (空值 -> 400)');

res = await getDevices(makeCtx());
assert.strictEqual((await res.json()).length, 1);
console.log('PASS: GET /api/devices (1条)');

// ===== IP =====
res = await getIps(makeCtx());
assert.deepStrictEqual(await res.json(), []);
console.log('PASS: GET /api/ips (空列表)');

res = await postIp(makeCtx({ request: jsonReq({ value: '192.168.1.5' }) }));
assert.strictEqual(res.status, 400, '缺少设备应拒绝');
console.log('PASS: POST /api/ips (未选设备 -> 400)');

res = await postIp(makeCtx({ request: jsonReq({ device_id: dev1.id, value: '192.168.1.5' }) }));
assert.strictEqual(res.status, 201);
const ip1 = await res.json();
assert.strictEqual(ip1.device_id, dev1.id);
assert.strictEqual(ip1.value, '192.168.1.5');
console.log('PASS: POST /api/ips (绑定设备)');

res = await postIp(makeCtx({ request: jsonReq({ device_id: dev1.id, value: '192.168.1.5' }) }));
assert.strictEqual(res.status, 409, '同设备重复IP应拒绝');
console.log('PASS: POST /api/ips (同设备重复 -> 409)');

res = await getIps(makeCtx({ request: new Request('http://local/api/ips?device_id=' + dev1.id, { method: 'GET' }) }));
assert.strictEqual((await res.json()).length, 1);
console.log('PASS: GET /api/ips (按设备筛选)');

// ===== 端口 =====
res = await postNav(makeCtx({ request: jsonReq({ device_id: dev1.id, name: '管理后台', port: '8080' }) }));
assert.strictEqual(res.status, 201);
const nav1 = await res.json();
assert.strictEqual(nav1.device_id, dev1.id);
console.log('PASS: POST /api/navs');

res = await getNavs(makeCtx({ request: new Request('http://local/api/navs?device_id=' + dev1.id, { method: 'GET' }) }));
assert.strictEqual((await res.json()).length, 1);
console.log('PASS: GET /api/navs (按设备筛选)');

res = await postNav(makeCtx({ request: jsonReq({ device_id: dev1.id, name: '', port: '80' }) }));
assert.strictEqual(res.status, 400);
console.log('PASS: POST /api/navs (空值 -> 400)');

// ===== 删除密码校验 =====
res = await delDevice(makeCtx({
  params: { id: String(dev1.id) },
  request: new Request('http://local', { method: 'DELETE' })
}));
assert.strictEqual(res.status, 500, '未配置环境变量应拒绝');
console.log('PASS: DELETE /api/devices (未配置环境变量 -> 500)');

res = await delDevice(delCtx(dev1.id, undefined));
assert.strictEqual(res.status, 401, '不带密码应拒绝');
console.log('PASS: DELETE /api/devices (未输入密码 -> 401)');

res = await delIp(delCtx(ip1.id, 'wrong'));
assert.strictEqual(res.status, 401);
res = await delNav(delCtx(nav1.id, 'wrong'));
assert.strictEqual(res.status, 401);
console.log('PASS: DELETE ips/navs (密码错误 -> 401)');

// 密码正确：删除设备 -> 级联删除其 IP 和端口
res = await delDevice(delCtx(dev1.id, 'secret123'));
assert.strictEqual(res.status, 200);
res = await getDevices(makeCtx());
assert.strictEqual((await res.json()).length, 0);
res = await getIps(makeCtx());
assert.strictEqual((await res.json()).length, 0, '级联删除IP');
res = await getNavs(makeCtx());
assert.strictEqual((await res.json()).length, 0, '级联删除端口');
console.log('PASS: DELETE /api/devices (密码正确 -> 200，级联删除IP和端口)');

// 单独删除IP/端口（正确密码）
const dev2 = (await (await postDevice(makeCtx({ request: jsonReq({ name: 'NAS' }) }))).json());
const ip2 = (await (await postIp(makeCtx({ request: jsonReq({ device_id: dev2.id, value: '10.0.0.2' }) }))).json());
const nav2 = (await (await postNav(makeCtx({ request: jsonReq({ device_id: dev2.id, name: 'SMB', port: '445' }) }))).json());

res = await delIp(delCtx(ip2.id, 'secret123'));
assert.strictEqual(res.status, 200);
res = await delNav(delCtx(nav2.id, 'secret123'));
assert.strictEqual(res.status, 200);
res = await getIps(makeCtx());
assert.strictEqual((await res.json()).length, 0);
res = await getNavs(makeCtx());
assert.strictEqual((await res.json()).length, 0);
console.log('PASS: DELETE ips/navs (密码正确 -> 200)');

console.log('\nALL TESTS PASSED');
