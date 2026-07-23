// ===================== 核心配置区【D1 数据库方案】=====================

// 配置来源：Cloudflare D1 数据库
// 需在 Worker 设置中绑定 D1，绑定变量名默认为 DB（可修改下方 D1_BINDING_NAME）
//
// 表结构（首次请求时由 Worker 自动创建，无需手动建表）：
// CREATE TABLE IF NOT EXISTS proxy_config (
//   id INTEGER PRIMARY KEY AUTOINCREMENT,
//   name TEXT NOT NULL UNIQUE,
//   target_url TEXT NOT NULL,
//   sort_order INTEGER DEFAULT 0,
//   created_at TEXT DEFAULT (datetime('now'))
// );
//
// 插入配置示例：
// INSERT INTO proxy_config (name, target_url, sort_order) VALUES ('奈小星资源', 'https://naixxzy.com/api.php/provide/vod', 1);
// INSERT INTO proxy_config (name, target_url, sort_order) VALUES ('红杉资源', 'https://hsckzy.xyz/api.php/provide/vod', 2);
// INSERT INTO proxy_config (name, target_url, sort_order) VALUES ('IPTV自定义列表', 'https://raw.githubusercontent.com/jerryzwj/tvjson/refs/heads/main/iptv_custom%20(2).m3u', 3);
//
// 更新/删除示例：
// UPDATE proxy_config SET target_url='新地址' WHERE name='红杉资源';
// DELETE FROM proxy_config WHERE name='红杉资源';

const D1_BINDING_NAME = "DB"; // D1 绑定变量名（需与 Worker 设置中的绑定一致）
const TIMEOUT = 10000; // 请求超时时间 10秒
const CACHE_TTL = 300; // 配置内存缓存时间 5分钟（同时用于代理请求的边缘缓存）

// -------------------- 页面管理接口配置 --------------------
// 在 Worker 设置中配置环境变量 ADMIN_PASSWORD（建议用 Secret 类型），作为页面管理功能的密码
// 未配置 ADMIN_PASSWORD 时，管理功能禁用（默认安全，任何人无法通过页面增删配置）
// 配置后：访问根页面 → 点击"管理"按钮 → 输入密码，即可在网页上增/删配置项
const ADMIN_PATH_PREFIX = "/__admin"; // 管理接口路径前缀（避开 /1 /2 等数字代理路径）

// 内存缓存（避免每次请求都查询 D1，Workers 实例级缓存）
let configCache = { data: null, expireAt: 0 };

// 从 D1 数据库读取并组装配置
async function fetchRemoteConfig(env) {
  // 命中内存缓存直接返回
  const now = Date.now();
  if (configCache.data && configCache.expireAt > now) {
    return configCache.data;
  }

  try {
    const db = env && env[D1_BINDING_NAME];
    if (!db) {
      throw new Error(`未绑定 D1 数据库（绑定变量名需为 "${D1_BINDING_NAME}"）`);
    }

    // 自动创建数据表（IF NOT EXISTS 幂等，首次绑定 D1 后即可直接使用）
    await db
      .prepare(`CREATE TABLE IF NOT EXISTS proxy_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        target_url TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`)
      .run();

    // 查询全部配置，按 sort_order 排序以保持代理路径顺序（/1、/2、/3...）
    const { results } = await db
      .prepare("SELECT name, target_url FROM proxy_config ORDER BY sort_order ASC, id ASC")
      .all();

    if (!results || results.length === 0) {
      // 表为空：返回空配置（不写缓存），让前端页面显示管理入口以便添加首条数据
      // 不写缓存的原因：用户添加数据后能立即生效，无需等待缓存过期
      return {};
    }

    // 组装为 { 名称: targetUrl } 对象（与原 PROXY_MAP 格式完全一致）
    const proxyMap = {};
    for (const row of results) {
      proxyMap[row.name] = row.target_url;
    }

    // 写入内存缓存
    configCache = { data: proxyMap, expireAt: now + CACHE_TTL * 1000 };
    return proxyMap;
  } catch (error) {
    console.error("D1 配置读取异常：", error.message);
    throw error; // 抛出错误，让主逻辑处理兜底
  }
}

