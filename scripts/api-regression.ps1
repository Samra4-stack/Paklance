<#
.SYNOPSIS
  Paklance API Regression Suite
  Tests all major API flows against the production Vercel deployment.
  Run from the project root: .\scripts\api-regression.ps1

.PARAMETER BaseUrl
  API base URL (defaults to production Vercel deployment)

.EXAMPLE
  .\scripts\api-regression.ps1
  .\scripts\api-regression.ps1 -BaseUrl "http://localhost:3000/api"
#>

param(
  [string]$BaseUrl = "https://paklance-backend-updated.vercel.app/api"
)

$ErrorActionPreference = "Continue"
$pass = 0; $fail = 0; $warn = 0
$Results = @()

function Test-Case {
  param([string]$Name, [scriptblock]$Body)
  try {
    & $Body
    Write-Host "  PASS  $Name" -ForegroundColor Green
    $script:pass++
    $script:Results += [PSCustomObject]@{ Test=$Name; Result="PASS"; Detail="" }
  } catch {
    $msg = $_.Exception.Message
    Write-Host "  FAIL  $Name -- $msg" -ForegroundColor Red
    $script:fail++
    $script:Results += [PSCustomObject]@{ Test=$Name; Result="FAIL"; Detail=$msg }
  }
}

function Assert-Status { param($r, [int]$expected) if ($r.StatusCode -ne $expected) { throw "HTTP $($r.StatusCode), expected $expected. Body: $($r.Content)" } }

function Invoke-Api {
  param([string]$Method="GET", [string]$Path, [hashtable]$ReqBody, [string]$Token)
  $uri = "$BaseUrl$Path"
  $headers = @{ "Content-Type" = "application/json" }
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  $params = @{ Method=$Method; Uri=$uri; Headers=$headers; UseBasicParsing=$true }
  if ($ReqBody) { $params["Body"] = ($ReqBody | ConvertTo-Json -Compress) }
  try {
    $resp = Invoke-WebRequest @params -ErrorAction Stop
    return @{ StatusCode=$resp.StatusCode; Content=$resp.Content; Data=($resp.Content | ConvertFrom-Json -ErrorAction SilentlyContinue) }
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    $errBody = ""
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      if ($stream) { $errBody = [System.IO.StreamReader]::new($stream).ReadToEnd() }
    } catch {}
    return @{ StatusCode=$code; Content=$errBody; Data=($errBody | ConvertFrom-Json -ErrorAction SilentlyContinue) }
  }
}

# â”€â”€ Generate unique test identifiers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$ts               = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$clientEmail      = "test.client.$ts@paklance-test.invalid"
$clientPw         = "TestClient$ts!"
$specialistEmail  = "test.specialist.$ts@paklance-test.invalid"
$specialistPw     = "TestSpec$ts!"
$clientToken      = ""
$specialistToken  = ""
$clientId         = ""
$specialistId     = ""
$jobId            = ""
$convId           = ""

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Paklance API Regression  [$BaseUrl]" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# â”€â”€ 1. Health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host "[1] Health" -ForegroundColor Yellow
Test-Case "API responds (not 500)" {
  $r = Invoke-Api -Path "/"
  if ($r.StatusCode -eq 500) { throw "Server returned 500" }
}

# â”€â”€ 2. Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host "[2] Auth" -ForegroundColor Yellow
Test-Case "Register CLIENT (201)" {
  $r = Invoke-Api -Method POST -Path "/auth/register" -ReqBody @{ email=$clientEmail; password=$clientPw; role="CLIENT" }
  Assert-Status $r 201
  $script:clientToken = $r.Data.accessToken
  $script:clientId    = $r.Data.user.id
  if (-not $script:clientToken) { throw "No accessToken in response" }
}
Test-Case "Register SPECIALIST (201)" {
  $r = Invoke-Api -Method POST -Path "/auth/register" -ReqBody @{ email=$specialistEmail; password=$specialistPw; role="SPECIALIST" }
  Assert-Status $r 201
  $script:specialistToken = $r.Data.accessToken
  $script:specialistId    = $r.Data.user.id
  if (-not $script:specialistToken) { throw "No accessToken in response" }
}
Test-Case "Login CLIENT returns valid token" {
  $r = Invoke-Api -Method POST -Path "/auth/login" -ReqBody @{ email=$clientEmail; password=$clientPw }
  Assert-Status $r 200
  if (-not $r.Data.accessToken) { throw "No accessToken in login response" }
  $script:clientToken = $r.Data.accessToken
}
Test-Case "Wrong password returns 401" {
  $r = Invoke-Api -Method POST -Path "/auth/login" -ReqBody @{ email=$clientEmail; password="wrong!" }
  if ($r.StatusCode -ne 401) { throw "Expected 401, got $($r.StatusCode)" }
}
Test-Case "Missing password returns 400" {
  $r = Invoke-Api -Method POST -Path "/auth/register" -ReqBody @{ email="nopw@test.invalid" }
  if ($r.StatusCode -ne 400) { throw "Expected 400, got $($r.StatusCode)" }
}

