param(
    [string]$SdkRoot = 'D:\Android\Sdk',
    [string]$SigningFile = (Join-Path $env:USERPROFILE '.chai-signing\credentials.json'),
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$NinjaPath = 'D:\Android\ninja-win\ninja.exe',
    [string]$HttpProxy = '',
    [string]$ApiBaseUrl = '',
    [ValidateSet('arm64-v8a', 'armeabi-v7a', 'x86_64')]
    [string]$Architecture = 'arm64-v8a',
    [switch]$PrepareOnly,
    [switch]$SkipPrebuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$expectedPackage = 'me.sikehuhu.chai'
$expectedCertificate = '6fd991968a6ff5be8e370201e27a032dfa495ee08e62465ccbb54c6aecafc6b4'
$environmentNames = @('ANDROID_HOME', 'ANDROID_SDK_ROOT', 'JAVA_HOME', 'CI', 'EXPO_NO_TELEMETRY', 'NODE_ENV', 'GRADLE_OPTS', 'CHAI_NINJA_PATH', 'JAVA_TOOL_OPTIONS', 'EXPO_PUBLIC_API_BASE_URL',
    'CHAI_SIGN_STORE_FILE', 'CHAI_SIGN_STORE_PASS', 'CHAI_SIGN_KEY_ALIAS', 'CHAI_SIGN_KEY_PASS')
$savedEnvironment = @{}
foreach ($name in $environmentNames) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

function Assert-File([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required file is missing: $Path"
    }
}

Push-Location $projectRoot
try {
    if (-not $PrepareOnly) {
        $ApiBaseUrl = $ApiBaseUrl.Trim().TrimEnd('/')
        $apiUri = $null
        if (-not [uri]::TryCreate($ApiBaseUrl, [UriKind]::Absolute, [ref]$apiUri) -or
            $apiUri.Scheme -ne 'https' -or -not $apiUri.Host -or $apiUri.UserInfo -or
            $apiUri.Query -or $apiUri.Fragment -or $ApiBaseUrl -match '\s|\\') {
            throw 'Specify -ApiBaseUrl with an HTTPS API root, without credentials, query or fragment.'
        }
        $env:EXPO_PUBLIC_API_BASE_URL = $ApiBaseUrl
    }
    $SdkRoot = (Resolve-Path -LiteralPath $SdkRoot).Path
    $env:ANDROID_HOME = $SdkRoot
    $env:ANDROID_SDK_ROOT = $SdkRoot
    $env:CI = '1'
    $env:EXPO_NO_TELEMETRY = '1'
    foreach ($name in $environmentNames | Where-Object { $_ -like 'CHAI_SIGN_*' }) {
        [Environment]::SetEnvironmentVariable($name, [NullString]::Value, 'Process')
    }
    Assert-File (Join-Path $SdkRoot 'platforms\android-36\android.jar')
    Assert-File (Join-Path $SdkRoot 'build-tools\36.0.0\apksigner.bat')
    Assert-File (Join-Path $SdkRoot 'build-tools\35.0.0\aapt2.exe')
    Assert-File (Join-Path $SdkRoot 'ndk\27.1.12297006\source.properties')
    if (-not $JavaHome) { throw 'Specify an installed JDK with -JavaHome (use the Android Studio jbr on this machine).' }
    $env:JAVA_HOME = (Resolve-Path -LiteralPath $JavaHome).Path
    Assert-File (Join-Path $env:JAVA_HOME 'bin\java.exe')
    if ($HttpProxy) {
        $proxy = [uri]$HttpProxy
        if (-not $proxy.IsAbsoluteUri -or $proxy.Scheme -ne 'http' -or $proxy.UserInfo -or
            $proxy.Host -notmatch '^[a-zA-Z0-9.-]+$' -or $proxy.AbsolutePath -ne '/' -or $proxy.Query -or $proxy.Fragment) {
            throw 'HttpProxy must be an HTTP proxy URL without credentials, path or query.'
        }
        $env:GRADLE_OPTS = "$($env:GRADLE_OPTS) -Dhttp.proxyHost=$($proxy.Host) -Dhttp.proxyPort=$($proxy.Port) -Dhttps.proxyHost=$($proxy.Host) -Dhttps.proxyPort=$($proxy.Port)"
    }
    $pnpm = (Get-Command pnpm -ErrorAction Stop).Source

    # --no-clean is required: never delete an existing native project.
    $manifestHash = (Get-FileHash -LiteralPath 'package.json' -Algorithm SHA256).Hash
    $lockHash = (Get-FileHash -LiteralPath 'pnpm-lock.yaml' -Algorithm SHA256).Hash
    if ($SkipPrebuild) {
        Assert-File 'android\app\build.gradle'
        Assert-File 'android\app\src\main\AndroidManifest.xml'
        Write-Output 'Using the existing Android project; prebuild skipped.'
    }
    else {
        & $pnpm exec expo prebuild --platform android --no-install --no-clean --skip-dependency-update expo,react-native
        if ($LASTEXITCODE -ne 0) { throw 'Expo prebuild failed.' }
    }
    if ((Get-FileHash -LiteralPath 'package.json' -Algorithm SHA256).Hash -ne $manifestHash -or
        (Get-FileHash -LiteralPath 'pnpm-lock.yaml' -Algorithm SHA256).Hash -ne $lockHash) {
        throw 'Prebuild changed dependency metadata. Inspect it before continuing; nothing was reverted.'
    }

    $nativeBuild = Get-Content -LiteralPath 'android\app\build.gradle' -Raw
    $applicationIdPattern = 'applicationId\s+[''"]' + [regex]::Escape($expectedPackage) + '[''"]'
    if ($nativeBuild -notmatch 'signingConfig signingConfigs.chaiRelease' -or
        $nativeBuild -notmatch $applicationIdPattern) {
        throw 'Generated package or release signing configuration is incorrect.'
    }
    $cmake = Join-Path $SdkRoot 'cmake\3.30.5\bin\cmake.exe'
    if ($PrepareOnly) {
        Write-Output 'Android project configuration checked. No APK has been built.'
        if (-not (Test-Path -LiteralPath $cmake)) {
            Write-Warning 'Install CMake 3.30.5 through Android Studio > SDK Manager > SDK Tools.'
        }
        return
    }
    Assert-File $cmake
    Assert-File $NinjaPath
    $NinjaPath = (Resolve-Path -LiteralPath $NinjaPath).Path
    $ninjaVersion = & $NinjaPath --version
    if ($LASTEXITCODE -ne 0 -or "$ninjaVersion" -notmatch '^\d+\.\d+\.\d+$' -or [version]$ninjaVersion -lt [version]'1.12.0') {
        throw 'Ninja 1.12.0 or newer is required. Specify its executable with -NinjaPath.'
    }
    $longPaths = Get-ItemPropertyValue -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled
    if ($longPaths -ne 1) { throw 'Enable Windows LongPathsEnabled before building. This script does not change the registry.' }
    $env:CHAI_NINJA_PATH = $NinjaPath.Replace('\', '/')
    Assert-File $SigningFile
    $credentials = Get-Content -LiteralPath $SigningFile -Raw | ConvertFrom-Json
    if ($credentials.applicationId -ne $expectedPackage) { throw 'Signing configuration has a different applicationId.' }
    $key = $credentials.android.keystore
    Assert-File $key.keystorePath
    $keystorePath = (Resolve-Path -LiteralPath $key.keystorePath).Path
    $credentialPath = (Resolve-Path -LiteralPath $SigningFile).Path
    $projectPrefix = $projectRoot.TrimEnd('\') + '\'
    if ($keystorePath.StartsWith($projectPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        $credentialPath.StartsWith($projectPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Signing credentials and keystore must stay outside the project.'
    }
    if (-not $key.keystorePassword -or -not $key.keyAlias -or -not $key.keyPassword) {
        throw 'Signing credentials are incomplete.'
    }
    $env:CHAI_SIGN_STORE_FILE = $keystorePath
    $env:CHAI_SIGN_STORE_PASS = $key.keystorePassword
    $env:CHAI_SIGN_KEY_ALIAS = $key.keyAlias
    $env:CHAI_SIGN_KEY_PASS = $key.keyPassword
    $env:NODE_ENV = 'production'
    # Prefab loads JNI in a child JVM; Java 25 requires explicit native access.
    $env:JAVA_TOOL_OPTIONS = "$($env:JAVA_TOOL_OPTIONS) --enable-native-access=ALL-UNNAMED".Trim()
    $buildStarted = [DateTime]::UtcNow
    Push-Location 'android'
    try {
        & .\gradlew.bat :app:assembleRelease --no-daemon --no-configuration-cache --max-workers=2 "-PreactNativeArchitectures=$Architecture" '-Pandroid.builder.sdkDownload=false'
        if ($LASTEXITCODE -ne 0) { throw 'Gradle APK build failed.' }
    }
    finally { Pop-Location }

    foreach ($name in $environmentNames | Where-Object { $_ -like 'CHAI_SIGN_*' }) {
        [Environment]::SetEnvironmentVariable($name, [NullString]::Value, 'Process')
    }
    $key = $null
    $credentials = $null
    $apk = Join-Path $projectRoot 'android\app\build\outputs\apk\release\app-release.apk'
    Assert-File $apk
    $signature = & (Join-Path $SdkRoot 'build-tools\36.0.0\apksigner.bat') verify --verbose --print-certs $apk
    if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
    $signerPattern = 'Signer #1 certificate SHA-256 digest: ' + $expectedCertificate
    if (($signature -join "`n") -notmatch $signerPattern) { throw 'APK was signed with an unexpected certificate.' }
    $badging = & (Join-Path $SdkRoot 'build-tools\36.0.0\aapt.exe') dump badging $apk
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect APK metadata.' }
    $packagePattern = "^package: name='" + [regex]::Escape($expectedPackage) + "'"
    if (-not ($badging | Where-Object { $_ -match $packagePattern })) { throw 'APK package name is incorrect.' }
    if ($badging -match 'application-debuggable') { throw 'APK must not be debuggable.' }
    if ($badging -match 'android\.permission\.(RECORD_AUDIO|READ_CONTACTS|CAMERA)') { throw 'APK includes a blocked permission.' }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($apk)
    try {
        $bundle = $zip.GetEntry('assets/index.android.bundle')
        if (-not $bundle -or $bundle.Length -eq 0) { throw 'APK has no embedded JavaScript bundle.' }
        $bundleStream = $bundle.Open()
        $bundleBytes = New-Object IO.MemoryStream
        try {
            $bundleStream.CopyTo($bundleBytes)
            if (-not [Text.Encoding]::UTF8.GetString($bundleBytes.ToArray()).Contains($ApiBaseUrl)) {
                throw 'APK bundle does not contain the configured API root.'
            }
        }
        finally { $bundleStream.Dispose(); $bundleBytes.Dispose() }
        if (-not ($zip.Entries | Where-Object { $_.FullName -like "lib/$Architecture/*.so" })) {
            throw 'APK has no native libraries for the selected architecture.'
        }
    }
    finally { $zip.Dispose() }

    $outputDir = Join-Path $projectRoot '.verify\apk'
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    $buildId = $buildStarted.ToString('yyyyMMddTHHmmssZ')
    $output = Join-Path $outputDir "chai-$Architecture-$buildId.apk"
    if (Test-Path -LiteralPath $output) { throw 'Output APK already exists; refusing to overwrite it.' }
    Copy-Item -LiteralPath $apk -Destination $output
    $report = [ordered]@{
        applicationId = $expectedPackage
        certificateSha256 = $expectedCertificate
        architecture = $Architecture
        apiBaseUrl = $ApiBaseUrl
        apk = $output
        apkSha256 = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
        bytes = (Get-Item -LiteralPath $output).Length
        verifiedAt = [DateTime]::UtcNow.ToString('o')
        metadata = @($badging | Where-Object { $_ -match '^(package:|sdkVersion:|targetSdkVersion:|native-code:|uses-permission:)' })
        deviceTested = $false
    }
    $report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$output.json" -Encoding UTF8
    Write-Output "Verified APK: $output"
    Write-Output "SHA-256: $($report.apkSha256)"
    Write-Output 'Device testing and live password-login/API verification are still required. No backend deployment was performed.'
}
finally {
    $key = $null
    $credentials = $null
    foreach ($name in $environmentNames) {
        if ($null -eq $savedEnvironment[$name]) {
            [Environment]::SetEnvironmentVariable($name, [NullString]::Value, 'Process')
        }
        else {
            [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
        }
    }
    Pop-Location
}
