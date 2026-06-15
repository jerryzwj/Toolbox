#!/bin/bash
set -euo pipefail

# 配置
BASE_PATH="/vol1/1000/docker/yutu"
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

# --------------------------
# 1. 前置：自动检查并修复 Docker 权限
# --------------------------
info "===== 1/8 自动检查 Docker 权限 ====="
if docker info &>/dev/null; then
  info "当前用户已拥有 Docker 权限，无需 sudo"
  DOCKER="docker"
else
  warn "当前用户无 Docker 权限，尝试修复..."
  if ! command -v sudo &>/dev/null; then
    error "系统未安装 sudo，请手动执行 'usermod -aG docker \$USER' 后重新登录"
    exit 1
  fi

  # 尝试添加用户到 docker 组
  warn "执行：sudo usermod -aG docker $USER"
  sudo usermod -aG docker $USER

  warn "权限已添加！但需要重新登录 SSH 才能生效。"
  warn "请退出当前 SSH 会话，重新登录后再次运行本脚本。"
  exit 1
fi

# --------------------------
# 2. 创建目录
# --------------------------
info "===== 2/8 创建项目目录 ====="
mkdir -p "${BASE_PATH}" || { error "创建目录失败"; exit 1; }
info "目录：${BASE_PATH}"

# --------------------------
# 3. 写入 compose 文件
# --------------------------
info "===== 3/8 写入 docker-compose.yml ====="
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
info "Compose 文件写入完成"

# --------------------------
# 4. 启动容器
# --------------------------
info "===== 4/8 启动容器 ====="
cd "${BASE_PATH}"
$DOCKER compose down --rmi all -v || true
$DOCKER compose up -d

# 等待容器启动
for i in {1..10}; do
  if $DOCKER inspect "${CONTAINER_NAME}" --format '{{.State.Running}}' 2>/dev/null | grep -q "true"; then
    break
  fi
  info "等待容器启动... ($i/10)"
  sleep 3
done

if ! $DOCKER inspect "${CONTAINER_NAME}" --format '{{.State.Running}}' | grep -q "true"; then
  error "容器启动失败，请检查日志"
  exit 1
fi
info "容器已启动"

# --------------------------
# 5. 容器内配置（源+扩展+权限）
# --------------------------
info "===== 5/8 容器内配置 ====="
$DOCKER exec -u root "${CONTAINER_NAME}" sh -c "
set -e

# 修复源
sed -i 's/deb.debian.org/archive.debian.org/g' /etc/apt/sources.list
sed -i 's/security.debian.org/archive.debian.org/g' /etc/apt/sources.list
sed -i '/stretch-updates/d' /etc/apt/sources.list
apt update --allow-insecure-repositories

# 安装 ZIP 扩展
apt install -y zlib1g-dev libzip-dev --allow-unauthenticated
docker-php-ext-install zip

# 安装 GD 扩展（验证码）
mkdir -p /var/www/html/JCSQL/cache
chmod 777 /var/www/html/JCSQL/cache
chmod 777 /var/www/html/JCSQL
apt install -y libfreetype6-dev libjpeg-dev libpng-dev --allow-unauthenticated
docker-php-ext-configure gd --with-freetype-dir=/usr --with-jpeg-dir=/usr
docker-php-ext-install gd

# 重启 Apache
service apache2 reload

# 最终权限
chown -R www-data:www-data /var/www/html
chmod -R 777 /var/www/html/JCSQL
"

# --------------------------
# 6. 关键依赖检查
# --------------------------
info "===== 6/8 检查 PHP 扩展 ====="
$DOCKER exec "${CONTAINER_NAME}" php -m | grep -q zip && info "✓ zip 扩展已加载" || { error "zip 扩展加载失败"; exit 1; }
$DOCKER exec "${CONTAINER_NAME}" php -m | grep -q gd && info "✓ gd 扩展已加载" || { error "gd 扩展加载失败"; exit 1; }

# --------------------------
# 7. 目录权限检查
# --------------------------
info "===== 7/7 检查目录权限 ====="
$DOCKER exec "${CONTAINER_NAME}" test -d /var/www/html/JCSQL/cache && info "✓ cache 目录存在" || { error "cache 目录不存在"; exit 1; }
$DOCKER exec "${CONTAINER_NAME}" test -w /var/www/html/JCSQL/cache && info "✓ cache 目录可写" || { error "cache 目录无写权限"; exit 1; }

# --------------------------
# 8. 完成提示
# --------------------------
IP=$(hostname -I | awk '{print $1}')
echo ""
info "✅ 全部配置完成！"
info "项目路径：${BASE_PATH}"
info "访问地址：http://${IP}:8000"
info "请将 YutuCMS 源码上传到 ${BASE_PATH} 目录"
