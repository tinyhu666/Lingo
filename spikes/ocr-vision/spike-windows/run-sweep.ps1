# Spike B sweep: 10 samples x 3 engine configs.
# Crops calibrated by visual inspection of preview-*.png.
# Output: results.tsv (one row per (file, config)).

$ErrorActionPreference = 'Stop'
$root = 'G:\workspace\lingo\spikes\ocr-vision'
$exe = "$root\spike-windows\target\release\spike-windows-ocr.exe"
$samplesDir = "$root\samples\dota2"
$out = "$root\spike-windows\results.tsv"

# file, crop x,y,w,h (calibrated against the chat row in each shot)
$specs = @(
    @{ file = '纯中文短句-推中路.png';  crop = '200,1280,1700,120' },
    @{ file = '纯中文长句.png';         crop = '200,1280,2000,120' },
    @{ file = '纯英文短句.png';         crop = '200,1280,1700,120' },
    @{ file = '纯英文长句.png';         crop = '200,1300,2000,120' },
    @{ file = '纯俄文任意长度.png';     crop = '200,1280,1700,120' },
    @{ file = '中英文混排.png';         crop = '200,1300,1700,120' },
    @{ file = '全局黄色 ID.png';        crop = '200,1200,1500,400' },
    @{ file = '复杂 ID.png';            crop = '80,1340,1850,90'   },
    @{ file = '团战画面.png';           crop = '200,1300,1500,200' },
    @{ file = '空旷画面.png';           crop = '200,1300,1500,200' }
)
$engines = @('auto', 'en-US', 'zh-Hans-CN')
$preprocess = 'threshold:180'

"file`tengine`tpreprocess`tlatency_ms`ttext" | Out-File -FilePath $out -Encoding utf8

foreach ($spec in $specs) {
    $src = "$samplesDir\$($spec.file)"
    foreach ($eng in $engines) {
        $a = @($src, '--crop', $spec.crop, '--preprocess', $preprocess, '--json')
        if ($eng -ne 'auto') { $a += @('--lang', $eng) }
        $json = & $exe @a
        # Use System.Web.Script.Serialization (works on PS 5.1) for parsing.
        Add-Type -AssemblyName System.Web.Extensions
        $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
        try { $parsed = $ser.DeserializeObject($json) } catch { $parsed = @{} }
        $lat = if ($parsed.latencies_ms) { [double]$parsed.latencies_ms[0] } else { -1 }
        $txt = if ($parsed.text) { $parsed.text -replace "`r?`n", ' \\ ' } else { '' }
        $row = "$($spec.file)`t$eng`t$preprocess`t$([Math]::Round($lat,1))`t$txt"
        Add-Content -Path $out -Value $row -Encoding utf8
        Write-Host "$($spec.file) [$eng] ${lat}ms" -ForegroundColor Cyan
        Write-Host "  -> $txt"
    }
}

Write-Host "`nWrote $out"
