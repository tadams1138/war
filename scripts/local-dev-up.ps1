<#
.SYNOPSIS
  Stands up a full local War environment behind HTTPS on port 3000: Postgres,
  MinIO (S3-compatible object storage, for contestant images), war-api, and
  war-ui-default's dev server, unified under one self-signed HTTPS origin
  (nginx does all the TLS work) -- so real OAuth login works locally, on the
  same port you've already registered with providers.

.DESCRIPTION
  Idempotent -- safe to re-run. Requires Docker Desktop running and Node 24+.

  Why HTTPS at all: war-api's refresh-token cookie is marked Secure (by
  design -- war-api\src\auth\routes.ts), so the browser will only store it
  over HTTPS. nginx terminates TLS with a self-signed cert (untrusted by
  design -- click through the browser's warning once) on port 3000 -- the
  externally-visible port -- and reverse-proxies both war-api (path /api/,
  running plain HTTP internally on 3001) and the Vite dev server (everything
  else, on 5173) behind it. war-api itself never speaks TLS; nginx is the
  only thing that does. One origin, same shape as staging/production
  (path-routed, not cross-origin).

  ONE-TIME MANUAL STEP: update each OAuth provider's registered redirect URI
  from your old http://localhost:3000/... to:

      https://localhost:3000/api/v1/auth/<provider>/callback

  IMPORTANT: war-api refuses to boot at all without OAuth credentials for
  every provider (Google, Microsoft, Facebook, Twitter/X) -- enforced
  unconditionally by assertProductionConfig in war-api\src\config.ts, even
  for a local run. war-api\.env.secrets is the ONE file you maintain by
  hand for this: created once (with JWT_SECRET/INTERNAL_TASK_TOKEN already
  filled in) and never touched again -- fill in the OAuth credentials there
  and rerun. war-api\.env itself is fully regenerated every run from
  .env.secrets plus this script's own local-dev config; never hand-edit it.

.NOTES
  Run from the repository root (e.g. `.\scripts\local-dev-up.ps1`).
#>

$ErrorActionPreference = 'Stop'
# Without this, PowerShell 7's default treats ANY non-zero exit code from a
# native command (docker, npm, ...) as a terminating error under
# $ErrorActionPreference = 'Stop' -- regardless of stream redirection --
# which fires before any of this script's own `if ($LASTEXITCODE -ne 0)`
# checks ever run (e.g. `docker rm -f` on a container that doesn't exist
# yet, an entirely expected case here, not a real failure).
$PSNativeCommandUseErrorActionPreference = $false

$PgContainer = 'war-local-postgres'
$PgUser = 'war'
$PgPassword = 'war'
$PgDb = 'war_api'
$PgPort = 5432
$ApiInternalPort = 3001
$ExternalPort = 3000
$UiPort = 5173
$NginxContainer = 'war-local-nginx'
$CertContainer = 'war-local-certgen'
$NginxDir = "$PSScriptRoot\nginx"
$CertsDir = "$NginxDir\certs"
$Origin = "https://localhost:${ExternalPort}"
$MinioContainer = 'war-local-minio'
$MinioUser = 'warminio'
$MinioPassword = 'warminio-local-secret'
$MinioPort = 9000
$MinioConsolePort = 9090
$MinioBucket = 'war-media-dev'

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Warn([string]$Message) {
    Write-Host "!!  $Message" -ForegroundColor Yellow
}

# PowerShell treats ANY stderr text from a native command as an error-stream
# record, which terminates under $ErrorActionPreference = 'Stop' the instant
# it's emitted -- independent of exit code, and independent of `*> $null`
# redirection (the throw happens before redirection gets a chance to discard
# it). Every docker/openssl call below goes through this so stderr chatter
# (docker's own "No such container" on an expected-missing one, openssl's
# routine progress output, an image pull's progress lines, ...) never aborts
# the script -- callers check success their own way afterward ($LASTEXITCODE,
# a file that should now exist, a container that should now be running).
function Invoke-Native([scriptblock]$Action) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Action
    } finally {
        $ErrorActionPreference = $previous
    }
}

