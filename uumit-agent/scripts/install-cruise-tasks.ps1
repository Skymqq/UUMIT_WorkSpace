$scriptRoot = "D:\mqq\develop\UUMIT_WorkSpace\uumit-agent\scripts"
$runner = "$scriptRoot\cruise-runner.ps1"
$taskPrefix = "UUMitCruise"

function New-CruiseTask {
    param([string]$Name, [string]$Mode, [int]$Minutes, [string]$Description)
    $taskName = "$taskPrefix-$Name"
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -Mode $Mode"
    $trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes $Minutes) -At (Get-Date).AddMinutes(1) -RepetitionDuration ([TimeSpan]::MaxValue)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -Hidden
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description $Description -Force
    Write-Host "[OK] $taskName - $Description (每 $Minutes 分钟)"
}

Write-Host "=== 注册 UUMit 自动巡航定时任务 ==="
Write-Host ""

try {
    New-CruiseTask -Name "Inbox"    -Mode inbox   -Minutes 5  -Description "UUMit 收件箱巡航：自动审核申请人"
    New-CruiseTask -Name "Apply"    -Mode apply   -Minutes 15 -Description "UUMit 申请巡航：扫描大厅并自动申请"
    New-CruiseTask -Name "Deliver"  -Mode deliver -Minutes 10 -Description "UUMit 交付巡航：自动处理待交付订单"
    New-CruiseTask -Name "Status"   -Mode status  -Minutes 30 -Description "UUMit 状态巡航：账户/钱包对账"

    Write-Host ""
    Write-Host "=== 全部注册成功！4 个巡航任务已安装 ==="
    Write-Host "使用 Get-ScheduledTask -TaskPrefix UUMitCruise 查看状态"
    Write-Host "使用 Unregister-ScheduledTask -TaskName UUMitCruise-* -Confirm 卸载"
} catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "请以管理员身份运行 PowerShell，然后执行："
    Write-Host "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
}
