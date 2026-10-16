# 验证「到期自动清理」定时任务
# 用法：powershell -File test-cron.ps1 <待清理对象的key>
#
# 原理：用 wrangler dev --remote --test-scheduled 起一个带真实绑定的
#       预览实例（不产生线上流量、不影响正式版本），再手动触发 scheduled
#       处理器，最后确认过期对象确实从 R2 中被删掉。

param([Parameter(Mandatory = $true)][string]$Key)

$ErrorActionPreference = "Continue"
$proj = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $proj

$base = "https://temp-file-share.zhang705287479.workers.dev"
$bucket = "temp-share"
$port = 8788
$wrangler = Join-Path $proj "node_modules\.bin\wrangler.cmd"

$env:CI = "true"
$env:WRANGLER_SEND_METRICS = "false"

function ObjectExists([string]$key) {
  $null = & $wrangler r2 object get "$bucket/$key" --remote --file "$env:TEMP\tfs-probe.bin" 2>&1
  return ($LASTEXITCODE -eq 0)
}

Write-Output "步骤1  清理前对象是否存在: $(ObjectExists $Key)"

$log = Join-Path $env:TEMP "tfs-dev-out.log"
$errlog = Join-Path $env:TEMP "tfs-dev-err.log"
Remove-Item $log, $errlog -ErrorAction SilentlyContinue

$proc = Start-Process -FilePath $wrangler `
  -ArgumentList "dev", "--remote", "--test-scheduled", "--ip", "127.0.0.1", "--port", "$port" `
  -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError $errlog

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 3
  if ($proc.HasExited) { break }
  $code = (curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:$port/" 2>$null)
  if ($code -eq "200") { $ready = $true; break }
}
Write-Output "步骤2  预览实例就绪: $ready"

if ($ready) {
  $t1 = (curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:$port/__scheduled?cron=17+*+*+*+*" 2>$null)
  Write-Output "步骤3  触发 /__scheduled 返回: $t1"
  if ($t1 -ne "200") {
    $t2 = (curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:$port/cdn-cgi/handler/scheduled?cron=17+*+*+*+*" 2>$null)
    Write-Output "步骤3b 触发 /cdn-cgi/handler/scheduled 返回: $t2"
  }
  Start-Sleep -Seconds 5
}

if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

$still = ObjectExists $Key
Write-Output "步骤4  清理后对象是否仍存在: $still"
if ($still) { Write-Output "结果  定时清理未生效（对象仍在）" } else { Write-Output "结果  定时清理生效，过期对象已被删除" }

if (Test-Path $errlog) { Write-Output "---- 预览实例日志(err) ----"; Get-Content $errlog -Tail 20 }
if (Test-Path $log) { Write-Output "---- 预览实例日志(out) ----"; Get-Content $log -Tail 20 }
