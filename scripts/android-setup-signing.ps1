# Run locally in PowerShell on a trusted computer. Never commit the key.
$ErrorActionPreference = 'Stop'
$repo = 'Redurbabat/RED-Loop'
foreach ($cmd in @('gh','keytool')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "Missing $cmd. Install GitHub CLI and JDK 17, then reopen PowerShell."
    }
}
function Assert-Native([string]$step) {
    if ($LASTEXITCODE -ne 0) { throw "$step failed (exit $LASTEXITCODE)." }
}
gh auth status
Assert-Native 'GitHub login'
$existing = @(gh secret list --repo $repo --json name --jq '.[].name')
Assert-Native 'Read existing secret names'
$names = @('RED_LOOP_ANDROID_KEYSTORE_B64','RED_LOOP_ANDROID_KEYSTORE_PASSWORD','RED_LOOP_ANDROID_CERT_SHA256')
if (@($existing | Where-Object { $_ -in $names }).Count -gt 0) {
    throw 'Signing secrets already exist. Use the original key; do not overwrite the signing identity. If setup was interrupted, inspect the existing secrets before manual repair.'
}
$folder = Join-Path $HOME '.red-loop-signing'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$key = Join-Path $folder 'red-loop.p12'
$secure = Read-Host 'Permanent Android key password (at least 12 characters)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $env:RED_LOOP_ANDROID_KEYSTORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $secure.Dispose()
}
$cert = Join-Path ([IO.Path]::GetTempPath()) ("red-loop-" + [Guid]::NewGuid().ToString('N') + '.der')
try {
    if ($env:RED_LOOP_ANDROID_KEYSTORE_PASSWORD.Length -lt 12) { throw 'Password too short.' }
    if (-not (Test-Path -LiteralPath $key)) {
        & keytool -genkeypair -keystore $key -storetype PKCS12 -alias red-loop '-storepass:env' RED_LOOP_ANDROID_KEYSTORE_PASSWORD '-keypass:env' RED_LOOP_ANDROID_KEYSTORE_PASSWORD -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=RED Loop Android' -noprompt
        Assert-Native 'Generate private key'
    } else {
        Write-Host 'Reusing the existing local key.'
    }
    & keytool -exportcert -keystore $key -storetype PKCS12 -alias red-loop '-storepass:env' RED_LOOP_ANDROID_KEYSTORE_PASSWORD -file $cert
    Assert-Native 'Export public certificate'
    $fingerprint = (Get-FileHash -LiteralPath $cert -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host "Public certificate SHA-256: $fingerprint"
    if ((Read-Host "Upload signing identity to $repo GitHub Actions secrets? (yes/no)") -ne 'yes') {
        Write-Host 'Cancelled. Key remains local.'
        return
    }
    [Convert]::ToBase64String([IO.File]::ReadAllBytes($key)) | gh secret set RED_LOOP_ANDROID_KEYSTORE_B64 --repo $repo
    Assert-Native 'Upload keystore'
    $env:RED_LOOP_ANDROID_KEYSTORE_PASSWORD | gh secret set RED_LOOP_ANDROID_KEYSTORE_PASSWORD --repo $repo
    Assert-Native 'Upload password'
    $fingerprint | gh secret set RED_LOOP_ANDROID_CERT_SHA256 --repo $repo
    Assert-Native 'Upload certificate pin'
    $confirmed = @(gh secret list --repo $repo --json name --jq '.[].name')
    Assert-Native 'Verify secret names'
    foreach ($name in $names) {
        if ($name -notin $confirmed) { throw "Missing secret after setup: $name" }
    }
    Write-Host 'All three signing secrets are configured. Keep the local key and password backed up privately.'
} finally {
    Remove-Item Env:RED_LOOP_ANDROID_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $cert -Force -ErrorAction SilentlyContinue
}
