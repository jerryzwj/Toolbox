// ===================== 核心配置区【仅需修改这一行】=====================

// 替换为你的远程proxy-config.json文件的完整直连URL
const REMOTE_CONFIG_URL = "https://raw.githubusercontent.com/jerryzwj/tvjson/refs/heads/main/dl.json";
//proxy-config.json示例
//{
//  "奈小星资源": "https://naixxzy.com/api.php/provide/vod",
//  "红杉资源": "https://hsckzy.xyz/api.php/provide/vod",
// "精品线资源": "https://www.jingpinx.com/api.php/provide/vod",
//  "IPTV自定义列表": "https://raw.githubusercontent.com/jerryzwj/tvjson/refs/heads/main/iptv_custom%20(2).m3u",
//  "UZ频道JSON": "https://raw.githubusercontent.com/jerryzwj/tvjson/refs/heads/main/UZ.json"
//}
const TIMEOUT = 10000; // 请求超时时间 10秒
const CACHE_TTL = 300; // 缓存时间 5分钟（含远程配置和代理请求）

// 拉取并解析远程配置文件
async function fetchRemoteConfig() {
  try {
    // 拉取远程JSON配置，设置超时和缓存
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("拉取远程配置超时")), TIMEOUT)
    );
    const response = await Promise.race([
      fetch(REMOTE_CONFIG_URL, {
        cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36" }
      }),
      timeoutPromise
    ]);

    // 校验响应状态
    if (!response.ok) {
      throw new Error(`远程配置拉取失败，状态码：${response.status}`);
    }

    // 解析JSON为配置对象（和原PROXY_MAP格式完全一致）
    const proxyMap = await response.json();
    // 简单校验配置格式（避免无效配置）
    if (typeof proxyMap !== "object" || proxyMap === null || Array.isArray(proxyMap)) {
      throw new Error("远程配置格式错误，必须是JSON对象");
    }
    return proxyMap;
  } catch (error) {
    console.error("远程配置拉取异常：", error.message);
    throw error; // 抛出错误，让主逻辑处理兜底
  }
}

// Worker主入口
export default {
  async fetch(request, env, ctx) {
    let PROXY_MAP = null;
    try {
      // 第一步：拉取远程配置（核心改造）
      PROXY_MAP = await fetchRemoteConfig();
    } catch (error) {
      // 远程配置拉取失败：兜底响应，提示错误
      return new Response(`
        <div style="text-align:center;margin-top:100px;font-size:18px;color:red;">
          ❌ 代理服务启动失败<br><br>
          原因：${error.message}<br><br>
          请检查远程配置文件URL是否正确、文件是否公网可访问、格式是否为标准JSON
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
    const url = new URL(request.url);
    const pathname = url.pathname;
    // 将远程拉取的配置转为数组，按顺序映射/1、/2、/3...
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
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // 匹配代理规则（判断路径是否为有效数字路径）
    // @ts-ignore
    if (!isNaN(pathIndex) && targetItem) {
      try {
        const [name, targetUrlStr] = targetItem;
        const targetUrl = new URL(targetUrlStr);
        targetUrl.search = url.search; // 透传所有请求参数
        
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
// 根路径（域名/）：渲染代理列表页面（显示名称+代理地址+被代理地址）
const proxyListHtml = proxyArray.map(([name, targetUrlStr], index) => {
  const path = `/${index + 1}`;
  const proxyUrl = `${url.origin}${path}`; // 代理访问地址（域名/1、域名/2）
  const originalUrl = targetUrlStr; // 被代理的原始地址（从远程配置中读取）
  
  // 显示格式：名称：可点击代理地址 → 被代理原始地址 → 访问状态（区分样式，更易读）
  return `<div class="proxy-item" data-url="${originalUrl}">
    ${name}：<a href="${proxyUrl}" target="_blank" style="color:#1677ff;text-decoration:none;">${proxyUrl}</a> → 
    <span style="color:#666;">${originalUrl}</span> → 
    <span class="access-status" style="font-weight:bold;">检测中...</span>
    <span class="test-info" style="font-size:12px;color:#999;margin-left:10px;"></span>
  </div>`;
}).join('');

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
      .access-status{min-width:80px;display:inline-block;}
      .test-info{max-width:300px;display:inline-block;}
      .test-btn{margin-left:10px;padding:2px 8px;font-size:12px;border:none;border-radius:4px;background:#1677ff;color:white;cursor:pointer;}
      .test-btn:hover{background:#40a9ff;}
    </style>
  </head>
  <body>
    <div class="container">
      <h1>✅ 多站代理服务运行中</h1>
      <div style="font-size:16px;">${proxyListHtml}</div>
      <button id="test-all" style="margin-top:20px;padding:8px 16px;font-size:14px;border:none;border-radius:4px;background:#1677ff;color:white;cursor:pointer;">一键检测所有地址</button>
      <div style="margin-top:10px;font-size:12px;color:#666;">
        <p>测试说明：</p>
        <ul>
          <li>系统会自动使用无跨域模式测试每个地址的可访问性</li>
          <li>✅无需代理：表示可以直接访问，不需要通过代理</li>
          <li>需代理：表示需要通过代理才能访问</li>
          <li>测试结果仅供参考，实际访问请点击链接测试</li>
        </ul>
      </div>
    </div>
    <script>
      // 测试单个地址的可访问性（仅使用无跨域模式）
      async function testAccessibility(url, element, infoElement) {
        try {
          element.textContent = '检测中...';
          element.style.color = '#1890ff';
          infoElement.textContent = '';
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
          
          const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            mode: 'no-cors', // 仅使用无跨域模式
            redirect: 'follow',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36',
              'Accept': '*/*'
            }
          });
          
          clearTimeout(timeoutId);
          
          // 只要能收到响应，就认为可以访问
          element.textContent = '✅无需代理';
          element.style.color = '#52c41a';
          infoElement.textContent = '测试成功';
        } catch (error) {
          // 详细的错误处理
          if (error.name === 'AbortError') {
            element.textContent = '需代理';
            infoElement.textContent = '错误: 请求超时';
          } else {
            element.textContent = '需代理';
            infoElement.textContent = '错误：' + error.message;
          }
          element.style.color = '#ff4d4f';
        }
      }
      
      // 测试所有地址
      async function testAllAccessibility() {
        const proxyItems = document.querySelectorAll('.proxy-item');
        for (const item of proxyItems) {
          const url = item.dataset.url;
          const statusElement = item.querySelector('.access-status');
          const infoElement = item.querySelector('.test-info');
          await testAccessibility(url, statusElement, infoElement);
        }
      }
      
      // 绑定事件监听器
      window.addEventListener('load', function() {
        // 页面加载完成后自动测试所有地址
        testAllAccessibility();
        
        // 绑定一键测试按钮事件
        document.getElementById('test-all').addEventListener('click', testAllAccessibility);
      });
    </script>
  </body>
  </html>
`, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
}
};
