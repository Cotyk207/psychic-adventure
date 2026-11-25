$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '../..')
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$out = Join-Path $root 'release-web-apps-windows'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$csc = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path $csc)) { throw '.NET Framework C# compiler not found' }
$services = @(
    @{ Id = 'chatgpt'; Name = 'ChatGPT'; Define = 'CHATGPT' },
    @{ Id = 'claude'; Name = 'Claude'; Define = 'CLAUDE' },
    @{ Id = 'gemini'; Name = 'Gemini'; Define = 'GEMINI' },
    @{ Id = 'perplexity'; Name = 'Perplexity'; Define = 'PERPLEXITY' },
    @{ Id = 'copilot'; Name = 'Copilot'; Define = 'COPILOT' },
    @{ Id = 'arena'; Name = 'Arena'; Define = 'ARENA' }
)
foreach ($service in $services) {
    $target = Join-Path $out "PSYCHIC-$($service.Name)-Windows-$version.exe"
    $icon = Join-Path $root "subscription-apps/icons/$($service.Id).ico"
    & $csc /nologo /target:winexe /optimize+ /codepage:65001 "/define:$($service.Define)" "/out:$target" "/win32icon:$icon" /reference:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'Launcher.cs')
    if ($LASTEXITCODE -ne 0) { throw "Failed to build $($service.Name) launcher" }
}
Get-ChildItem $out
