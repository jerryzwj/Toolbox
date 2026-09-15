# 飞牛fnOS OVS软交换机部署教程
> 仓库路径：Toolbox/fnOS/OVS-SoftSwitch.md
> 作用：飞牛不使用虚拟机，把剩余网口做成二层软交换机，复用多网口，**仅二层交换，不提供路由/PPPoE/策略分流**

## 环境信息
宿主机：fnOS（飞牛NAS）
网卡清单：
- `enp2s0` → 网口1，原生OVS网桥`enp2s0-ovs`，保留作为上联管理口，连接上级路由器
- `enp3s0` → 网口2
- `enp1s0f0` → 网口3
- `enp1s0f1` → 网口4
- `enp1s0f2` → 网口5
- `enp1s0f3` → 网口6

> 拓扑：
> 上级路由器(PPPoE/DHCP/代理分流) → 飞牛网口1
> 飞牛网口2~6 → PC/电视等终端设备（二层交换机端口）

## ⚠️ 前置警告
1. 本方案仅**二层软交换**，fnOS本身不做拨号、路由、策略代理分流，路由功能交给上级路由器。
2. 软交换由CPU转发，大流量文件传输会占用CPU资源。
3. 严禁网络环路：**不要把网口1和网2~6接入同一个外部交换机**，否则全网断网。
4. 所有操作通过SSH执行，需要开启fnOS的SSH服务，使用系统初始管理员账号。

## 1. fnOS后台开启SSH
1. 登录fnOS Web管理后台
2. 设置 → SSH，开启SSH服务，端口默认22
3. 保存设置

## 2. SSH登录fnOS
Windows PowerShell / Xshell 连接
```bash
ssh admin@飞牛IP
# 登录后切换root
sudo -i
```

## 3\. 临时测试添加网桥端口（立即生效，重启丢失）

```bash
ovs-vsctl add-port enp2s0-ovs enp3s0
ovs-vsctl add-port enp2s0-ovs enp1s0f0
ovs-vsctl add-port enp2s0-ovs enp1s0f1
ovs-vsctl add-port enp2s0-ovs enp1s0f2
ovs-vsctl add-port enp2s0-ovs enp1s0f3
```

### 查看网桥端口确认

```bash
ovs-vsctl list-ports enp2s0-ovs
```

输出包含下面全部网口代表成功：
`enp2s0,enp3s0,enp1s0f0,enp1s0f1,enp1s0f2,enp1s0f3`

> 此时网口 2\~6 已经可以接入设备，设备自动从上级路由获取 IP。
> 问题：重启 fnOS 后配置丢失，需要配置 systemd 开机脚本。
> 
> 

## 4\. 创建开机脚本（自动添加网桥，端口存在自动跳过，避免报错）

新建脚本文件

```bash
nano /usr/local/bin/ovs-bridge-add.sh
```

写入脚本内容

```bash
#!/bin/bash
# 等待OVS服务就绪
sleep 12

add_if_not_exist() {
BR="enp2s0-ovs"
PORT="$1"
if ! ovs-vsctl list-ports "$BR" | grep -q "^${PORT}$";then
    ovs-vsctl add-port "$BR" "$PORT"
fi
}

add_if_not_exist enp3s0
add_if_not_exist enp1s0f0
add_if_not_exist enp1s0f1
add_if_not_exist enp1s0f2
add_if_not_exist enp1s0f3
```

保存退出：`Ctrl+O` 回车保存 → `Ctrl+X` 退出 nano 编辑器

赋予脚本执行权限

```bash
chmod +x /usr/local/bin/ovs-bridge-add.sh
```

## 5\. 创建 systemd 自启服务

```bash
nano /etc/systemd/system/ovs-bridge.service
```

写入服务配置

```ini
[Unit]
Description=OVS桥接多网口交换机
After=openvswitch-switch.service
Requires=openvswitch-switch.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/ovs-bridge-add.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

保存退出：`Ctrl+O` 回车保存 → `Ctrl+X`

## 6\. 启用开机自启并测试

```bash
# 重新加载systemd配置
systemctl daemon-reload
# 设置开机启用
systemctl enable ovs-bridge.service
# 启动服务
systemctl start ovs-bridge.service
# 查看运行状态
systemctl status ovs-bridge.service
```

✅ 正常状态：`Active: active (exited)`，`code=exited, status=0/SUCCESS`

> oneshot 一次性执行脚本，active \(exited\) 属于正常，不是故障。
> 
> 

## 7\. 重启整机验证永久生效

```bash
reboot
```

重启后重新 SSH 登录，执行校验命令：

```bash
ovs-vsctl list-ports enp2s0-ovs
```

网口列表全部保留，说明开机自动加载成功。

# 回滚卸载（恢复 fnOS 默认网络）

```bash
# 删除网桥端口
ovs-vsctl del-port enp2s0-ovs enp3s0
ovs-vsctl del-port enp2s0-ovs enp1s0f0
ovs-vsctl del-port enp2s0-ovs enp1s0f1
ovs-vsctl del-port enp2s0-ovs enp1s0f2
ovs-vsctl del-port enp2s0-ovs enp1s0f3

# 关闭自启、删除服务文件
systemctl disable ovs-bridge.service
rm /etc/systemd/system/ovs-bridge.service
systemctl daemon-reload
```

# 补充说明

1. 链路聚合 Bond ≠ 交换机，不要在 fnOS 图形界面新建链路聚合。

2. 上级路由负责 PPPoE 拨号、DHCP、策略分流（分流指定设备到 ImmortalWrt 代理）。

3. 适合场景：不想跑虚拟机，利用飞牛多网口充当廉价软交换机。

```Plain Text
2. 在本地Toolbox仓库目录执行这几条git命令：
```bash
# 新建文件夹fnOS
mkdir fnOS
# 将上面文本保存到 fnOS/OVS-SoftSwitch.md
# 添加文件到暂存区
git add fnOS/OVS-SoftSwitch.md
# 提交备注
git commit -m "docs: add fnOS OVS soft switch tutorial"
#推送到github
git push origin main
```