// -------------------- 管理接口实现 --------------------

// HTML 转义，防止配置名称中的特殊字符破坏页面或引发 XSS
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 清空配置内存缓存（增删配置后调用，使下次请求重新读取 D1）
function invalidateConfigCache() {
  configCache = { data: null, expireAt: 0 };
}

// 统一 JSON 响应
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// 确保数据表存在（管理接口也兜底建表，空表场景下也能添加首条配置）
async function ensureTable(db) {
  await db
    .prepare(`CREATE TABLE IF NOT EXISTS proxy_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      target_url TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
    .run();
}

// 校验管理密码，返回 { ok } 或 { ok:false, response }
function checkAdminAuth(request, env) {
  const adminPwd = env && env.ADMIN_PASSWORD;
  if (!adminPwd) {
    return { ok: false, response: jsonResponse({ code: 403, msg: '管理功能未启用：未配置 ADMIN_PASSWORD 环境变量' }, 403) };
  }
  const provided = request.headers.get('X-Admin-Password') || '';
  if (provided !== adminPwd) {
    return { ok: false, response: jsonResponse({ code: 401, msg: '密码错误' }, 401) };
  }
  return { ok: true };
}

// 处理管理接口请求（返回 Response 或 null 表示非管理请求）
// GET  /__admin/config  → 列出全部配置（需密码）
// POST /__admin/config  → 增/删配置（需密码），body: {action:"add"|"delete", name, target_url?, sort_order?}
async function handleAdmin(request, env, url) {
  const pathname = url.pathname;
  if (!pathname.startsWith(ADMIN_PATH_PREFIX)) {
    return null; // 非管理请求，交回主流程
  }

  // 管理接口单独处理 OPTIONS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  const auth = checkAdminAuth(request, env);
  if (!auth.ok) {
    return auth.response;
  }

  const db = env && env[D1_BINDING_NAME];
  if (!db) {
    return jsonResponse({ code: 500, msg: `未绑定 D1 数据库（变量名 ${D1_BINDING_NAME}）` }, 500);
  }

  await ensureTable(db);

  const isConfigPath = pathname === ADMIN_PATH_PREFIX || pathname === ADMIN_PATH_PREFIX + '/config';

  // 列出全部配置
  if (request.method === 'GET' && isConfigPath) {
    const { results } = await db
      .prepare("SELECT name, target_url, sort_order FROM proxy_config ORDER BY sort_order ASC, id ASC")
      .all();
    return jsonResponse({ code: 0, msg: 'ok', data: results || [] });
  }

  // 增/删配置
  if (request.method === 'POST' && isConfigPath) {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ code: 400, msg: '请求体不是合法 JSON' }, 400);
    }

    const { action, name, target_url, sort_order } = body || {};
    if (!name || typeof name !== 'string') {
      return jsonResponse({ code: 400, msg: '缺少 name 参数' }, 400);
    }

    try {
      if (action === 'add') {
        if (!target_url || typeof target_url !== 'string') {
          return jsonResponse({ code: 400, msg: '缺少 target_url 参数' }, 400);
        }
        // 未指定顺序时自动追加到末尾（max+1）
        let order = sort_order == null ? null : Number(sort_order);
        if (order === null || !Number.isFinite(order)) {
          const maxRow = await db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM proxy_config").first();
          order = (maxRow && maxRow.m ? maxRow.m : 0) + 1;
        }
        // 同名覆盖，便于直接修改 URL/顺序
        await db
          .prepare("INSERT OR REPLACE INTO proxy_config (name, target_url, sort_order) VALUES (?, ?, ?)")
          .bind(name, target_url, order)
          .run();
        invalidateConfigCache();
        return jsonResponse({ code: 0, msg: '添加/更新成功' });
      }

      if (action === 'delete') {
        await db
          .prepare("DELETE FROM proxy_config WHERE name = ?")
          .bind(name)
          .run();
        invalidateConfigCache();
        return jsonResponse({ code: 0, msg: '删除成功' });
      }

      return jsonResponse({ code: 400, msg: '不支持的 action（仅支持 add/delete）' }, 400);
    } catch (err) {
      return jsonResponse({ code: 500, msg: '操作失败', error: String(err) }, 500);
    }
  }

  return jsonResponse({ code: 404, msg: '管理接口不存在' }, 404);
}

// 执行实际代理请求（子域名透传与路径代理共用）
// targetUrl 为已构造好的完整目标地址（含查询参数）
async function proxyRequest(targetUrl, request) {
  try {
    const requestConfig = {
      method: request.method,
      headers: new Headers(request.headers),
      body: request.body,
      redirect: 'follow',
      cf: { cacheTtl: CACHE_TTL, cacheEverything: true }
    };

    // 防403反爬：伪装请求头
    requestConfig.headers.set('Origin', targetUrl.origin);
    requestConfig.headers.set('Referer', targetUrl.href);
    requestConfig.headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36');
    requestConfig.headers.delete('cookie'); // 清除本地cookie，避免目标站验证
    requestConfig.headers.delete('host');   // 重置host为目标站host

    // 代理请求超时处理
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject('代理请求超时（超过10秒）'), TIMEOUT)
    );
    const response = await Promise.race([
      fetch(targetUrl, requestConfig),
      timeoutPromise
    ]);

    // 构造代理响应，添加跨域和缓存头
    const proxyRes = new Response(response.body, response);
    proxyRes.headers.set('Access-Control-Allow-Origin', '*');
    proxyRes.headers.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
    proxyRes.headers.delete('Content-Security-Policy'); // 移除防嵌入限制
    proxyRes.headers.delete('X-Frame-Options');         // 允许跨域嵌入
    return proxyRes;
  } catch (err) {
    // 代理请求异常：JSON格式兜底返回
    return new Response(JSON.stringify({
      code: 500,
      msg: '代理请求失败',
      error: String(err)
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

// Worker主入口
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 管理接口优先分流（不依赖配置读取，便于空表时也能添加首条配置）
    const adminRes = await handleAdmin(request, env, url);
    if (adminRes) {
      return adminRes;
    }

    let PROXY_MAP = null;
    try {
      // 第一步：从 D1 数据库读取配置
      PROXY_MAP = await fetchRemoteConfig(env);
    } catch (error) {
      // 配置读取失败：兜底响应，提示错误
      return new Response(`
        <div style="text-align:center;margin-top:100px;font-size:18px;color:red;">
          ❌ 代理服务启动失败<br><br>
          原因：${error.message}<br><br>
          请检查：1) Worker 是否已绑定 D1 数据库（变量名 ${D1_BINDING_NAME}）；2) proxy_config 表是否已创建并插入配置项
        </div>
      `, {
        status: 503,
        headers: {
          'Content-Type': 'text/html;charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 以下为原有核心逻辑，完全保留（无需修改）
    const pathname = url.pathname;
    // 将配置转为数组，子域名 N.域名 与兼容路径 /N 均按数组索引映射（第 N 项 → 索引 N-1）
    const proxyArray = Object.entries(PROXY_MAP);
    // 解析访问路径（如/1对应索引0，/2对应索引1）
    const pathIndex = pathname.replace(/^\//, '');
    const targetItem = proxyArray[Number(pathIndex) - 1];

    // 处理跨域预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Admin-Password',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // ===== 子域名透传代理（推荐方式）=====
    // 访问 N.主域名/任意路径 → 透传到第 N 个目标站对应路径
    // 整站代理：页面内相对/绝对路径链接均基于子域名解析，下级菜单天然正常
    const hostParts = url.hostname.split('.');
    const subPrefix = hostParts[0];
    const subIndex = Number(subPrefix);
    const subItem = proxyArray[subIndex - 1];
    // 判定子域名代理：首段为正整数、至少两段域名、对应配置存在
    if (/^\d+$/.test(subPrefix) && subIndex >= 1 && hostParts.length >= 2 && subItem) {
      const [, targetUrlStr] = subItem;
      const targetBase = new URL(targetUrlStr);
      let targetUrl;
      if (pathname === '/' || pathname === '') {
        // 根路径：映射到配置的完整 URL（含原 path），保持入口兼容
        targetUrl = new URL(targetUrlStr);
      } else {
        // 子路径：基于目标站 origin 透传任意路径
        targetUrl = new URL(targetBase.origin);
        targetUrl.pathname = pathname;
      }
      targetUrl.search = url.search; // 透传查询参数
      return await proxyRequest(targetUrl, request);
    }

    // ===== 路径代理（兼容旧方式 域名/N，仅透传查询参数）=====
    // @ts-ignore
    if (!isNaN(pathIndex) && targetItem) {
      const [name, targetUrlStr] = targetItem;
      const targetUrl = new URL(targetUrlStr);
      targetUrl.search = url.search; // 透传所有请求参数
      return await proxyRequest(targetUrl, request);
    }
// 根路径（域名/）：渲染代理列表页面（显示名称+代理地址+被代理地址）
const proxyListHtml = proxyArray.map(([name, targetUrlStr], index) => {
  const proxyUrl = `https://${index + 1}.${url.hostname}`; // 子域名代理地址（1.域名、2.域名）整站透传
  const originalUrl = targetUrlStr; // 被代理的原始地址（从远程配置中读取）
  
  // 显示格式：名称：可点击代理地址 → 被代理原始地址（高亮可点击跳转新页面）→ 删除按钮（管理模式下显示）
  return `<div class="proxy-item" data-url="${originalUrl}" data-name="${encodeURIComponent(name)}">
    ${escapeHtml(name)}：<a href="${proxyUrl}" target="_blank" style="color:#1677ff;text-decoration:none;">${proxyUrl}</a> →
    <a href="${originalUrl}" target="_blank" style="color:#fa8c16;font-weight:bold;text-decoration:underline;">${originalUrl}</a>
    <button class="edit-btn" style="display:none;margin-left:10px;padding:2px 8px;font-size:12px;border:none;border-radius:4px;background:#1677ff;color:white;cursor:pointer;">编辑</button>
    <button class="del-btn" style="display:none;margin-left:10px;padding:2px 8px;font-size:12px;border:none;border-radius:4px;background:#ff4d4f;color:white;cursor:pointer;">删除</button>
  </div>`;
}).join('');

