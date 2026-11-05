# 停止记账 App 本地服务
$conn = Get-NetTCPConnection -LocalPort 4599 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  Stop-Process -Id $conn.OwningProcess -Force
  Write-Output 'stopped'
} else {
  Write-Output 'not running'
}
