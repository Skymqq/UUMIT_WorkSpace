param([string]$Mode = "all")

$UUMIT_SKILL_DIR = "D:\mqq\develop\UUMIT_WorkSpace\uumit-agent"
$node = "node"
$logDir = "$UUMIT_SKILL_DIR\memory\runtime\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

function Run-Cruise {
    param([string]$Script, [string]$Name, [string]$LogFile)
    $result = & $node "$UUMIT_SKILL_DIR\scripts\$Script" 2>&1
    $result | Out-File -LiteralPath "$logDir\$LogFile" -Encoding utf8 -Append
    return $result
}

switch ($Mode) {
    "inbox" {
        Run-Cruise -Script "cruise_inbox_tick.js" -Name "inbox" -LogFile "inbox-$timestamp.log"
        break
    }
    "apply" {
        Run-Cruise -Script "cruise_apply_tick.js" -Name "apply" -LogFile "apply-$timestamp.log"
        break
    }
    "deliver" {
        Run-Cruise -Script "cruise_deliver_tick.js" -Name "deliver" -LogFile "deliver-$timestamp.log"
        break
    }
    "status" {
        Run-Cruise -Script "cruise_tick.js" -Name "status" -LogFile "status-$timestamp.log"
        break
    }
    "toku" {
        Write-Host "[toku] Scanning jobs and auto-bidding..."
        & $node "$UUMIT_SKILL_DIR\scripts\toku_tick.js" 2>&1 | Out-File -LiteralPath "$logDir\toku-$timestamp.log" -Encoding utf8 -Append
        break
    }
    default {
        Run-Cruise -Script "cruise_inbox_tick.js" -Name "inbox" -LogFile "inbox-$timestamp.log"
        Run-Cruise -Script "cruise_apply_tick.js" -Name "apply" -LogFile "apply-$timestamp.log"
        Run-Cruise -Script "cruise_deliver_tick.js" -Name "deliver" -LogFile "deliver-$timestamp.log"
        Run-Cruise -Script "cruise_tick.js" -Name "status" -LogFile "status-$timestamp.log"
        & $node "$UUMIT_SKILL_DIR\scripts\toku_tick.js" 2>&1 | Out-File -LiteralPath "$logDir\toku-$timestamp.log" -Encoding utf8 -Append
    }
}
