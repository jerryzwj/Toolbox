// 导出默认的 fetch 处理函数
export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};

/**
 * 处理请求并生成导航页面
 * @param {Request} request - 客户端请求
 * @param {Object} env - 环境变量，包含 D1 数据库绑定
 * @returns {Response} - 导航页面响应
 */
async function handleRequest(request, env) {
  try {
    // 检查是否为POST请求
    if (request.method === 'POST') {
      return handlePostRequest(request, env);
    }
    
    // 检查是否为DELETE请求（删除链接）
    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const deleteId = url.searchParams.get('delete');
      if (deleteId) {
        await deleteLinkFromD1(env.DB, deleteId);
        return new Response(JSON.stringify({ success: true, message: '删除成功' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // 解析请求路径
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // 检查是否为/:id路径，实现重定向
    if (pathname.length > 1) {
      const id = pathname.substring(1); // 移除开头的'/'
      try {
        const link = await fetchLinkById(env.DB, id);
        if (link) {
          return Response.redirect(link.url, 302);
        }
      } catch (error) {
        console.error('重定向查询失败:', error);
      }
    }
    
    // 检查是否需要强制刷新（通过URL参数判断）
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    
    let links = [];
    
    if (!forceRefresh) {
      // 从D1数据库读取所有链接数据
      links = await fetchLinksFromD1(env.DB);
    } else {
      // 强制刷新：从D1数据库读取链接
      console.log('强制刷新链接数据...');
      links = await fetchLinksFromD1(env.DB);
    }

    // 生成导航页面的HTML（带样式、适配移动端）
    const domain = url.origin; // 获取当前域名
    const html = generateNavigationHtml(links, domain);

    // 返回HTML响应
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache' // 避免缓存，修改后实时生效
      }
    });
  } catch (error) {
    // 异常处理：返回友好的错误页面
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>出错了</title></head>
      <body style="text-align:center; margin-top: 50px;">
        <h1>加载导航页面失败</h1>
        <p>错误信息：${error.message}</p>
        <p>请检查D1数据库是否绑定，或数据库配置是否正确</p>
      </body>
      </html>
    `, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

// 从D1数据库读取链接数据
async function fetchLinksFromD1(db) {
  try {
    // 执行SQL查询获取所有链接
    const result = await db.prepare('SELECT id, name, url, updated_at FROM redirect_links').all();
    
    // 构建链接数组
    const links = result.results.map(row => ({
      id: row.id.toString(),
      displayName: row.name,
      url: row.url,
      updatedAt: row.updated_at
    })).filter(link => link && link.url && link.url.startsWith('http'));
    
    return links;
  } catch (error) {
    console.error('从D1数据库读取链接失败:', error);
    // 尝试初始化数据库表
    await initD1Database(db);
    return [];
  }
}

// 根据id从D1数据库读取单个链接
async function fetchLinkById(db, id) {
  try {
    // 执行SQL查询获取指定id的链接
    const result = await db.prepare('SELECT url FROM redirect_links WHERE id = ?').bind(id).first();
    
    if (result) {
      return { url: result.url };
    }
    
    return null;
  } catch (error) {
    console.error('根据id查询链接失败:', error);
    throw error;
  }
}

// 从D1数据库删除链接
async function deleteLinkFromD1(db, id) {
  try {
    // 执行SQL删除语句
    const result = await db.prepare('DELETE FROM redirect_links WHERE id = ?').bind(id).run();
    
    console.log(`已删除链接 ID: ${id}, 影响行数: ${result.meta.changes}`);
    
    if (result.meta.changes === 0) {
      throw new Error('链接不存在或已被删除');
    }
    
    console.log('链接从D1数据库删除成功');
  } catch (error) {
    console.error('从D1数据库删除链接失败:', error);
    throw error;
  }
}

// 初始化D1数据库表
async function initD1Database(db) {
  try {
    // 创建redirect_links表
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS redirect_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    
    // 创建索引以提高查询性能
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_name ON redirect_links(name)').run();
    
    console.log('D1数据库表初始化成功');
  } catch (error) {
    console.error('初始化D1数据库表失败:', error);
  }
}

// 处理POST请求的函数
async function handlePostRequest(request, env) {
  try {
    // 解析请求体
    const contentType = request.headers.get('content-type');
    let postData;
    
    if (contentType === 'application/json') {
      postData = await request.json();
    } else {
      const formData = await request.formData();
      postData = {
        name: formData.get('name'),
        value: formData.get('value')
      };
    }
    
    // 验证参数
    const { name, value } = postData;
    if (!name) {
      return new Response(JSON.stringify({ error: '缺少name参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!value) {
      return new Response(JSON.stringify({ error: '缺少value参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 写入D1数据库
    await writeLinkToD1(env.DB, name, value);
    console.log(`已写入链接: ${name} => ${value}`);
    
    return new Response(JSON.stringify({ success: true, message: '写入成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('处理POST请求失败:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 写入链接到D1数据库
async function writeLinkToD1(db, name, url) {
  try {
    // 先尝试更新现有记录
    const updateResult = await db.prepare(`
      UPDATE redirect_links 
      SET url = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE name = ?
    `).bind(url, name).run();
    
    // 如果没有更新任何记录，则插入新记录
    if (updateResult.meta.changes === 0) {
      await db.prepare(`
        INSERT INTO redirect_links (name, url) 
        VALUES (?, ?)
      `).bind(name, url).run();
    }
    
    console.log('链接写入D1数据库成功');
  } catch (error) {
    console.error('写入D1数据库失败:', error);
    throw error;
  }
}

/**
 * 生成导航页面的HTML结构
 * @param {Array} links - 链接列表 [{displayName: '', url: ''}]
 * @returns {string} - 完整HTML字符串
 */
function generateNavigationHtml(links, domain) {
  // 链接为空时的提示
  const linksHtml = links.length > 0 
    ? links.map(link => `
        <div class="link-card">
          <div class="delete-btn" onclick="deleteLink('${link.id}', '${link.displayName}')">
            ×
          </div>
          <div class="link-content">
            <div class="link-name">
              <a href="${link.url}" target="_blank" rel="noopener noreferrer">
                ${link.displayName}
              </a>
              <span class="update-time">${link.updatedAt}</span>
            </div>
            <div class="link-id">
              <a href="/${link.id}" target="_blank" rel="noopener noreferrer">${domain}/${link.id}</a>
            </div>
          </div>
        </div>
      `).join('')
    : '<div class="empty-tip">暂无可用的导航链接，请先通过POST请求添加链接</div>';

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>IPV4动态公网监控</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background-color: #f5f5f7;
          padding: 20px;
        }
        .container { 
          max-width: 1200px; 
          margin: 0 auto; 
          background: white;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .links-container {
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
          margin-top: 20px;
        }
        .link-card {
          flex: 1 1 280px; /* 卡片最小宽度280px，可根据屏幕大小自动调整 */
          min-width: 0; /* 移除固定最小宽度，允许卡片缩小 */
          max-width: calc(33.333% - 10px); /* 最多一行显示3个卡片 */
          position: relative; /* 为删除按钮定位做准备 */
        }
        .delete-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 20px;
          height: 20px;
          background: #ff4757;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
          transition: all 0.2s;
          z-index: 10;
        }
        .delete-btn:hover {
          background: #ff3742;
          transform: scale(1.1);
        }
        
        /* 响应式布局 */
        @media (max-width: 992px) {
          .link-card {
            max-width: calc(50% - 7.5px); /* 屏幕宽度小于992px时，一行显示2个卡片 */
          }
        }
        
        @media (max-width: 768px) {
          .link-card {
            max-width: 100%; /* 屏幕宽度小于768px时，一行显示1个卡片 */
          }
        }
        h1 {
          color: #1d1d1f;
          margin-bottom: 20px;
          font-size: 24px;
          border-bottom: 1px solid #eee;
          padding-bottom: 10px;
          text-align: center;
          position: relative;
        }
        .refresh-btn {
          background: #0066cc;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
          position: absolute;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
        }
        .refresh-btn:hover {
          background: #0052a3;
        }
        .link-card { 
          margin: 15px 0; 
          padding: 20px;
          background: #ffffff;
          border-radius: 10px;
          transition: all 0.3s;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          border: 1px solid #f0f0f0;
        }
        .link-card:hover { 
          background: #f9f9fb;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          transform: translateY(-2px);
        }
        .link-content {
          padding: 0 10px;
        }
        .link-name {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .link-name a { 
          text-decoration: none; 
          color: #0066cc;
          font-size: 18px;
          font-weight: 500;
          display: block;
        }
        .link-name a:hover { 
          text-decoration: underline;
          color: #0052a3;
        }
        .update-time {
          font-size: 12px;
          color: #b0b0b0;
          margin-left: 10px;
        }
        .link-id {
          font-size: 14px;
          color: #86868b;
          font-family: 'Courier New', monospace;
        }
        .link-id a {
          text-decoration: none;
          color: #666666;
          font-size: 14px;
        }
        .link-id a:hover {
          text-decoration: underline;
          color: #0066cc;
        }
        .empty-tip {
          color: #86868b;
          text-align: center;
          padding: 40px 0;
          font-size: 14px;
        }
        .post-guide {
          margin-top: 30px;
          background: #f0f7ff;
          border-radius: 8px;
          border-left: 4px solid #0066cc;
          overflow: hidden;
        }
        .post-guide-header {
          padding: 15px 20px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #e6f0ff;
          border-bottom: 1px solid #cce0ff;
        }
        .post-guide-header:hover {
          background: #d9e8ff;
        }
        .post-guide-header h2 {
          color: #1d1d1f;
          margin: 0;
          font-size: 18px;
        }
        .toggle-icon {
          font-size: 12px;
          color: #0066cc;
          transition: transform 0.2s;
        }
        .post-guide-content {
          padding: 20px;
        }
        .post-guide p {
          margin-bottom: 10px;
          line-height: 1.5;
        }
        .code-block {
          background: #f5f5f5;
          padding: 10px;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          font-size: 14px;
          margin: 10px 0;
          overflow-x: auto;
        }

      </style>
    </head>
    <body>
      <div class="container">
        <h1>
          IPV4动态公网监控
          <button class="refresh-btn" onclick="window.location.href = window.location.origin + '?refresh=true'">刷新</button>
        </h1>
        <div class="links-container">
          ${linksHtml}
        </div>
        
        <div class="post-guide">
          <div class="post-guide-header" onclick="togglePostGuide()">
            <h2>POST 使用格式</h2>
            <span class="toggle-icon">▼</span>
          </div>
          <div class="post-guide-content" id="postGuideContent">
            <p>您可以通过 POST 请求向此服务写入或更新链接：</p>
            <p><strong>方法：</strong>POST</p>
            <p><strong>URL：</strong>当前页面 URL</p>
            <p><strong>请求头：</strong></p>
            <div class="code-block">
              <!-- JSON 格式请求头 -->
              <strong>JSON 格式请求头：</strong><br>
              Content-Type: application/json
              <br><br>
              <!-- Form 格式请求头 -->
              <strong>Form 格式请求头：</strong><br>
              Content-Type: application/x-www-form-urlencoded
            </div>
            <p><strong>请求体格式：</strong></p>
            <div class="code-block">
              <!-- JSON 格式 -->
              <strong>JSON 格式：</strong><br>
              {
                "name": "显示名称",
                "value": "https://目标链接.com"
              }
              <br><br>
              <!-- Form 格式 -->
              <strong>Form 格式：</strong><br>
              name=显示名称&value=https://目标链接.com
            </div>
            <p><strong>完整请求示例：</strong></p>
            <div class="code-block">
              <!-- JSON 格式完整示例 -->
              <strong>JSON 格式完整示例：</strong><br>
              POST / HTTP/1.1<br>
              Host: example.com<br>
              Content-Type: application/json<br>
              Content-Length: 50<br>
              <br>
              {"name": "Google", "value": "https://www.google.com"}
              <br><br>
              <!-- Form 格式完整示例 -->
              <strong>Form 格式完整示例：</strong><br>
              POST / HTTP/1.1<br>
              Host: example.com<br>
              Content-Type: application/x-www-form-urlencoded<br>
              Content-Length: 30<br>
              <br>
              name=Google&value=https://www.google.com
            </div>
            <p><strong>说明：</strong></p>
            <ul>
              <li>name 为显示在页面上的链接名称，必须唯一</li>
              <li>value 为实际跳转的链接地址</li>
              <li>如果 name 已存在，将会更新其对应的值</li>
              <li>写入成功后，页面会自动更新</li>
              <li>访问域名/id 可以直接跳转到对应的链接（id 为自动生成的数字）</li>
            </ul>
          </div>
        </div>
        
        <script>
          // 删除链接功能
          function deleteLink(id, name) {
            if (confirm('确定要删除链接 "' + name + '" 吗？此操作不可恢复。')) {
              fetch('?delete=' + id, {
                method: 'DELETE'
              }).then(response => {
                if (response.ok) {
                  // 刷新页面
                  window.location.reload();
                } else {
                  alert('删除失败，请重试');
                }
              }).catch(error => {
                console.error('删除请求失败:', error);
                alert('删除请求失败，请重试');
              });
            }
          }
          
          // 折叠功能实现
          function togglePostGuide() {
            const content = document.getElementById('postGuideContent');
            const icon = document.querySelector('.toggle-icon');
            if (content.style.display === 'none') {
              content.style.display = 'block';
              icon.textContent = '▼';
            } else {
              content.style.display = 'none';
              icon.textContent = '▶';
            }
          }
          
          // 页面加载时默认折叠
          window.onload = function() {
            document.getElementById('postGuideContent').style.display = 'none';
            document.querySelector('.toggle-icon').textContent = '▶';
          };
        </script>
      </div>
    </body>
    </html>
  `;
}
