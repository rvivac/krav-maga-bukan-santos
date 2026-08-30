Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$outDir = Join-Path (Get-Location) "assets\icons"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$sizes = @(16, 32, 64, 128, 512)

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver

        $strokeColor = [System.Drawing.Color]::FromArgb(255, 243, 204, 31)
        $fillColor = $strokeColor

        $cx = $size / 2.0
        $cy = $size / 2.0
        $outerR = ($size * 228.0) / 512.0
        $centerDotR = [Math]::Max(1.0, ($size * 6.0) / 512.0)

        $circlePenW = [Math]::Max(1.0, ($size * 16.0) / 512.0)
        $tickPenW   = [Math]::Max(1.0, ($size * 20.0) / 512.0)
        $hourPenW   = [Math]::Max(1.0, ($size * 22.0) / 512.0)
        $minPenW    = [Math]::Max(1.0, ($size * 18.0) / 512.0)

        $circlePen = New-Object System.Drawing.Pen($strokeColor, $circlePenW)
        $circlePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $circlePen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
        $tickPen = New-Object System.Drawing.Pen($strokeColor, $tickPenW)
        $tickPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $tickPen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
        $hourPen = New-Object System.Drawing.Pen($strokeColor, $hourPenW)
        $hourPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $hourPen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
        $minPen  = New-Object System.Drawing.Pen($strokeColor, $minPenW)
        $minPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $minPen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
        $brush = New-Object System.Drawing.SolidBrush($fillColor)

        try {
            $g.DrawEllipse($circlePen, ($cx - $outerR), ($cy - $outerR), ($outerR * 2), ($outerR * 2))

            $tickInner = $outerR - ($size * 32.0 / 512.0)
            $tickOuter = $outerR - ($size * 4.0 / 512.0)

            $g.DrawLine($tickPen, $cx, ($cy - $outerR + ($size * 4.0 / 512.0) + 0), $cx, ($cy - $tickInner))
            $g.DrawLine($tickPen, ($cx + $outerR - ($size * 4.0 / 512.0)), $cy, ($cx + $tickInner), $cy)
            $g.DrawLine($tickPen, $cx, ($cy + $outerR - ($size * 4.0 / 512.0)), $cx, ($cy + $tickInner))
            $g.DrawLine($tickPen, ($cx - $outerR + ($size * 4.0 / 512.0)), $cy, ($cx - $tickInner), $cy)

            $hourLen = ($size * 112.0) / 512.0
            $minLen  = ($size * 104.0) / 512.0
            $angleHour = -90.0
            $angleMin  = 0.0
            $hr = [Math]::PI * $angleHour / 180.0
            $mr = [Math]::PI * $angleMin  / 180.0

            $g.DrawLine($hourPen, $cx, $cy, ($cx + [Math]::Cos($hr) * $hourLen), ($cy + [Math]::Sin($hr) * $hourLen))
            $g.DrawLine($minPen,  $cx, $cy, ($cx + [Math]::Cos($mr) * $minLen),  ($cy + [Math]::Sin($mr) * $minLen))

            $centerRect = New-Object System.Drawing.RectangleF(($cx - $centerDotR), ($cy - $centerDotR), ($centerDotR * 2), ($centerDotR * 2))
            $g.FillEllipse($brush, $centerRect)
        }
        finally {
            $circlePen.Dispose()
            $tickPen.Dispose()
            $hourPen.Dispose()
            $minPen.Dispose()
            $brush.Dispose()
        }

        $outPath = Join-Path $outDir ("clock-analogico-{0}x{0}.png" -f $size)
        $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $f = Get-Item $outPath
        Write-Host ("OK {0}x{0}  -> {1}  ({2} bytes)" -f $size, $f.Name, $f.Length)
    }
    finally {
        $g.Dispose()
        $bmp.Dispose()
    }
}

Write-Host ""
Write-Host "PNGs gerados em: $outDir"
Get-ChildItem $outDir -Filter "clock-*.png" | Sort-Object Name | ForEach-Object { Write-Host ("  - {0}  ({1} bytes)" -f $_.Name, $_.Length) }
