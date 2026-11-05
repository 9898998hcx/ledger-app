' 记账 App 快捷方式启动器（隐藏控制台，双击不闪黑框）
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
script = fso.BuildPath(here, "launch.ps1")

' 优先用 PowerShell 7，没有就退回系统自带的 Windows PowerShell
ps = fso.BuildPath(fso.GetSpecialFolder(0), "System32\WindowsPowerShell\v1.0\powershell.exe")
candidate = "C:\Program Files\PowerShell\7\pwsh.exe"
If fso.FileExists(candidate) Then ps = candidate

sh.Run """" & ps & """ -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & script & """", 0, False
