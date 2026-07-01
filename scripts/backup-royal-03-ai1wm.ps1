$ErrorActionPreference = 'Stop'

$HostAlias = 'hostinger-royal-03'
$SshExe = 'C:\Windows\System32\OpenSSH\ssh.exe'
$ScpExe = 'C:\Windows\System32\OpenSSH\scp.exe'
$WpCli = '/usr/local/bin/wp'
$LocalRoot = Join-Path (Get-Location) 'backups-royal-03'
$LocalDir = Join-Path $LocalRoot 'overflow-c-tmp'
$ManifestPath = Join-Path $LocalRoot ("manifest-{0}.tsv" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$RemoteZip = '$HOME/tmp/all-in-one-wp-migration-unlimited-extension-2.84n.zip'
$LocalZip = 'E:\plig in\plug in new\all-in-one-wp-migration-unlimited-extension-2.84n.zip'

function Escape-SingleQuotedShell {
    param([Parameter(Mandatory = $true)][string]$Value)
    return "'" + ($Value -replace "'", "'\''") + "'"
}

New-Item -ItemType Directory -Force -Path $LocalRoot | Out-Null
if (-not (Test-Path -LiteralPath $LocalDir)) {
    throw "Local backup data folder is missing: $LocalDir"
}

"domain`tstatus`tremote_path`tremote_size`tlocal_path`tlocal_size`tdeleted`tmessage" | Set-Content -LiteralPath $ManifestPath -Encoding UTF8

& $SshExe $HostAlias 'mkdir -p ~/tmp'
& $ScpExe $LocalZip ("{0}:~/tmp/" -f $HostAlias)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to upload Unlimited Extension zip to $HostAlias"
}

$wpConfigPaths = & $SshExe $HostAlias 'find ~/domains -maxdepth 4 -type f -name wp-config.php -print'
$domains = @(
    $wpConfigPaths |
        ForEach-Object {
            if ($_ -match '/domains/([^/]+)/public_html/wp-config.php$') {
                $Matches[1]
            }
        } |
        Sort-Object -Unique
)

Write-Host ("Found {0} WordPress site(s)." -f $domains.Count)

foreach ($domain in $domains) {
    Write-Host ("=== {0} ===" -f $domain)

    $remoteScript = @"
set -e
cd "`$HOME/domains/$domain/public_html"
if ! $WpCli plugin is-installed all-in-one-wp-migration >/dev/null 2>&1; then
  $WpCli plugin install all-in-one-wp-migration --activate >/dev/null
fi
if ! $WpCli plugin is-active all-in-one-wp-migration >/dev/null 2>&1; then
  $WpCli plugin activate all-in-one-wp-migration >/dev/null
fi
$WpCli plugin install $RemoteZip --force --activate >/dev/null
backup_output=`$($WpCli ai1wm backup 2>&1)
printf '%s\n' "`$backup_output"
backup_path=`$(printf '%s\n' "`$backup_output" | awk -F': ' '/Backup location:/ {print `$2}' | tail -1)
if [ -z "`$backup_path" ]; then
  backup_file=`$(printf '%s\n' "`$backup_output" | awk -F': ' '/Backup file:/ {print `$2}' | tail -1)
  if [ -n "`$backup_file" ]; then
    backup_path="`$HOME/domains/$domain/public_html/wp-content/ai1wm-backups/`$backup_file"
  fi
fi
if [ -z "`$backup_path" ] || [ ! -f "`$backup_path" ]; then
  echo "__CODEX_BACKUP_PATH_MISSING__"
  exit 41
fi
backup_size=`$(stat -c "%s" "`$backup_path")
echo "__CODEX_BACKUP_PATH__`$backup_path"
echo "__CODEX_BACKUP_SIZE__`$backup_size"
"@

    try {
        $output = $remoteScript | & $SshExe $HostAlias 'bash -s'
        $remotePathLine = $output | Where-Object { $_ -like '__CODEX_BACKUP_PATH__*' } | Select-Object -Last 1
        $remoteSizeLine = $output | Where-Object { $_ -like '__CODEX_BACKUP_SIZE__*' } | Select-Object -Last 1

        if (-not $remotePathLine -or -not $remoteSizeLine) {
            throw "Backup path/size marker missing. Output: $($output -join ' | ')"
        }

        $remotePath = $remotePathLine -replace '^__CODEX_BACKUP_PATH__', ''
        [int64]$remoteSize = $remoteSizeLine -replace '^__CODEX_BACKUP_SIZE__', ''
        $fileName = Split-Path -Leaf $remotePath
        $localPath = Join-Path $LocalDir $fileName

        & $ScpExe ("{0}:{1}" -f $HostAlias, $remotePath) $LocalDir
        if ($LASTEXITCODE -ne 0) {
            throw "scp failed for $remotePath"
        }

        $localItem = Get-Item -LiteralPath $localPath
        [int64]$localSize = $localItem.Length

        if ($localSize -ne $remoteSize) {
            throw "Size mismatch. Remote=$remoteSize Local=$localSize"
        }

        $quotedRemotePath = Escape-SingleQuotedShell -Value $remotePath
        $deleteOutput = & $SshExe $HostAlias "rm -f -- $quotedRemotePath && test ! -e $quotedRemotePath && echo DELETED"
        $deleted = if ($deleteOutput -contains 'DELETED') { 'yes' } else { 'no' }
        if ($deleted -ne 'yes') {
            throw "Remote delete did not confirm. Output: $($deleteOutput -join ' | ')"
        }

        "{0}`tOK`t{1}`t{2}`t{3}`t{4}`t{5}`t" -f $domain, $remotePath, $remoteSize, $localPath, $localSize, $deleted |
            Add-Content -LiteralPath $ManifestPath -Encoding UTF8
        Write-Host ("OK {0} {1} bytes" -f $fileName, $localSize)
    }
    catch {
        $message = ($_.Exception.Message -replace "`t", ' ' -replace "`r?`n", ' ')
        "{0}`tERROR`t`t`t`t`tno`t{1}" -f $domain, $message |
            Add-Content -LiteralPath $ManifestPath -Encoding UTF8
        Write-Host ("ERROR {0}: {1}" -f $domain, $message)
    }
}

& $SshExe $HostAlias 'rm -f ~/tmp/all-in-one-wp-migration-unlimited-extension-2.84n.zip'

Write-Host ("Manifest: {0}" -f $ManifestPath)