if (-not (Test-Path 'war-api') -or -not (Test-Path 'war-ui-default')) {
    throw "Run this from the repository root -- war-api/ and war-ui-default/ weren't found under $($PWD.Path)."
}

# --- 1. Docker ------------------------------------------------------------------
Write-Step 'Checking Docker'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is required but wasn't found on PATH. Install Docker Desktop and try again."
}
Invoke-Native { docker info *> $null }
if ($LASTEXITCODE -ne 0) {
    throw 'Docker is installed but not running. Start Docker Desktop and try again.'
}

# --- 2. Postgres ------------------------------------------------------------------
Write-Step "Starting Postgres ($PgContainer)"
$existing = ''
Invoke-Native { $script:existing = docker ps -a --filter "name=^/$PgContainer`$" --format '{{.Names}}' }
if ($existing -eq $PgContainer) {
    $running = ''
    Invoke-Native { $script:running = docker ps --filter "name=^/$PgContainer`$" --format '{{.Names}}' }
    if ($running -eq $PgContainer) {
        Write-Host 'Already running.'
    } else {
        Invoke-Native { docker start $PgContainer *> $null }
    }
} else {
    Invoke-Native {
        docker run -d --name $PgContainer `
            -e POSTGRES_USER=$PgUser -e POSTGRES_PASSWORD=$PgPassword -e POSTGRES_DB=$PgDb `
            -p "${PgPort}:5432" `
            postgres:16-alpine *> $null
    }
}

Write-Step 'Waiting for Postgres to accept connections'
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Invoke-Native { docker exec $PgContainer pg_isready -U $PgUser *> $null }
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) { throw "Postgres in $PgContainer didn't become ready in time." }

# --- 3. MinIO (S3-compatible object storage for contestant images) ---------------
# war-api's contestant-image upload needs real S3 credentials -- with none
# configured, the AWS SDK sends an empty Authorization header and S3 (or
# here, MinIO) rejects it outright. war-api\.env.example's own
# S3_PUBLIC_BASE_URL default (http://localhost:9000/...) already points at
# MinIO's default port, so this mirrors what it was clearly meant to run
# against locally.
Write-Step "Starting MinIO ($MinioContainer)"
$minioExisting = ''
Invoke-Native { $script:minioExisting = docker ps -a --filter "name=^/$MinioContainer`$" --format '{{.Names}}' }
if ($minioExisting -eq $MinioContainer) {
    $minioRunning = ''
    Invoke-Native { $script:minioRunning = docker ps --filter "name=^/$MinioContainer`$" --format '{{.Names}}' }
    if ($minioRunning -eq $MinioContainer) {
        Write-Host 'Already running.'
    } else {
        Invoke-Native { docker start $MinioContainer *> $null }
    }
} else {
    Invoke-Native {
        docker run -d --name $MinioContainer `
            -e MINIO_ROOT_USER=$MinioUser -e MINIO_ROOT_PASSWORD=$MinioPassword `
            -p "${MinioPort}:9000" -p "${MinioConsolePort}:9090" `
            quay.io/minio/minio server /data --console-address ":9090" *> $null
    }
}
# Fail fast, before burning the readiness loop below on a container that
# never actually started (a bad image pull, a port conflict, ...) --
# `docker run -d`'s own exit code is meaningless here since Invoke-Native
# discards it; whether the container exists and is running is the real
# signal.
$minioNowRunning = ''
Invoke-Native { $script:minioNowRunning = docker ps --filter "name=^/$MinioContainer`$" --format '{{.Names}}' }
if ($minioNowRunning -ne $MinioContainer) {
    throw "MinIO ($MinioContainer) didn't start -- run ``docker logs $MinioContainer`` (or, if that says ``No such container``, `` docker run`` itself failed -- rerun the ``docker run`` line above by hand to see why, e.g. a port $MinioPort/$MinioConsolePort conflict)."
}

Write-Step 'Waiting for MinIO to accept connections, then ensuring the bucket exists and is public-read'
$minioReady = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:${MinioPort}/minio/health/live" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) { $minioReady = $true; break }
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $minioReady) { throw "MinIO in $MinioContainer didn't become ready in time -- run ``docker logs $MinioContainer``." }

# --entrypoint sh: the image's own entrypoint is `mc` itself, so `mc ... sh
# -c "..."` would parse `sh` as an (unknown) mc subcommand rather than
# actually invoking a shell -- overriding it is what makes the `&&` chain
# below run as a shell script instead.
Invoke-Native {
    docker run --rm --add-host "host.docker.internal:host-gateway" --entrypoint sh quay.io/minio/mc `
        -c "mc alias set local http://host.docker.internal:${MinioPort} $MinioUser $MinioPassword && mc mb --ignore-existing local/$MinioBucket && mc anonymous set download local/$MinioBucket" *> $null
}
if ($LASTEXITCODE -ne 0) {
    throw "Failed to create/configure the '$MinioBucket' bucket on MinIO -- run ``docker logs $MinioContainer`` to check it's healthy."
}

# --- 4. Self-signed cert for nginx -----------------------------------------------
Write-Step 'Checking self-signed HTTPS cert'
New-Item -ItemType Directory -Force -Path $CertsDir | Out-Null
$CertPath = "$CertsDir\localhost.crt"
$KeyPath = "$CertsDir\localhost.key"

$needsCert = -not (Test-Path $CertPath) -or -not (Test-Path $KeyPath)
if (-not $needsCert) {
    try {
        $existingCert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($CertPath)
        try {
            if ($existingCert.NotAfter -lt (Get-Date)) {
                Write-Warn "Existing cert expired $($existingCert.NotAfter) -- deleting and generating a new one."
                Remove-Item -Force $CertPath, $KeyPath
                $needsCert = $true
            } else {
                Write-Host "Already have one, valid until $($existingCert.NotAfter)."
            }
        } finally {
            $existingCert.Dispose()
        }
    } catch {
        Write-Warn "Existing cert couldn't be read ($($_.Exception.Message)) -- deleting and generating a new one."
        Remove-Item -Force $CertPath, $KeyPath -ErrorAction SilentlyContinue
        $needsCert = $true
    }
}

if ($needsCert) {
    Write-Host "Generating one (825-day, CN=localhost) -- your browser will not trust it; that's expected."
    Invoke-Native {
        docker run --rm --name $CertContainer -v "${CertsDir}:/certs" alpine/openssl req -x509 -nodes `
            -newkey rsa:2048 `
            -keyout /certs/localhost.key -out /certs/localhost.crt `
            -days 825 -subj '/CN=localhost' `
            -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' *> $null
    }
    if (-not (Test-Path $CertPath) -or -not (Test-Path $KeyPath)) {
        throw "Failed to generate the self-signed cert into $CertsDir -- check Docker can pull alpine/openssl."
    }
}

# --- 5. war-api\.env.secrets (yours -- created once, never touched again) --------
# and war-api\.env (fully regenerated every run -- never hand-edit it). The
# split exists so the only file you ever need to look at or remember is
# .env.secrets, and it only ever holds genuinely secret/manual values --
# everything else about this script's local-dev shape (Postgres/MinIO/nginx
# ports and URLs) is derived and written fresh into .env each run.
$SecretsPath = 'war-api\.env.secrets'
$EnvPath = 'war-api\.env'
$OAuthVars = @(
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET',
    'FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET', 'TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'
)

if (-not (Test-Path $SecretsPath)) {
    # Migrate forward rather than starting blank: an existing war-api\.env
    # from before this split (or from hand-editing) may already carry real,
    # working OAuth credentials -- losing those the first time this script
    # introduces .env.secrets would be a real regression, not just a
    # missing convenience.
    $migrated = @{}
    if (Test-Path $EnvPath) {
        Write-Step "Creating $SecretsPath (migrating values out of the existing $EnvPath)"
        Get-Content $EnvPath | Where-Object { $_ -match '^\s*[^#][^=]+=' } | ForEach-Object {
            $name, $value = $_.Split('=', 2)
            $migrated[$name.Trim()] = $value
        }
    } else {
        Write-Step "Creating $SecretsPath"
    }
    $jwtSecret = if ($migrated['JWT_SECRET']) { $migrated['JWT_SECRET'] } else { [Guid]::NewGuid().ToString('N') }
    $internalToken = if ($migrated['INTERNAL_TASK_TOKEN']) { $migrated['INTERNAL_TASK_TOKEN'] } else { [Guid]::NewGuid().ToString('N') }
    $secretsLines = @(
        '# Yours to maintain -- created once by scripts\local-dev-up.ps1 and never',
        '# touched again (unlike war-api\.env, which it fully regenerates every run',
        '# from this file plus its own local-dev config -- never hand-edit .env).',
        '#',
        '# JWT_SECRET/INTERNAL_TASK_TOKEN below are already filled in with generated',
        '# values; you never need to touch those. Fill in credentials for whichever',
        '# OAuth provider(s) you want to test locally -- war-api will not boot until',
        '# all four are non-empty (config.ts, assertProductionConfig).',
        "JWT_SECRET=$jwtSecret",
        "INTERNAL_TASK_TOKEN=$internalToken"
    )
    foreach ($oauthVar in $OAuthVars) {
        $secretsLines += "$oauthVar=$($migrated[$oauthVar])"
    }
    $secretsLines | Set-Content $SecretsPath
    if ($migrated.Count -gt 0) {
        Write-Host 'Migrated existing values across -- nothing you had working before should have changed.'
    } else {
        Write-Warn "$SecretsPath created -- fill in OAuth credentials for GOOGLE/MICROSOFT/FACEBOOK/TWITTER"
        Write-Warn 'before war-api will boot.'
    }
} else {
    Write-Host "$SecretsPath already exists -- leaving it as-is."
}

$secrets = @{}
Get-Content $SecretsPath | Where-Object { $_ -match '^\s*[^#][^=]+=' } | ForEach-Object {
    $name, $value = $_.Split('=', 2)
    $secrets[$name.Trim()] = $value
}

$DatabaseUrl = "postgres://${PgUser}:${PgPassword}@localhost:${PgPort}/${PgDb}"
$MinioPublicBaseUrl = "http://localhost:${MinioPort}/${MinioBucket}"
$envLines = @(
    '# Generated fresh by scripts\local-dev-up.ps1 every run -- do not hand-edit;',
    '# edit war-api\.env.secrets instead and rerun the script.',
    "PORT=$ApiInternalPort",
    "DATABASE_URL=$DatabaseUrl",
    "UI_ORIGINS=$Origin",
    "JWT_SECRET=$($secrets['JWT_SECRET'])",
    "PUBLIC_BASE_URL=$Origin",
    "INTERNAL_TASK_TOKEN=$($secrets['INTERNAL_TASK_TOKEN'])",
    "S3_ENDPOINT=http://localhost:${MinioPort}",
    'S3_REGION=us-east-1',
    "S3_BUCKET=$MinioBucket",
    "S3_ACCESS_KEY_ID=$MinioUser",
    "S3_SECRET_ACCESS_KEY=$MinioPassword",
    "S3_PUBLIC_BASE_URL=$MinioPublicBaseUrl"
)
foreach ($oauthVar in $OAuthVars) {
    $envLines += "$oauthVar=$($secrets[$oauthVar])"
}
$envLines | Set-Content $EnvPath

# Load it into this session so migrate/build/server all inherit it.
Get-Content $EnvPath | Where-Object { $_ -match '^\s*[^#][^=]+=' } | ForEach-Object {
    $name, $value = $_.Split('=', 2)
    Set-Item -Path "Env:$name" -Value $value
}

$missingOAuth = $OAuthVars | Where-Object { -not $secrets[$_] }
if ($missingOAuth.Count -gt 0) {
    Write-Warn "Missing in ${SecretsPath}: $($missingOAuth -join ', ')"
    Write-Warn 'war-api will refuse to boot until every one of these is set (config.ts, assertProductionConfig).'
}

# --- 6. Migrate ------------------------------------------------------------------
Write-Step 'Running migrations'
Invoke-Native { npm --prefix war-api run migrate }
if ($LASTEXITCODE -ne 0) { throw 'Migrations failed -- see the npm output above.' }

# --- 7. Build + start war-api (internal port, plain HTTP) -------------------------
Write-Step 'Building war-api'
Invoke-Native { npm --prefix war-api run build }
if ($LASTEXITCODE -ne 0) { throw 'war-api build failed -- see the npm output above.' }

Write-Step "Starting war-api on internal port $ApiInternalPort (new window, plain HTTP -- nginx is what's HTTPS)"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$($PWD.Path)\war-api'; node dist/src/server.js"

# --- 8. Start war-ui-default's dev server -----------------------------------------
# No VITE_API_BASE_URL set: its default ('/api/v1', relative) is exactly
# right once everything lives behind nginx at one origin. --host: Vite's
# default bind is 127.0.0.1 only, which nginx (inside Docker, reaching this
# via host.docker.internal) cannot connect to -- a 502 Bad Gateway on any
# non-/api/ path, since that request never actually looks like it came from
# localhost to Vite. war-api needs no equivalent flag; server.ts already
# binds 0.0.0.0.
Write-Step "Starting war-ui-default on port $UiPort (new window)"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$($PWD.Path)\war-ui-default'; npm run dev -- --host 0.0.0.0"

# --- 9. nginx: TLS termination + unify both behind port 3000 ----------------------
Write-Step "Starting nginx ($NginxContainer) on https://localhost:$ExternalPort"
Invoke-Native { docker rm -f $NginxContainer *> $null }
Invoke-Native {
    docker run -d --name $NginxContainer `
        -p "${ExternalPort}:443" `
        -v "${NginxDir}\nginx.conf:/etc/nginx/nginx.conf:ro" `
        -v "${CertsDir}:/etc/nginx/certs:ro" `
        --add-host "host.docker.internal:host-gateway" `
        nginx:alpine *> $null
}
$nginxRunning = ''
Invoke-Native { $script:nginxRunning = docker ps --filter "name=^/$NginxContainer`$" --format '{{.Names}}' }
if ($nginxRunning -ne $NginxContainer) {
    throw "nginx ($NginxContainer) didn't come up -- run ``docker logs $NginxContainer`` to see why (a common cause: port $ExternalPort already in use)."
}

Write-Step 'Waiting for war-api and war-ui-default to come up before opening the browser'
Start-Sleep -Seconds 5
Start-Process $Origin

Write-Host "`nEverything: $Origin" -ForegroundColor Green
Write-Host "  (war-api on :$ApiInternalPort and the Vite dev server on :$UiPort are both proxied behind it, plain HTTP -- nginx is the only thing speaking TLS.)" -ForegroundColor Green
Write-Host "`nBrowser will warn about the self-signed cert -- Advanced > Proceed, once." -ForegroundColor Green
Write-Host "`nOne-time per provider: update its registered redirect URI to:" -ForegroundColor Green
Write-Host "  $Origin/api/v1/auth/<provider>/callback" -ForegroundColor Green
Write-Host "`nContestant image uploads go to MinIO (S3-compatible), not real cloud storage --" -ForegroundColor Green
Write-Host "  console at http://localhost:$MinioConsolePort ($MinioUser / $MinioPassword) if you want to look." -ForegroundColor Green
Write-Host "`nPostgres ($PgContainer), MinIO ($MinioContainer), and nginx ($NginxContainer) keep running after this script exits:" -ForegroundColor Green
Write-Host "  docker stop $PgContainer $MinioContainer $NginxContainer" -ForegroundColor Green
