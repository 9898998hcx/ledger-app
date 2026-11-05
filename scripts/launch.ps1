# 记账 App 启动器：确保本地服务运行，用独立 Edge 应用窗口打开最新版本
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$url = 'http://127.0.0.1:4599'
$profileDir = Join-Path $root '.edge-profile'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'node' }

$winCode = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class LedgerWin {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  public static IntPtr Find(string titlePart) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(256);
      GetWindowText(h, sb, 256);
      if (sb.ToString().IndexOf(titlePart) >= 0) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static void Close(IntPtr h) { PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero); }
}
'@
Add-Type -TypeDefinition $winCode -Language CSharp

function Test-App {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    return $r.StatusCode -eq 200
  } catch {
    return $false
  }
}

# 关闭已打开的旧窗口，确保每次启动都加载最新构建（数据保存在 IndexedDB，不受影响）
$existing = [LedgerWin]::Find('记账 App')
while ($existing -ne [IntPtr]::Zero) {
  [LedgerWin]::Close($existing)
  Start-Sleep -Milliseconds 600
  $existing = [LedgerWin]::Find('记账 App')
}

if (-not (Test-App)) {
  Start-Process -FilePath $node -ArgumentList ('"' + (Join-Path $root 'scripts\serve.mjs') + '"') -WindowStyle Hidden
  for ($i = 0; $i -lt 24; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-App) { break }
  }
}

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { $edge = 'C:\Program Files\Microsoft\Edge\Application\msedge.exe' }

# 独立 user-data-dir：不与日常浏览器配置冲突；启动为最大化窗口，UI 内可切换全屏
$args = @(
  '--app=' + $url,
  '--start-maximized',
  '--user-data-dir=' + $profileDir,
  '--no-first-run',
  '--no-default-browser-check'
)

if (Test-Path $edge) {
  Start-Process -FilePath $edge -ArgumentList $args
} else {
  Start-Process $url
}
