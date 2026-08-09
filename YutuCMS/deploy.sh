#!/bin/bash
set -euo pipefail

# ==========仅此处修改成你新的挂载目录==========
BASE_PATH="/vol2/1000/docker/yutu"
CONTAINER_NAME="yutucms"
IMAGE_NAME="php:5.6-apache"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO] $*${NC}"; }
warn() { echo -e "${YELLOW}[WARN] $*${NC}"; }
error() { echo -e "${RED}[ERROR] $*${NC}"; }

# ====================== 1. 检测并修复Docker权限 ======================
info "===== 1/8 检测 Docker 权限 ====="
if docker info &>/dev/null; then
  info "当前用户已拥有 Docker 权限"
  DOCKER="docker"
else
  warn "当前用户无 Docker 操作权限，开始自动修复..."
  if ! command -v sudo &>/dev/null; then
    error "未找到 sudo 命令，请手动配置权限后重试"
    exit 1
  fi

  sudo usermod -aG docker $USER
  warn "已将当前用户加入 docker 用户组！"
  warn "⚠️ 请退出当前 SSH 会话，重新登录后再次执行本脚本！"
  exit 1
fi

# ====================== 2. 创建项目目录 ======================
info "===== 2/8 创建项目目录 ====="
mkdir -p "${BASE_PATH}" || { error "目录创建失败"; exit 1; }
info "新项目目录：${BASE_PATH}"

# ====================== 3. 生成 docker‑compose.yml ======================
info "===== 3/8 生成编排配置文件 ====="
cat > "${BASE_PATH}/docker-compose.yml" << EOF
version: '3'
services:
  web:
    image: ${IMAGE_NAME}
    container_name: ${CONTAINER_NAME}
    restart: always
    ports:
      - "8000:80"
    volumes:
      - ${BASE_PATH}:/var/www/html
    user: root
    privileged: true
EOF
info "配置文件写入完成"

# ====================== 4. 启动容器 ======================
info "===== 4/8 启动 Docker 容器 ====="
cd "${BASE_PATH}"
$DOCKER compose down --rmi all -v || true
$DOCKER compose up -d

# 等待容器启动超时检测
for i in {1..10}; do
  if $DOCKER inspect "${CONTAINER_NAME}" --format '{{.State.Running}}' 2>/dev/null | grep -q "true"; then
    break
  fi
  info "等待容器启动中... ($i/10)"
  sleep 3
done

if ! $DOCKER inspect "${CONTAINER_NAME}" --format '{{.State.Running}}' | grep -q "true"; then
  error "容器启动失败，请检查网络与镜像"
  exit 1
fi
info "容器启动成功"

# ====================== 5. 容器内环境配置 ======================
info "===== 5/8 配置系统源 + PHP扩展 ====="
$DOCKER exec -u root "${CONTAINER_NAME}" sh -c "
set -e
# 修复 Debian9 失效源
sed -i 's/deb.debian.org/archive.debian.org/g' /etc/apt/sources.list
sed -i 's/security.debian.org/archive.debian.org/g' /etc/apt/sources.list
sed -i '/stretch-updates/d' /etc/apt/sources.list
apt update --allow-insecure-repositories

# 安装 Zip 扩展
apt install -y zlib1g-dev libzip-dev --allow-unauthenticated
docker-php-ext-install zip

# 安装 GD 扩展（验证码依赖）
mkdir -p /var/www/html/JCSQL/cache
chmod 777 /var/www/html/JCSQL/cache
chmod 777 /var/www/html/JCSQL
apt install -y libfreetype6-dev libjpeg-dev libpng-dev --allow-unauthenticated
docker-php-ext-configure gd --with-freetype-dir=/usr --with-jpeg-dir=/usr
docker-php-ext-install gd

# 重启Apache
service apache2 reload

# 全局目录权限
chown -R www-data:www-data /var/www/html
chmod -R 777 /var/www/html/JCSQL
"

# ====================== 6. 检测PHP扩展 ======================
info "===== 6/8 校验 PHP 扩展 ====="
$DOCKER exec "${CONTAINER_NAME}" php -m | grep -q zip && info "✓ Zip 扩展正常" || { error "Zip 扩展加载失败"; exit 1; }
$DOCKER exec "${CONTAINER_NAME}" php -m | grep -q gd && info "✓ GD 扩展正常" || { error "GD 扩展加载失败"; exit 1; }

# ====================== 7. 检测目录权限 ======================
info "===== 7/8 校验缓存目录权限 ====="
$DOCKER exec "${CONTAINER_NAME}" test -d /var/www/html/JCSQL/cache && info "✓ Cache 目录存在" || { error "Cache 目录缺失"; exit 1; }
$DOCKER exec "${CONTAINER_NAME}" test -w /var/www/html/JCSQL/cache && info "✓ Cache 目录可写" || { error "Cache 目录无写入权限"; exit 1; }

# ====================== 8. 部署完成提示 ======================
IP=$(hostname -I | awk '{print $1}')
echo ""
info "============================================="
info "✅ 全部部署配置完成！"
info "项目路径：${BASE_PATH}"
info "访问地址：http://${IP}:8000"
info "请上传 YutuCMS 源码至 /vol2/1000/docker/yutu"
info "============================================="
