Param(
  [string]$Path = ".env.local"
)

# Loads .env.local into current PowerShell session without printing values.
# - Supports quoted values
# - Supports values ending with literal \n (strips it)
# - Ignores comments/blank lines

if (-not (Test-Path $Path)) {
  throw "Missing $Path"
}

$raw = Get-Content $Path -Raw
$lines = $raw -split "`n"

foreach ($line in $lines) {
  $t = $line.Trim()
  if (-not $t) { continue }
  if ($t.StartsWith("#")) { continue }
  $i = $t.IndexOf("=")
  if ($i -lt 1) { continue }

  $k = $t.Substring(0, $i).Trim()
  $v = $t.Substring($i + 1).Trim()

  if (-not $k) { continue }

  if ($k -eq "N8N_WEBHOOK_URL") { $script:__seen_n8n_url = $true }
  if ($k -eq "N8N_WEBHOOK_TOKEN") { $script:__seen_n8n_token = $true }
  if ($k -eq "SUPABASE_ACCESS_TOKEN") { $script:__seen_sb_token = $true }

  if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
    $v = $v.Substring(1, $v.Length - 2)
  }

  if ($v.EndsWith("\n")) {
    $v = $v.Substring(0, $v.Length - 2)
  }

  Set-Item -Path ("env:" + $k) -Value $v | Out-Null
  $script:__count = ($script:__count + 1)
}

if ($null -eq $script:__count) { $script:__count = 0 }
Write-Output ("[envload] set_count=" + $script:__count)
Write-Output ("[envload] seen_N8N_WEBHOOK_URL=" + ([bool]$script:__seen_n8n_url))
Write-Output ("[envload] seen_N8N_WEBHOOK_TOKEN=" + ([bool]$script:__seen_n8n_token))
Write-Output ("[envload] seen_SUPABASE_ACCESS_TOKEN=" + ([bool]$script:__seen_sb_token))

