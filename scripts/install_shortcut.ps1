# Create (or refresh) the "nlpilot IDE" desktop shortcut with the app icon.
# Usage:  .\scripts\install_shortcut.ps1

$Repo = Split-Path -Parent $PSScriptRoot
$Desktop = [Environment]::GetFolderPath('Desktop')
$LnkPath = Join-Path $Desktop "nlpilot IDE.lnk"

$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($LnkPath)
$lnk.TargetPath = "powershell.exe"
$lnk.Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Repo\scripts\start.ps1`" -Desktop"
$lnk.WorkingDirectory = $Repo
$lnk.IconLocation = "$Repo\nlpilot_ide\desktop\nlpilot-ide.ico,0"
$lnk.Description = "nlpilot IDE - natural-language automation debugger"
$lnk.WindowStyle = 7  # minimized: hides the brief console window
$lnk.Save()

Write-Host "Shortcut created: $LnkPath" -ForegroundColor Green