// 空表时显示提示，引导用户通过管理面板添加首条配置
const listHtml = proxyArray.length > 0
  ? proxyListHtml
  : '<div style="text-align:center;color:#999;padding:40px 0;font-size:15px;">暂无代理配置，请点击右上角「管理」按钮添加</div>';

return new Response(`
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>多站代理服务</title>
    <style>
      body{margin:0;padding:20px;font-family:Arial,sans-serif;background:#f5f5f5;}
      .container{max-width:1000px;margin:50px auto;background:#fff;padding:30px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.1);}
      h1{text-align:center;color:#333;margin-bottom:30px;}
      a{word-break:break-all;}
      span{word-break:break-all;}
      .proxy-item{margin-bottom:10px;line-height:1.8;}
      .admin-bar{text-align:right;margin-bottom:15px;}
      #admin-panel{margin-bottom:20px;padding:15px;border:1px dashed #722ed1;border-radius:6px;background:#faf5ff;}
      .admin-input{padding:6px 8px;font-size:13px;border:1px solid #d9d9d9;border-radius:4px;}
      .admin-btn{padding:6px 14px;font-size:13px;border:none;border-radius:4px;cursor:pointer;color:#fff;}
    </style>
  </head>
  <body>
    <div class="container">
      <h1>✅ 多站代理服务运行中</h1>
      <div class="admin-bar">
        <button id="admin-toggle" class="admin-btn" style="background:#722ed1;">管理</button>
      </div>
      <div id="admin-panel" style="display:none;">
        <div id="auth-area">
          <label style="font-size:13px;">管理密码：</label>
          <input id="admin-pwd" type="password" placeholder="输入管理密码" class="admin-input">
          <button id="login-btn" class="admin-btn" style="background:#722ed1;">登录</button>
        </div>
        <div id="manage-area" style="display:none;">
          <div style="font-size:14px;font-weight:bold;color:#722ed1;margin-bottom:10px;">添加 / 更新配置（同名将覆盖）</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <input id="m-name" placeholder="名称" class="admin-input" style="flex:1;min-width:140px;">
            <input id="m-url" placeholder="目标 URL" class="admin-input" style="flex:2;min-width:200px;">
            <input id="m-order" type="number" placeholder="顺序(可空)" class="admin-input" style="width:110px;">
            <button id="add-btn" class="admin-btn" style="background:#52c41a;">添加/更新</button>
          </div>
          <div id="admin-msg" style="font-size:12px;min-height:16px;"></div>
          <button id="logout-btn" style="margin-top:8px;padding:4px 12px;font-size:12px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;color:#666;cursor:pointer;">退出管理</button>
        </div>
      </div>
      <div style="font-size:16px;">${listHtml}</div>
    </div>
    <script>
      var ADMIN_API = '/__admin/config';
      var adminPwd = sessionStorage.getItem('adminPwd') || '';
      var adminToggle = document.getElementById('admin-toggle');
      var adminPanel = document.getElementById('admin-panel');
      var authArea = document.getElementById('auth-area');
      var manageArea = document.getElementById('manage-area');
      var adminMsg = document.getElementById('admin-msg');
      var adminConfigData = []; // 登录后缓存的完整配置（含 sort_order，供编辑时回填）

      function showMsg(text, ok) {
        adminMsg.textContent = text;
        adminMsg.style.color = ok ? '#52c41a' : '#ff4d4f';
        setTimeout(function() { adminMsg.textContent = ''; }, 3000);
      }

      function setEditBtnsVisible(visible) {
        var btns = document.querySelectorAll('.edit-btn');
        for (var i = 0; i < btns.length; i++) { btns[i].style.display = visible ? 'inline-block' : 'none'; }
      }

      function enterManageMode() {
        authArea.style.display = 'none';
        manageArea.style.display = 'block';
        var btns = document.querySelectorAll('.del-btn');
        for (var i = 0; i < btns.length; i++) { btns[i].style.display = 'inline-block'; }
        setEditBtnsVisible(true);
      }

      function exitManageMode() {
        adminPwd = '';
        adminConfigData = [];
        sessionStorage.removeItem('adminPwd');
        authArea.style.display = 'block';
        manageArea.style.display = 'none';
        var btns = document.querySelectorAll('.del-btn');
        for (var i = 0; i < btns.length; i++) { btns[i].style.display = 'none'; }
        setEditBtnsVisible(false);
        var pwdInput = document.getElementById('admin-pwd');
        if (pwdInput) pwdInput.value = '';
      }

      adminToggle.addEventListener('click', function() {
        adminPanel.style.display = adminPanel.style.display === 'none' ? 'block' : 'none';
        if (adminPwd) enterManageMode();
      });

      document.getElementById('login-btn').addEventListener('click', function() {
        var pwd = document.getElementById('admin-pwd').value.trim();
        if (!pwd) { showMsg('请输入密码', false); return; }
        fetch(ADMIN_API, { headers: { 'X-Admin-Password': pwd } })
          .then(function(res) { return res.json().then(function(d) { return { status: res.status, data: d }; }); })
          .then(function(r) {
            if (r.status === 200 && r.data.code === 0) {
              adminPwd = pwd;
              adminConfigData = r.data.data || [];
              sessionStorage.setItem('adminPwd', pwd);
              enterManageMode();
              showMsg('登录成功', true);
            } else {
              showMsg(r.data.msg || '登录失败', false);
            }
          })
          .catch(function(e) { showMsg('网络错误：' + e.message, false); });
      });

      document.getElementById('add-btn').addEventListener('click', function() {
        var name = document.getElementById('m-name').value.trim();
        var target_url = document.getElementById('m-url').value.trim();
        var sort_order = document.getElementById('m-order').value.trim();
        if (!name || !target_url) { showMsg('名称和 URL 必填', false); return; }
        fetch(ADMIN_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPwd },
          body: JSON.stringify({ action: 'add', name: name, target_url: target_url, sort_order: sort_order ? Number(sort_order) : null })
        })
          .then(function(res) { return res.json().then(function(d) { return { status: res.status, data: d }; }); })
          .then(function(r) {
            if (r.status === 200 && r.data.code === 0) {
              showMsg('添加/更新成功，刷新中...', true);
              setTimeout(function() { location.reload(); }, 600);
            } else {
              showMsg(r.data.msg || '操作失败', false);
              if (r.status === 401) exitManageMode();
            }
          })
          .catch(function(e) { showMsg('网络错误：' + e.message, false); });
      });

      var delBtns = document.querySelectorAll('.del-btn');
      for (var i = 0; i < delBtns.length; i++) {
        (function(btn) {
          btn.addEventListener('click', function() {
            var item = btn.closest('.proxy-item');
            var name = decodeURIComponent(item.dataset.name);
            if (!confirm('确认删除「' + name + '」？')) return;
            fetch(ADMIN_API, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPwd },
              body: JSON.stringify({ action: 'delete', name: name })
            })
              .then(function(res) { return res.json().then(function(d) { return { status: res.status, data: d }; }); })
              .then(function(r) {
                if (r.status === 200 && r.data.code === 0) {
                  showMsg('删除成功，刷新中...', true);
                  setTimeout(function() { location.reload(); }, 600);
                } else {
                  showMsg(r.data.msg || '删除失败', false);
                  if (r.status === 401) exitManageMode();
                }
              })
              .catch(function(e) { showMsg('网络错误：' + e.message, false); });
          });
        })(delBtns[i]);
      }

      // 编辑按钮：回填表单，修改后点"添加/更新"即覆盖（同名 INSERT OR REPLACE）
      var editBtns = document.querySelectorAll('.edit-btn');
      for (var i = 0; i < editBtns.length; i++) {
        (function(btn) {
          btn.addEventListener('click', function() {
            var item = btn.closest('.proxy-item');
            var name = decodeURIComponent(item.dataset.name);
            var targetUrl = item.dataset.url || '';
            document.getElementById('m-name').value = name;
            document.getElementById('m-url').value = targetUrl;
            // 从缓存数据中查找 sort_order 回填
            var order = '';
            for (var j = 0; j < adminConfigData.length; j++) {
              if (adminConfigData[j].name === name) { order = adminConfigData[j].sort_order; break; }
            }
            document.getElementById('m-order').value = order;
            document.getElementById('m-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.getElementById('m-url').focus();
            showMsg('正在编辑「' + name + '」，修改后点添加/更新', true);
          });
        })(editBtns[i]);
      }

      document.getElementById('logout-btn').addEventListener('click', exitManageMode);

      // 页面加载时若已有密码（sessionStorage），自动展开并进入管理模式
      // 同时拉取一次配置数据，供编辑按钮回填 sort_order
      if (adminPwd) {
        adminPanel.style.display = 'block';
        fetch(ADMIN_API, { headers: { 'X-Admin-Password': adminPwd } })
          .then(function(res) { return res.json(); })
          .then(function(d) {
            if (d.code === 0) {
              adminConfigData = d.data || [];
              enterManageMode();
            } else {
              showMsg('密码已失效，请重新登录', false);
              exitManageMode();
            }
          })
          .catch(function() { enterManageMode(); });
      }
    </script>
  </body>
  </html>
`, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
}
};