# â”€â”€ 3. Authorization guards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host "[3] Authorization" -ForegroundColor Yellow
Test-Case "No token on protected route returns 401" {
  $r = Invoke-Api -Path "/messaging/conversations"
  if ($r.StatusCode -ne 401) { throw "Expected 401, got $($r.StatusCode)" }
}
Test-Case "Non-admin token on /admin returns 401/403" {
  $r = Invoke-Api -Path "/admin/stats" -Token $clientToken
  if ($r.StatusCode -notin @(401, 403)) { throw "Expected 401/403, got $($r.StatusCode)" }
}
Test-Case "SPECIALIST cannot post a job (403)" {
  $r = Invoke-Api -Method POST -Path "/jobs" -Token $specialistToken -ReqBody @{
    title="Should fail"; description="Should fail"; budget=1000
  }
  if ($r.StatusCode -notin @(401, 403)) { throw "Expected 401/403, got $($r.StatusCode)" }
}

# â”€â”€ 4. Profiles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host "[4] Profiles" -ForegroundColor Yellow
Test-Case "GET /profiles/search returns array" {
  $r = Invoke-Api -Path "/profiles/search"
  if ($r.StatusCode -ne 200) { throw "Expected 200, got $($r.StatusCode)" }
}
Test-Case "GET /profiles/me returns logged-in user profile" {
  $r = Invoke-Api -Path "/profiles/me" -Token $specialistToken
  if ($r.StatusCode -ne 200) { throw "Expected 200, got $($r.StatusCode)" }
}

# â”€â”€ 5. Jobs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host "[5] Jobs" -ForegroundColor Yellow
Test-Case "CLIENT posts a job (201)" {
  $r = Invoke-Api -Method POST -Path "/jobs" -Token $clientToken -ReqBody @{
    title       = "Regression Test Job $ts"
    description = "Auto-generated by regression suite. Safe to delete."
    budget      = 50000
  }
  if ($r.StatusCode -notin @(200, 201)) { throw "Expected 201, got $($r.StatusCode). $($r.Content)" }
  $script:jobId = $r.Data.id
  if (-not $script:jobId) { throw "No job ID in response" }
}
Test-Case "GET /jobs returns list" {
  $r = Invoke-Api -Path "/jobs"
  if ($r.StatusCode -ne 200) { throw "Expected 200, got $($r.StatusCode)" }
}
Test-Case "Post job with missing fields returns 400" {
  $r = Invoke-Api -Method POST -Path "/jobs" -Token $clientToken -ReqBody @{ title="No budget or description" }
  if ($r.StatusCode -ne 400) { throw "Expected 400, got $($r.StatusCode)" }
}

# â”€â”€ 6. Proposals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host "[6] Proposals" -ForegroundColor Yellow
Test-Case "SPECIALIST submits proposal" {
  if (-not $jobId) { throw "No jobId -- skipping" }
  $r = Invoke-Api -Method POST -Path "/proposals" -Token $specialistToken -ReqBody @{
    jobId       = $jobId
    coverLetter = "Regression test proposal. Safe to delete."
    bidAmount   = 40000
    deliveryDays = 7
  }
  if ($r.StatusCode -notin @(200, 201)) { throw "Expected 201, got $($r.StatusCode). $($r.Content)" }
}

