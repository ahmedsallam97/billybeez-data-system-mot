param([Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
Push-Location $repoRoot
try {
    if ((git branch --show-current) -ne 'ops-migration-local') { throw 'Expected ops-migration-local' }
    $target=[IO.Path]::GetFullPath($OutputFile)
    if (Test-Path -LiteralPath $target) { throw 'Output already exists; overwrite refused' }
    $paths=@('app','lib','public','prisma','scripts','deploy/pilot','package.json','package-lock.json','next.config.js','jsconfig.json','.dockerignore')
    $changed=@(git diff HEAD --name-only -- $paths)
    if ($changed.Count) { Write-Warning 'Working-tree edits are excluded. This archive contains committed HEAD only; confirm the pilot preparation commit is HEAD before using it.' }
    git archive --format=tar.gz --output=$target HEAD -- $paths
    if ($LASTEXITCODE) { throw 'Release archive failed' }
    git rev-parse HEAD
    Get-FileHash -LiteralPath $target -Algorithm SHA256 | Select-Object Hash,Path
} finally { Pop-Location }
