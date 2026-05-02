# scripts/dev.ps1 — 一键启动后端 + 前端开发环境
#
# 用法: powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 [-Port <port>]
#
# 流程:
#   1. 清理旧端口文件
#   2. 后台启动 Python 后端（写 .backend-port）
#   3. 等待端口文件出现
#   4. 启动 Vite 前端（读取 .backend-port 配置 proxy）
#   5. Ctrl+C 自动清理后端进程和端口文件

param([int]$Port = 0)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$PortFile = Join-Path $FrontendDir ".backend-port"

$backendProcess = $null

try {
    # --- 清理旧文件 ---
    if (Test-Path $PortFile) { Remove-Item $PortFile -Force }

    # --- 启动后端 ---
    Write-Host "Starting backend..." -ForegroundColor Green
    $portArg = if ($Port -gt 0) { "--port", $Port.ToString() } else { @() }
    $backendProcess = Start-Process -FilePath "python" `
        -ArgumentList (@("-m", "src.cli", "serve") + $portArg) `
        -WorkingDirectory $BackendDir `
        -NoNewWindow -PassThru

    # --- 等待端口文件 ---
    Write-Host "Waiting for backend..." -ForegroundColor Yellow
    for ($i = 0; $i -lt 30; $i++) {
        if (Test-Path $PortFile) { break }
        Start-Sleep -Seconds 1
    }

    if (-not (Test-Path $PortFile)) {
        Write-Host "ERROR: Backend failed to start within 30s" -ForegroundColor Red
        exit 1
    }

    $actualPort = (Get-Content $PortFile).Trim()
    Write-Host "Backend ready on port $actualPort" -ForegroundColor Green

    # --- 启动前端 ---
    Write-Host "Starting frontend..." -ForegroundColor Green
    Push-Location $FrontendDir
    npx vite
}
finally {
    Write-Host ""
    Write-Host "Cleaning up..." -ForegroundColor Yellow
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Write-Host "Stopping backend (PID $($backendProcess.Id))..."
        $backendProcess.Kill($true)
    }
    if (Test-Path $PortFile) { Remove-Item $PortFile -Force }
    Pop-Location -ErrorAction SilentlyContinue
    Write-Host "Done." -ForegroundColor Green
}
