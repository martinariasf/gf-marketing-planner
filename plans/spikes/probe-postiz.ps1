# GF-113 TASK-001 - probe the live Postiz Cloud public API.
#
# Purpose: record the REAL response shapes before anyone writes an adapter.
# GF-26 shipped a broken Postiz payload because it was written from the docs
# alone and the tests asserted our own guess. Do not repeat that.
#
# Usage (PowerShell):
#   setx POSTIZ_PROBE_KEY "<a live Postiz Cloud API key>"     # once, then reopen the shell
#   .\plans\spikes\probe-postiz.ps1
#
# The key is read from the environment only. It is never written to disk, never
# printed, and never committed. Raw responses go to the scratchpad, not the repo.

$ErrorActionPreference = "Stop"

$key = $env:POSTIZ_PROBE_KEY
if (-not $key) {
    throw "POSTIZ_PROBE_KEY is not set. Set it as a user environment variable and reopen the shell."
}

$base = $env:POSTIZ_PROBE_BASE
if (-not $base) { $base = "https://api.postiz.com/public/v1" }
$base = $base.TrimEnd("/")

$outDir = Join-Path $env:TEMP "gf113-postiz-probe"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$headers = @{ "Authorization" = $key; "Content-Type" = "application/json" }

# Every call goes through here so we capture status, rate-limit headers and body
# uniformly. Returns a PSCustomObject; never throws on an HTTP error.
function Invoke-Probe {
    param([string]$Label, [string]$Path)

    $url = "$base$Path"
    Write-Host ""
    Write-Host "=== $Label" -ForegroundColor Cyan
    Write-Host "GET $Path"

    $result = [PSCustomObject]@{
        label = $Label; path = $Path; status = $null
        rateLimitHeaders = @{}; body = $null; error = $null
    }

    try {
        $res = Invoke-WebRequest -Uri $url -Method Get -Headers $headers -UseBasicParsing
        $result.status = [int]$res.StatusCode
        foreach ($h in $res.Headers.Keys) {
            if ($h -match "(?i)ratelimit|retry-after") { $result.rateLimitHeaders[$h] = $res.Headers[$h] }
        }
        $result.body = $res.Content
        Write-Host "status: $($result.status)" -ForegroundColor Green
    }
    catch {
        $resp = $_.Exception.Response
        if ($resp) {
            $result.status = [int]$resp.StatusCode
            try {
                $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
                $result.body = $reader.ReadToEnd()
            } catch { }
            foreach ($h in $resp.Headers.AllKeys) {
                if ($h -match "(?i)ratelimit|retry-after") { $result.rateLimitHeaders[$h] = $resp.Headers[$h] }
            }
        }
        $result.error = $_.Exception.Message
        Write-Host "status: $($result.status) - $($result.error)" -ForegroundColor Yellow
    }

    if ($result.rateLimitHeaders.Count -gt 0) {
        Write-Host "rate-limit headers:" -ForegroundColor DarkGray
        foreach ($k in $result.rateLimitHeaders.Keys) { Write-Host "  $k = $($result.rateLimitHeaders[$k])" -ForegroundColor DarkGray }
    } else {
        Write-Host "rate-limit headers: none returned" -ForegroundColor DarkGray
    }

    if ($result.body) {
        $preview = $result.body
        if ($preview.Length -gt 1200) { $preview = $preview.Substring(0, 1200) + " ...[truncated]" }
        Write-Host $preview
    }

    $safeName = ($Label -replace "[^a-zA-Z0-9]+", "-").Trim("-")
    $result.body | Out-File -FilePath (Join-Path $outDir "$safeName.json") -Encoding utf8
    return $result
}

Write-Host "Postiz probe - base $base" -ForegroundColor White
Write-Host "Raw responses will be written to $outDir" -ForegroundColor DarkGray

# 1. Channels. This also gives us the integration UUIDs the analytics endpoint
#    demands (it rejects platform names and display names with 400).
$integrations = Invoke-Probe -Label "01 integrations" -Path "/integrations"

$ids = @()
$platforms = @{}
if ($integrations.status -eq 200 -and $integrations.body) {
    try {
        $parsed = $integrations.body | ConvertFrom-Json
        foreach ($i in $parsed) {
            if ($i.id) {
                $ids += $i.id
                $platforms[$i.id] = $i.identifier
                $state = "enabled"
                if ($i.disabled) { $state = "DISABLED" }
                Write-Host ("  channel: {0,-12} {1,-24} {2}" -f $i.identifier, $i.name, $state) -ForegroundColor DarkGray
            }
        }
    } catch { Write-Host "could not parse integrations as JSON" -ForegroundColor Yellow }
}

if ($ids.Count -eq 0) {
    Write-Host ""
    Write-Host "No channels connected on this account. Channel and post analytics cannot be verified." -ForegroundColor Yellow
    Write-Host "Connect at least one channel in Postiz, then re-run." -ForegroundColor Yellow
}

# 2. Per-channel analytics. Labels differ per platform - that is the point of
#    the probe: we need the real label strings for the i18n map (TASK-012).
foreach ($id in $ids) {
    Invoke-Probe -Label "02 analytics channel $($platforms[$id])" -Path "/analytics/$id`?date=30" | Out-Null
}

# 3. Posts in the last 90 days, with state and releaseURL. This is the join
#    source for reconciling our posts against what Postiz actually published.
$from = (Get-Date).AddDays(-90).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$to = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$posts = Invoke-Probe -Label "03 posts window" -Path "/posts?startDate=$from&endDate=$to"

# 4. Per-post analytics for the first PUBLISHED post. The open question is
#    whether this postId is the same id we already store as
#    publishing.providerJobId.
$publishedId = $null
if ($posts.status -eq 200 -and $posts.body) {
    try {
        $pp = $posts.body | ConvertFrom-Json
        $list = $pp
        if ($pp.posts) { $list = $pp.posts }
        foreach ($p in $list) {
            if ($p.state -eq "PUBLISHED" -and -not $publishedId) { $publishedId = $p.id }
        }
        Write-Host ("  posts returned: {0}; first published id: {1}" -f @($list).Count, $publishedId) -ForegroundColor DarkGray
    } catch { Write-Host "could not parse posts as JSON" -ForegroundColor Yellow }
}

if ($publishedId) {
    Invoke-Probe -Label "04 analytics post" -Path "/analytics/post/$publishedId`?date=30" | Out-Null
} else {
    Write-Host ""
    Write-Host "No PUBLISHED post in the last 90 days - per-post analytics not verified." -ForegroundColor Yellow
}

# 5. Negative control: confirm the documented 400 when the integration id is a
#    platform name rather than a UUID. This is the trap GF-26 fell into.
Invoke-Probe -Label "05 negative platform-name-as-id" -Path "/analytics/instagram`?date=7" | Out-Null

Write-Host ""
Write-Host "Done. Raw responses: $outDir" -ForegroundColor White
Write-Host "Next: paste the redacted shapes into plans/2026-08-24-gf113-performance-postiz-analytics-technical-plan.md under TASK-001." -ForegroundColor White
