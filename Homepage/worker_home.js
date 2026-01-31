// Cloudflare Workers + KV 导航页【最终修复版】- 解决模板字符串语法错误
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ===================== 全局配置 =====================
    const BOOKMARK_PASSWORD = env.BOOKMARK_PASSWORD || 'default123';
    const MAX_ERROR_COUNT = 3;
    const LOCK_DURATION = 60;



    // ===================== 工具函数：密码验证 =====================
    async function verifyPassword(env, inputPwd, clientIP) {
      // 简化密码验证，取消输错次数锁定
      if (inputPwd === BOOKMARK_PASSWORD) {
        return { success: true };
      } else {
        return { success: false, msg: '密码错误' };
      }
    }

    // ===================== API 接口 =====================
    // 1. 获取分类列表
    if (path === '/api/get-categories' && request.method === 'GET') {
      try {
        const categoriesStr = await env.BOOKMARKS_KV.get('bookmarks:categories');
        const categories = categoriesStr ? JSON.parse(categoriesStr) : [];
        return new Response(JSON.stringify(categories), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (err) {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // 2. 获取书签
    if (path === '/api/get-bookmarks' && request.method === 'GET') {
      const category = url.searchParams.get('category') || '';
      try {
        if (category && category !== 'all') {
          const bookmarksStr = await env.BOOKMARKS_KV.get(`bookmarks:${category}`);
          const bookmarks = bookmarksStr ? JSON.parse(bookmarksStr) : [];
          return new Response(JSON.stringify(bookmarks), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        const categoriesStr = await env.BOOKMARKS_KV.get('bookmarks:categories');
        let categories = categoriesStr ? JSON.parse(categoriesStr) : [];
        
        if (categories.length === 0) {
          const oldBookmarksStr = await env.BOOKMARKS_KV.get('bookmarks');
          if (oldBookmarksStr) {
            await migrateOldDataToCategories(env, JSON.parse(oldBookmarksStr));
            const newCategoriesStr = await env.BOOKMARKS_KV.get('bookmarks:categories');
            categories = newCategoriesStr ? JSON.parse(newCategoriesStr) : [];
          }
        }

        const bookmarkPromises = categories.map(cat => 
          env.BOOKMARKS_KV.get(`bookmarks:${cat}`).then(str => str ? JSON.parse(str) : [])
        );
        const categoryBookmarks = await Promise.all(bookmarkPromises);
        
        const allBookmarks = [];
        categories.forEach((cat, index) => {
          allBookmarks.push(...categoryBookmarks[index].map(item => ({ ...item, category: cat })));
        });

        return new Response(JSON.stringify(allBookmarks), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (err) {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // 3. 保存书签
    if (path === '/api/save-bookmark' && request.method === 'POST') {
      try {
        const data = await request.json();
        const { name, url, category, password, isEditing, originalName, originalUrl } = data;
        const cat = category || '未分类';

        // 所有保存操作都需要密码验证
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        const verifyResult = await verifyPassword(env, password, clientIP);
        if (!verifyResult.success) {
          return new Response(JSON.stringify({ success: false, msg: verifyResult.msg }), {
            status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        const bookmarksStr = await env.BOOKMARKS_KV.get(`bookmarks:${cat}`);
        const bookmarks = bookmarksStr ? JSON.parse(bookmarksStr) : [];

        let existIndex = -1;
        if (isEditing && originalName && originalUrl) {
          // 编辑模式下，使用原始名称和URL查找原书签
          existIndex = bookmarks.findIndex(item => item.name === originalName && item.url === originalUrl);
        } else {
          // 非编辑模式或没有原始信息，使用新名称和URL查找
          existIndex = bookmarks.findIndex(item => item.name === name && item.url === url);
        }
        
        if (existIndex > -1) {
          // 更新原书签
          bookmarks[existIndex] = { name, url };
        } else {
          // 创建新书签
          bookmarks.unshift({ name, url });
        }

        await env.BOOKMARKS_KV.put(`bookmarks:${cat}`, JSON.stringify(bookmarks));

        const categoriesStr = await env.BOOKMARKS_KV.get('bookmarks:categories');
        let categories = categoriesStr ? JSON.parse(categoriesStr) : [];
        if (!categories.includes(cat)) {
          categories.push(cat);
          categories = [...new Set(categories)].sort();
          await env.BOOKMARKS_KV.put('bookmarks:categories', JSON.stringify(categories));
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, msg: err.message }), { 
          status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // 4. 删除书签
    if (path === '/api/delete-bookmark' && request.method === 'POST') {
      try {
        const data = await request.json();
        const { name, url, category, password } = data;
        const cat = category || '未分类';

        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        const verifyResult = await verifyPassword(env, password, clientIP);
        if (!verifyResult.success) {
          return new Response(JSON.stringify({ success: false, msg: verifyResult.msg }), {
            status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        const bookmarksStr = await env.BOOKMARKS_KV.get(`bookmarks:${cat}`);
        const bookmarks = bookmarksStr ? JSON.parse(bookmarksStr) : [];

        const newBookmarks = bookmarks.filter(item => !(item.name === name && item.url === url));
        await env.BOOKMARKS_KV.put(`bookmarks:${cat}`, JSON.stringify(newBookmarks));

        if (newBookmarks.length === 0) {
          const categoriesStr = await env.BOOKMARKS_KV.get('bookmarks:categories');
          let categories = categoriesStr ? JSON.parse(categoriesStr) : [];
          categories = categories.filter(c => c !== cat);
          await env.BOOKMARKS_KV.put('bookmarks:categories', JSON.stringify(categories));
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, msg: err.message }), { 
          status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // ===================== 前端页面（封装为独立变量，避免模板字符串断裂）=====================
    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="mobile-web-app-capable" content="yes">
  <title>我的专属网址导航</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css" rel="stylesheet">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            primary: '#165DFF',
            secondary: '#36CFC9',
          },
          fontFamily: {
            sans: ['PingFang SC', 'Microsoft YaHei', 'sans-serif']
          },
          translate: {
            'custom-4px': '-4px',
          },
          boxShadow: {
            'custom-hover': '0 12px 20px -8px rgba(22,93,255,0.2)',
            'custom-sm': '0 6px 12px -4px rgba(22, 93, 255, 0.15)',
          }
        }
      }
    }
  </script>
  <style type="text/tailwindcss">
    @layer utilities {
      /* 改进的玻璃态样式，带紫色发光效果 */
      .glass {
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.4);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.95);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
      }
      
      /* 深色模式下的玻璃态，带紫色发光效果 */
      .glass-dark {
        backdrop-filter: blur(12px);
        border: 1px solid rgba(138, 43, 226, 0.4);
        border-radius: 16px;
        background: rgba(17, 24, 39, 0.95);
        box-shadow: 
          0 0 30px rgba(138, 43, 226, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.1),
          0 8px 32px rgba(0, 0, 0, 0.15);
        transition: all 0.3s ease;
      }
      
      /* 卡片悬停时增强发光效果 */
      .glass-dark:hover {
        box-shadow: 
          0 0 40px rgba(138, 43, 226, 0.5),
          inset 0 1px 0 rgba(255, 255, 255, 0.15),
          0 12px 40px rgba(0, 0, 0, 0.2);
      }
      
      /* 模态框样式改进，带紫色发光效果 */
      .modal-glass {
        backdrop-filter: blur(20px);
        border: 1px solid rgba(138, 43, 226, 0.2);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.95);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
      }
      
      .dark .modal-glass {
        background: rgba(17, 24, 39, 0.95);
        border: 1px solid rgba(138, 43, 226, 0.4);
        box-shadow: 
          0 0 40px rgba(138, 43, 226, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.1),
          0 8px 32px rgba(0, 0, 0, 0.15);
      }
      
      /* 分类下拉菜单样式 */
      .category-dropdown {
        max-height: 180px;
        overflow-y: auto;
        z-index: 100;
        border: 1px solid rgba(138, 43, 226, 0.3);
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.2);
      }
      
      /* 分类下拉菜单项样式 */
      .category-dropdown-item {
        transition: all 0.15s ease;
      }
      
      .category-dropdown-item:hover {
        background-color: rgba(138, 43, 226, 0.1);
        color: #8a2be2;
      }
      
      .dark .category-dropdown-item:hover {
        background-color: rgba(138, 43, 226, 0.2);
        color: #d8b4fe;
      }
      
      /* 卡片悬停效果增强 */
      .card-hover {
        transition: all 0.25s ease;
      }
      
      .card-hover:hover {
        @apply md:translate-y-custom-4px;
        box-shadow: 
          0 0 30px rgba(138, 43, 226, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.1),
          0 12px 40px rgba(0, 0, 0, 0.2);
      }
      
      /* 分类标签样式改进 */
      .category-tag {
        transition: all 0.2s ease;
      }
      
      .category-tag.active {
        background: linear-gradient(135deg, #165DFF, #8a2be2);
        color: white;
        box-shadow: 0 4px 15px rgba(138, 43, 226, 0.4);
        border: 1px solid rgba(138, 43, 226, 0.5);
      }
      
      /* 按钮发光效果 */
      .btn-glow {
        background: linear-gradient(135deg, #165DFF, #8a2be2);
        box-shadow: 0 4px 15px rgba(138, 43, 226, 0.4);
        transition: all 0.3s ease;
        border: 1px solid rgba(138, 43, 226, 0.5);
      }
      
      .btn-glow:hover {
        box-shadow: 0 6px 20px rgba(138, 43, 226, 0.6);
        transform: translateY(-1px);
      }
      
      /* 无点击高亮 */
      .no-tap {
        -webkit-tap-highlight-color: transparent;
      }
      
      /* 文字发光效果 */
      .text-glow {
        text-shadow: 0 0 10px rgba(138, 43, 226, 0.5);
      }
    }
  </style>
  <style>
    * {
      box-sizing: border-box;
    }
    
    /* 深色背景星空效果 */
    body {
      touch-action: manipulation;
      background: 
        radial-gradient(circle at 20% 30%, rgba(138, 43, 226, 0.1) 0%, transparent 50%),
        radial-gradient(circle at 80% 70%, rgba(138, 43, 226, 0.1) 0%, transparent 50%),
        radial-gradient(circle at 40% 80%, rgba(138, 43, 226, 0.05) 0%, transparent 50%),
        radial-gradient(circle at 60% 20%, rgba(138, 43, 226, 0.05) 0%, transparent 50%);
    }
    
    /* 滚动条样式 */
    ::-webkit-scrollbar {
      height: 4px;
      width: 4px;
    }
    
    ::-webkit-scrollbar-thumb {
      background: rgba(138, 43, 226, 0.4);
      border-radius: 2px;
      box-shadow: 0 0 10px rgba(138, 43, 226, 0.5);
    }
    
    .overflow-x-auto {
      scrollbar-width: thin;
      -ms-overflow-style: none;
    }
    
    /* 星星背景效果 */
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: 
        radial-gradient(2px 2px at 20px 30px, rgba(138, 43, 226, 0.3), transparent),
        radial-gradient(2px 2px at 40px 70px, rgba(138, 43, 226, 0.5), transparent),
        radial-gradient(1px 1px at 90px 40px, rgba(138, 43, 226, 0.2), transparent),
        radial-gradient(1px 1px at 130px 80px, rgba(138, 43, 226, 0.4), transparent),
        radial-gradient(2px 2px at 160px 20px, rgba(138, 43, 226, 0.6), transparent);
      background-repeat: repeat;
      background-size: 200px 200px;
      opacity: 0;
      transition: opacity 0.5s ease;
      pointer-events: none;
      z-index: -1;
    }
    
    /* 黑暗模式下显示星星背景 */
    .dark body::before {
      opacity: 1;
    }
    
    /* 发光边框动画 */
    @keyframes glowPulse {
      0%, 100% {
        box-shadow: 
          0 0 30px rgba(138, 43, 226, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.1),
          0 8px 32px rgba(0, 0, 0, 0.15);
      }
      50% {
        box-shadow: 
          0 0 40px rgba(138, 43, 226, 0.5),
          inset 0 1px 0 rgba(255, 255, 255, 0.15),
          0 12px 40px rgba(0, 0, 0, 0.2);
      }
    }
    
    /* 为卡片和头部添加呼吸灯效果 */
    .glass-dark {
      animation: glowPulse 3s ease-in-out infinite;
    }
  </style>
</head>
<body class="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 dark:from-black dark:via-slate-950 dark:to-black text-slate-800 dark:text-white bg-fixed">
  <header class="glass dark:glass-dark sticky top-0 z-50 px-3 py-2.5 mb-4 shadow-sm no-tap">
    <div class="max-w-7xl mx-auto flex justify-between items-center">
      <h1 class="text-[clamp(1.1rem,3vw,1.6rem)] font-bold text-primary flex items-center gap-2">
        <i class="fa fa-link text-lg"></i> 我的专属网址导航
      </h1>
      <div class="flex items-center gap-3">
        <!-- 黑暗模式切换按钮 -->
        <button id="themeToggle" class="text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary text-lg transition-colors no-tap">
          <i class="fa fa-moon-o dark:hidden"></i>
          <i class="fa fa-sun-o hidden dark:inline"></i>
        </button>
        <button id="addBtn" class="bg-primary text-white px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg hover:opacity-90 transition-all text-sm">
          <i class="fa fa-plus text-sm"></i> 添加
        </button>
      </div>
    </div>
  </header>

  <div class="max-w-7xl mx-auto px-3 mb-5 overflow-x-auto pb-2">
    <div id="categoryFilter" class="flex gap-2 whitespace-nowrap w-max">
      <button class="category-tag active px-3 py-2 rounded-full glass dark:glass-dark hover:bg-primary/10 no-tap text-sm min-w-[70px] text-center" data-category="all">
        全部
      </button>
    </div>
  </div>

  <main class="max-w-7xl mx-auto px-3 mb-10">
    <div id="bookmarkList" class="space-y-5">
      <div class="flex items-center justify-center h-36 text-gray-500 dark:text-gray-400">
        <i class="fa fa-spinner fa-spin mr-3 text-xl"></i> 加载常用网址中...
      </div>
    </div>
  </main>

  <div id="modal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-99 hidden backdrop-blur-sm no-tap">
    <div class="modal-glass w-[94%] max-w-md p-5 shadow-2xl">
      <div class="flex justify-between items-center mb-4">
        <h2 id="modalTitle" class="text-lg font-bold text-primary">添加新网址</h2>
        <button id="closeBtn" class="text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary text-lg transition-colors no-tap">
          <i class="fa fa-times"></i>
        </button>
      </div>
      <form id="bookmarkForm" class="space-y-4">
        <input type="hidden" id="editCategory">
        <input type="hidden" id="originalName">
        <input type="hidden" id="originalUrl">
        <input type="hidden" id="isEditing" value="false">
        <div>
          <label class="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-200">网站名称</label>
          <input type="text" id="name" required class="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary text-gray-800 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 text-base" placeholder="例如：百度、GitHub">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-200">网站地址</label>
          <input type="url" id="url" required class="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary text-gray-800 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 text-base" placeholder="https://www.baidu.com">
          <p class="text-xs text-gray-600 dark:text-gray-300 mt-1">✅ 无需加载图标，页面更流畅</p>
        </div>
        <div class="relative">
          <label class="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-200">分类（必填）</label>
          <input type="text" id="category" required class="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary text-gray-800 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 text-base" placeholder="例如：工具类、影音类、编程类">
          <div id="categoryDropdown" class="category-dropdown absolute left-0 right-0 mt-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-800 hidden">
            <div id="categoryDropdownItems" class="p-2 space-y-1"></div>
          </div>
          <p class="text-xs text-gray-600 dark:text-gray-300 mt-1">💡 可直接选择已有分类，或输入新分类</p>
        </div>
        <div id="passwordContainer" class="hidden">
          <label class="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-200">操作密码</label>
          <input type="password" id="password" required class="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary text-gray-800 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 text-base" placeholder="请输入操作密码">
        </div>
        <button type="submit" class="w-full bg-primary text-white py-3 rounded-lg shadow-md hover:opacity-90 transition-all mt-2 text-base no-tap">保存网址</button>
      </form>
    </div>
  </div>

  <div id="deleteModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-100 hidden backdrop-blur-sm no-tap">
    <div class="modal-glass w-[94%] max-w-md p-5 shadow-2xl">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-bold text-primary">删除确认</h2>
        <button id="closeDeleteBtn" class="text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary text-lg transition-colors no-tap">
          <i class="fa fa-times"></i>
        </button>
      </div>
      <div class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-300">删除操作需要验证密码，删除后无法恢复！</p>
        <div>
          <label class="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-200">操作密码</label>
          <input type="password" id="deletePassword" required class="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary text-gray-800 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 text-base" placeholder="请输入操作密码">
        </div>
        <input type="hidden" id="deleteName">
        <input type="hidden" id="deleteUrl">
        <input type="hidden" id="deleteCategory">
        <button id="confirmDeleteBtn" class="w-full bg-red-500 text-white py-3 rounded-lg shadow-md hover:opacity-90 transition-all mt-2 text-base no-tap">确认删除</button>
      </div>
    </div>
  </div>

  <script>
    let bookmarks = [];
    let allCategories = [];
    let filteredCategory = 'all';

    // 统一使用科技蓝，取消随机颜色
    const cardColorPool = [
      'rgba(22,93,255,0.2)', // 科技蓝，浅色模式
    ];
    const darkCardColorPool = [
      'rgba(138,43,226,0.2)', // 科技紫蓝，深色模式
    ];

    // 延迟获取DOM元素，在DOMContentLoaded后获取
    let bookmarkList, categoryFilter, addBtn, closeBtn, modal, modalTitle, bookmarkForm;
    let nameInput, urlInput, categoryInput, editCategoryInput, isEditingInput;
    let passwordContainer, passwordInput, categoryDropdown, categoryDropdownItems;
    let themeToggle;
    let deleteModal, closeDeleteBtn, deletePasswordInput, deleteNameInput;
    let deleteUrlInput, deleteCategoryInput, confirmDeleteBtn;
    
    // 黑暗模式切换逻辑
    function initTheme() {
      // 检测用户系统的颜色偏好
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      // 从localStorage中获取用户之前的主题设置
      const savedTheme = localStorage.getItem('theme');
      
      // 设置初始主题
      if (savedTheme) {
        document.documentElement.classList.toggle('dark', savedTheme === 'dark');
      } else {
        document.documentElement.classList.toggle('dark', prefersDark);
      }
    }
    
    function toggleTheme() {
      // 切换主题
      document.documentElement.classList.toggle('dark');
      // 保存主题到localStorage
      const isDark = document.documentElement.classList.contains('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      // 重新渲染书签，更新卡片背景颜色
      renderBookmarks();
    }

    function getRandomCardBg() {
      const isDark = document.documentElement.classList.contains('dark');
      // 直接返回对应颜色池的第一个元素，不再使用随机数
      return isDark ? darkCardColorPool[0] : cardColorPool[0];
    }

    async function getCategories() {
      try {
        const res = await fetch('/api/get-categories');
        allCategories = await res.json();
        return allCategories;
      } catch (err) {
        const backup = localStorage.getItem('bookmarks_categories');
        allCategories = backup ? JSON.parse(backup) : [];
        return allCategories;
      }
    }

    async function getBookmarks(category = 'all') {
      // 缓存配置
      const CACHE_DURATION = 300000; // 5分钟
      const cacheKey = 'bookmarks_' + category;
      const cacheTimestampKey = 'bookmarks_' + category + '_timestamp';
      
      // 检查缓存是否有效
      const cachedData = localStorage.getItem(cacheKey);
      const cacheTimestamp = localStorage.getItem(cacheTimestampKey);
      const now = Date.now();
      
      // 如果缓存存在且未过期，直接返回缓存数据
      if (cachedData && cacheTimestamp && (now - parseInt(cacheTimestamp)) < CACHE_DURATION) {
        const data = JSON.parse(cachedData);
        if (category === 'all') {
          bookmarks = data;
        }
        return data;
      }
      
      // 缓存过期或不存在，从服务器获取数据
      try {
        const url = category === 'all' 
          ? '/api/get-bookmarks' 
          : \`/api/get-bookmarks?category=\${encodeURIComponent(category)}\`;
        const res = await fetch(url);
        const data = await res.json();
        
        // 更新缓存
        localStorage.setItem(cacheKey, JSON.stringify(data));
        localStorage.setItem(cacheTimestampKey, now.toString());
        
        // 如果是获取全部书签，更新全局bookmarks变量
        if (category === 'all') {
          bookmarks = data;
          // 同时更新所有分类的缓存
          localStorage.setItem('bookmarks_all', JSON.stringify(data));
          localStorage.setItem('bookmarks_all_timestamp', now.toString());
        }
        
        return data;
      } catch (err) {
        // 网络请求失败，尝试使用缓存数据
        if (cachedData) {
          const data = JSON.parse(cachedData);
          if (category === 'all') {
            bookmarks = data;
          }
          return data;
        }
        
        // 没有缓存，返回空数据或默认数据
        const backup = localStorage.getItem('bookmarks_all');
        bookmarks = backup ? JSON.parse(backup) : [];
        return category === 'all' ? bookmarks : bookmarks.filter(item => item.category === category);
      }
    }

    async function saveBookmark(data) {
      try {
        const res = await fetch('/api/save-bookmark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await res.json();
        if (!result.success) {
          alert(result.msg);
          return false;
        }
        
        // 清除所有书签缓存，确保下次获取最新数据
        localStorage.removeItem('bookmarks_all');
        localStorage.removeItem('bookmarks_all_timestamp');
        
        // 清除特定分类的缓存
        const categories = await getCategories();
        categories.forEach(cat => {
          localStorage.removeItem('bookmarks_' + cat);
          localStorage.removeItem('bookmarks_' + cat + '_timestamp');
        });
        
        await refreshBookmarks();
        return true;
      } catch (err) {
        alert('操作失败：' + err.message);
        return false;
      }
    }

    async function deleteBookmark(name, url, category, password) {
      try {
        const res = await fetch('/api/delete-bookmark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, url, category, password })
        });
        const result = await res.json();
        if (!result.success) {
          alert(result.msg);
          return false;
        }
        
        // 清除所有书签缓存，确保下次获取最新数据
        localStorage.removeItem('bookmarks_all');
        localStorage.removeItem('bookmarks_all_timestamp');
        
        // 清除特定分类的缓存
        const categories = await getCategories();
        categories.forEach(cat => {
          localStorage.removeItem('bookmarks_' + cat);
          localStorage.removeItem('bookmarks_' + cat + '_timestamp');
        });
        
        await refreshBookmarks();
        return true;
      } catch (err) {
        alert('操作失败：' + err.message);
        return false;
      }
    }

    async function refreshBookmarks() {
      await getCategories();
      await getBookmarks('all');
      renderCategoryFilter();
      renderBookmarks();
    }

    function renderCategoryDropdown() {
      const inputVal = categoryInput.value.trim().toLowerCase();
      const matchedCategories = allCategories.filter(cat => 
        cat.toLowerCase().includes(inputVal)
      );

      if (matchedCategories.length === 0) {
        categoryDropdown.classList.add('hidden');
        return;
      }

      categoryDropdownItems.innerHTML = '';
      matchedCategories.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'category-dropdown-item px-3 py-2 rounded-md cursor-pointer text-gray-800 dark:text-gray-200 no-tap';
        item.textContent = cat;
        item.addEventListener('click', () => {
          categoryInput.value = cat;
          categoryDropdown.classList.add('hidden');
        });
        categoryDropdownItems.appendChild(item);
      });

      categoryDropdown.classList.remove('hidden');
    }

    function renderCategoryFilter() {
      const allBtn = categoryFilter.querySelector('[data-category="all"]');
      categoryFilter.innerHTML = '';
      categoryFilter.appendChild(allBtn);

      allCategories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-tag px-3 py-2 rounded-full glass dark:glass-dark hover:bg-primary/10 no-tap text-sm min-w-[70px] text-center';
        btn.dataset.category = cat;
        btn.textContent = cat;
        btn.addEventListener('click', async () => {
          document.querySelectorAll('.category-tag').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          filteredCategory = cat;
          const catBookmarks = await getBookmarks(cat);
          renderBookmarks(catBookmarks);
        });
        categoryFilter.appendChild(btn);
      });

      allBtn.addEventListener('click', async () => {
        document.querySelectorAll('.category-tag').forEach(b => b.classList.remove('active'));
        allBtn.classList.add('active');
        filteredCategory = 'all';
        await getBookmarks('all');
        renderBookmarks();
      });
    }

    function renderBookmarks(customBookmarks = null) {
      const renderData = customBookmarks || bookmarks;

      if (renderData.length === 0) {
        bookmarkList.innerHTML = \`
          <div class="glass dark:glass-dark p-6 text-center">
            <i class="fa fa-star-o text-4xl text-primary mb-3 opacity-80"></i>
            <p class="text-base text-gray-600 dark:text-gray-300">\${filteredCategory === 'all' ? '暂无收藏的网址' : \`「\${filteredCategory}」分类下暂无网址\`}</p>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">点击右上角「添加」，开始收藏你的常用网站吧 ✨</p>
          </div>
        \`;
        return;
      }

      const groupedBookmarks = {};
      if (filteredCategory === 'all') {
        renderData.forEach(item => {
          const cat = item.category || '未分类';
          if (!groupedBookmarks[cat]) groupedBookmarks[cat] = [];
          groupedBookmarks[cat].push(item);
        });
      } else {
        groupedBookmarks[filteredCategory] = renderData;
      }

      let html = '';
      Object.keys(groupedBookmarks).forEach(cat => {
        const items = groupedBookmarks[cat];
        html += \`
          <div class="category-group">
            <h2 class="text-lg font-bold mb-3 flex items-center gap-2">
              <i class="fa fa-folder text-primary"></i> \${cat}（\${items.length}个）
            </h2>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        \`;

        items.forEach(item => {
          const cardBg = getRandomCardBg();
          const itemId = 'bookmark-' + item.name.replace(/\W/g, '') + '-' + item.url.replace(/\W/g, '');
          // 卡片容器
          html += '<div class="glass dark:glass-dark p-3 card-hover flex flex-col h-full relative group cursor-pointer" style="background: ' + cardBg + '" data-id="' + itemId + '" data-url="' + item.url + '">';
          
          // 卡片内容容器，提高层级
          html += '<div class="flex flex-col h-full relative z-10">';
          
          // 标题和操作按钮
          html += '<div class="flex items-center justify-between mb-2">';
          html += '<div class="flex items-center gap-2 flex-1">';
          // 显示名称的第一个字符作为图标
          const firstChar = item.name.charAt(0).toUpperCase();
          
          // 添加名称首字符作为图标
          html += '<div class="w-6 h-6 rounded-md overflow-hidden bg-primary/20 dark:bg-primary/30 flex items-center justify-center flex-shrink-0 text-primary dark:text-white font-bold text-xs">';
          html += firstChar;
          html += '</div>';
          html += '<h3 class="font-bold text-xs sm:text-sm truncate" title="' + item.name + '">' + item.name + '</h3>';
          html += '</div>';
          html += '<div class="flex gap-1.5">';
          html += '<button class="edit-btn text-secondary hover:text-primary p-1 rounded no-tap relative z-20" title="编辑" data-name="' + item.name + '" data-url="' + item.url + '" data-category="' + item.category + '">';
          html += '<i class="fa fa-pencil text-xs"></i>';
          html += '</button>';
          html += '<button class="delete-btn text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300 p-1 rounded no-tap relative z-20" title="删除" data-name="' + item.name + '" data-url="' + item.url + '" data-category="' + item.category + '">';
          html += '<i class="fa fa-trash text-xs"></i>';
          html += '</button>';
          html += '</div>';
          html += '</div>';
          
          // URL显示
          html += '<div class="text-[10px] sm:text-xs text-gray-600 dark:text-gray-300 break-all hover:text-primary transition-colors mb-2 flex-1">' + item.url + '</div>';
          
          // 分类标签
          html += '<p class="text-[9px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1 bg-gray-100/60 dark:bg-slate-700/50 px-1.5 py-0.5 rounded-md">' + cat + '</p>';
          
          html += '</div>';
          html += '</div>';
        });

        html += '</div></div>';
      });

      bookmarkList.innerHTML = html;
    }

    function addBookmark() {
      modalTitle.textContent = '添加新网址';
      bookmarkForm.reset();
      editCategoryInput.value = '';
      document.getElementById('originalName').value = '';
      document.getElementById('originalUrl').value = '';
      isEditingInput.value = 'false';
      passwordContainer.classList.remove('hidden'); // 显示密码输入框
      modal.classList.remove('hidden');
      nameInput.focus();
      renderCategoryDropdown();
    }

    function editBookmark(name, url, category) {
      modalTitle.textContent = '编辑网址';
      nameInput.value = name;
      urlInput.value = url;
      categoryInput.value = category;
      editCategoryInput.value = category;
      document.getElementById('originalName').value = name;
      document.getElementById('originalUrl').value = url;
      isEditingInput.value = 'true';
      passwordContainer.classList.remove('hidden');
      passwordInput.value = '';
      modal.classList.remove('hidden');
      nameInput.focus();
      renderCategoryDropdown();
    }

    function showDeleteModal(name, url, category) {
      deleteNameInput.value = name;
      deleteUrlInput.value = url;
      deleteCategoryInput.value = category;
      deletePasswordInput.value = '';
      deleteModal.classList.remove('hidden');
      deletePasswordInput.focus();
    }

    // 将bookmarkForm的事件监听器移到initPage函数内部

    async function initPage() {
      // 获取所有DOM元素
      bookmarkList = document.getElementById('bookmarkList');
      categoryFilter = document.getElementById('categoryFilter');
      addBtn = document.getElementById('addBtn');
      closeBtn = document.getElementById('closeBtn');
      modal = document.getElementById('modal');
      modalTitle = document.getElementById('modalTitle');
      bookmarkForm = document.getElementById('bookmarkForm');
      nameInput = document.getElementById('name');
      urlInput = document.getElementById('url');
      categoryInput = document.getElementById('category');
      editCategoryInput = document.getElementById('editCategory');
      isEditingInput = document.getElementById('isEditing');
      passwordContainer = document.getElementById('passwordContainer');
      passwordInput = document.getElementById('password');
      categoryDropdown = document.getElementById('categoryDropdown');
      categoryDropdownItems = document.getElementById('categoryDropdownItems');
      themeToggle = document.getElementById('themeToggle');
      
      deleteModal = document.getElementById('deleteModal');
      closeDeleteBtn = document.getElementById('closeDeleteBtn');
      deletePasswordInput = document.getElementById('deletePassword');
      deleteNameInput = document.getElementById('deleteName');
      deleteUrlInput = document.getElementById('deleteUrl');
      deleteCategoryInput = document.getElementById('deleteCategory');
      confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
      
      // 初始化主题
      initTheme();
      
      // 绑定主题切换按钮事件监听器
      themeToggle.addEventListener('click', toggleTheme);
      
      // 绑定其他事件监听器
      categoryInput.addEventListener('input', renderCategoryDropdown);
      categoryInput.addEventListener('focus', renderCategoryDropdown);
      document.addEventListener('click', (e) => {
        if (!categoryInput.contains(e.target) && !categoryDropdown.contains(e.target)) {
          categoryDropdown.classList.add('hidden');
        }
      });
      addBtn.addEventListener('click', addBookmark);
      closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
      modal.addEventListener('click', (e) => e.target === modal && modal.classList.add('hidden'));
      closeDeleteBtn.addEventListener('click', () => deleteModal.classList.add('hidden'));
      deleteModal.addEventListener('click', (e) => e.target === deleteModal && deleteModal.classList.add('hidden'));
      
      // 绑定卡片点击事件监听器（只绑定一次）
      bookmarkList.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        const card = e.target.closest('.glass, .glass-dark');
        
        if (editBtn) {
          // 阻止事件冒泡
          e.stopPropagation();
          const name = editBtn.dataset.name;
          const url = editBtn.dataset.url;
          const category = editBtn.dataset.category;
          editBookmark(name, url, category);
        } else if (deleteBtn) {
          // 阻止事件冒泡
          e.stopPropagation();
          const name = deleteBtn.dataset.name;
          const url = deleteBtn.dataset.url;
          const category = deleteBtn.dataset.category;
          showDeleteModal(name, url, category);
        } else if (card) {
          // 获取卡片的URL并跳转
          const url = card.dataset.url;
          if (url) {
            window.open(url, '_blank', 'noopener noreferrer');
          }
        }
      });
      
      // 绑定删除确认按钮事件监听器
      confirmDeleteBtn.addEventListener('click', async () => {
        const name = deleteNameInput.value;
        const url = deleteUrlInput.value;
        const category = deleteCategoryInput.value;
        const password = deletePasswordInput.value.trim();

        if (!password) {
          alert('请输入操作密码！');
          return;
        }

        const success = await deleteBookmark(name, url, category, password);
        if (success) {
          deleteModal.classList.add('hidden');
          renderCategoryFilter();
          renderBookmarks();
        }
      });
      
      // 绑定表单提交事件监听器
      bookmarkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        const url = urlInput.value.trim();
        const newCategory = categoryInput.value.trim() || '未分类';
        const oldCategory = editCategoryInput.value || newCategory;
        const isEditing = isEditingInput.value === 'true';
        const password = passwordInput.value.trim(); // 总是需要密码

        if (!password) {
          alert('请输入操作密码！');
          return;
        }

        const originalName = document.getElementById('originalName').value;
        const originalUrl = document.getElementById('originalUrl').value;

        let success = true;
        if (isEditing && oldCategory !== newCategory) {
          success = await deleteBookmark(originalName, originalUrl, oldCategory, password);
          if (!success) return;
        }

        success = await saveBookmark({ 
          name, url, category: newCategory, 
          originalName: isEditing ? originalName : '', 
          originalUrl: isEditing ? originalUrl : '', 
          password: password, // 总是传递密码
          isEditing 
        });
        if (success) {
          modal.classList.add('hidden');
        }
      });
      
      await getCategories();
      await getBookmarks('all');
      renderCategoryFilter();
      renderBookmarks();
      localStorage.setItem('bookmarks_categories', JSON.stringify(allCategories));
    }

    window.addEventListener('DOMContentLoaded', initPage);
  </script>
</body>
</html>`;

    // 返回 HTML 响应（核心修复：使用独立变量，避免模板字符串断裂）
    return new Response(htmlContent, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
};
