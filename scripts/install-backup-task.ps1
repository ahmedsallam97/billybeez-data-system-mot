$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$TaskName = "BillyBeez Daily Database Backup"
$NodeCommand = "npm"
$Arguments = "run db:backup"
$Action = New-ScheduledTaskAction -Execute $NodeCommand -Argument $Arguments -WorkingDirectory $ProjectRoot
$Trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description "Creates a daily backup of the BillyBeez local database." `
  -Force

Write-Host "Scheduled task installed: $TaskName"