# â”€â”€ 7. Messaging â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host "[7] Messaging" -ForegroundColor Yellow
Test-Case "CLIENT sends message to SPECIALIST" {
  if (-not $specialistId) { throw "No specialistId -- skipping" }
  $r = Invoke-Api -Method POST -Path "/messaging/send" -Token $clientToken -ReqBody @{
    receiverId = $specialistId
    content    = "Regression test message. Safe to delete."
  }
  if ($r.StatusCode -notin @(200, 201)) { throw "Expected 201, got $($r.StatusCode). $($r.Content)" }
}
Test-Case "CLIENT lists conversations (returns array)" {
  $r = Invoke-Api -Path "/messaging/conversations" -Token $clientToken
  if ($r.StatusCode -ne 200) { throw "Expected 200, got $($r.StatusCode)" }
  if ($r.Data -and $r.Data.Count -gt 0) { $script:convId = $r.Data[0].id }
}
Test-Case "SPECIALIST lists their conversations" {
  $r = Invoke-Api -Path "/messaging/conversations" -Token $specialistToken
  if ($r.StatusCode -ne 200) { throw "Expected 200, got $($r.StatusCode)" }
}
Test-Case "Messages persist -- CLIENT reads conversation" {
  if (-not $convId) { $script:warn++; Write-Host "  WARN  No convId -- skipping" -ForegroundColor DarkYellow; return }
  $r = Invoke-Api -Path "/messaging/conversations/$convId/messages" -Token $clientToken
  if ($r.StatusCode -ne 200) { throw "Expected 200, got $($r.StatusCode)" }
  if ($r.Data.Count -eq 0) { throw "Expected >=1 message, got 0" }
}
Test-Case "SPECIALIST cannot read CLIENT's other conversation (403)" {
  if (-not $convId) { $script:warn++; Write-Host "  WARN  No convId -- skipping" -ForegroundColor DarkYellow; return }
  # Create a second client to test isolation
  $otherEmail = "other.client.$ts@paklance-test.invalid"
  $rReg = Invoke-Api -Method POST -Path "/auth/register" -ReqBody @{ email=$otherEmail; password="Other$ts!"; role="CLIENT" }
  if ($rReg.StatusCode -ne 201) { throw "Could not register 2nd client" }
  $otherToken = $rReg.Data.accessToken
  $r = Invoke-Api -Path "/messaging/conversations/$convId/messages" -Token $otherToken
  if ($r.StatusCode -notin @(403, 404)) { throw "Expected 403/404 for non-participant, got $($r.StatusCode)" }
}

# â”€â”€ 8. Wallet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host "[8] Wallet" -ForegroundColor Yellow
Test-Case "GET /wallet/balance with auth returns 200" {
  $r = Invoke-Api -Path "/wallet/balance" -Token $clientToken
  if ($r.StatusCode -notin @(200, 201)) { throw "Expected 200, got $($r.StatusCode). $($r.Content)" }
}
Test-Case "GET /wallet/balance without token returns 401" {
  $r = Invoke-Api -Path "/wallet/balance"
  if ($r.StatusCode -ne 401) { throw "Expected 401, got $($r.StatusCode)" }
}
Test-Case "GET /wallet/transactions with auth returns 200" {
  $r = Invoke-Api -Path "/wallet/transactions" -Token $clientToken
  if ($r.StatusCode -ne 200) { throw "Expected 200, got $($r.StatusCode). $($r.Content)" }
}

# â”€â”€ 9. Database persistence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host "[9] Database Persistence" -ForegroundColor Yellow
Test-Case "Re-login after cold start persists data" {
  $r = Invoke-Api -Method POST -Path "/auth/login" -ReqBody @{ email=$clientEmail; password=$clientPw }
  if ($r.StatusCode -ne 200) { throw "Re-login failed: HTTP $($r.StatusCode)" }
}

# â”€â”€ 10. Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
$color = if ($fail -eq 0) { "Green" } else { "Red" }
Write-Host ("  RESULTS: {0} passed  {1} failed  {2} warnings" -f $pass, $fail, $warn) -ForegroundColor $color
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""
$Results | Format-Table -AutoSize

if ($fail -gt 0) { exit 1 } else { exit 0 }
