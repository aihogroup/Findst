# Menghasilkan ikon PNG PWA + gambar Open Graph dari desain logo (tanpa dependensi).
# Jalankan: npm run icons   (Windows PowerShell 5.1+, memakai System.Drawing)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot "..\src\public\icons"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$maroon = [System.Drawing.ColorTranslator]::FromHtml("#7f1f31")
$cream  = [System.Drawing.ColorTranslator]::FromHtml("#fffdf8")
$sand   = [System.Drawing.ColorTranslator]::FromHtml("#dcc2a2")
$bg     = [System.Drawing.ColorTranslator]::FromHtml("#f5eddc")
$ink    = [System.Drawing.ColorTranslator]::FromHtml("#15110e")
$muted  = [System.Drawing.ColorTranslator]::FromHtml("#5a4e45")

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  if ($r -le 0) { $p.AddRectangle((New-Object System.Drawing.RectangleF($x, $y, $w, $h))); return $p }
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-Pen($color, [float]$width) {
  $pen = New-Object System.Drawing.Pen($color, $width)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  return $pen
}

# Menggambar logo dalam kotak (ox, oy, size); $inner = skala isi (maskable = 0.7)
function Draw-Logo($g, [float]$ox, [float]$oy, [float]$size, [float]$radiusRatio, [float]$inner) {
  $s = $size / 512.0
  $path = New-RoundedPath $ox $oy $size $size ($size * $radiusRatio)
  $g.FillPath((New-Object System.Drawing.SolidBrush($maroon)), $path)

  $off = (1 - $inner) * 256
  function P([float]$x, [float]$y) { New-Object System.Drawing.PointF(($ox + ($off + $x * $inner) * $s), ($oy + ($off + $y * $inner) * $s)) }

  $penF = New-Pen $cream (44 * $s * $inner)
  $g.DrawLines($penF, [System.Drawing.PointF[]]@((P 176 384), (P 176 128), (P 352 128)))
  $g.DrawLine($penF, (P 176 248), (P 288 248))
  $penA = New-Pen $sand (30 * $s * $inner)
  $g.DrawLines($penA, [System.Drawing.PointF[]]@((P 264 376), (P 312 328), (P 352 360), (P 416 280)))
}

function Save-Icon([string]$name, [int]$size, [float]$radiusRatio, [float]$inner) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  Draw-Logo $g 0 0 $size $radiusRatio $inner
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "  [ok] $name"
}

Save-Icon "icon-192.png" 192 0.25 1.0
Save-Icon "icon-512.png" 512 0.25 1.0
Save-Icon "icon-maskable-512.png" 512 0 0.7
Save-Icon "apple-touch-icon.png" 180 0 0.8
Save-Icon "favicon-32.png" 32 0.25 1.0

# ---- Open Graph 1200x630 ----
$og = New-Object System.Drawing.Bitmap(1200, 630)
$g = [System.Drawing.Graphics]::FromImage($og)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear($bg)
$glow = New-Object System.Drawing.Drawing2D.GraphicsPath
$glow.AddEllipse(760, -220, 700, 700)
$gb = New-Object System.Drawing.Drawing2D.PathGradientBrush($glow)
$gb.CenterColor = [System.Drawing.Color]::FromArgb(70, $maroon)
$gb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $maroon))
$g.FillPath($gb, $glow)
Draw-Logo $g 96 96 128 0.25 1.0
$title = New-Object System.Drawing.Font("Georgia", 72, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$sub = New-Object System.Drawing.Font("Georgia", 34, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$small = New-Object System.Drawing.Font("Georgia", 24, [System.Drawing.FontStyle]::Italic, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString("Findst.id", $title, (New-Object System.Drawing.SolidBrush($ink)), 96, 270)
$g.DrawString("Manajemen investasi saham Indonesia dengan`nmachine learning & dynamic threshold.", $sub, (New-Object System.Drawing.SolidBrush($muted)), 98, 370)
$g.DrawString("Alat bantu analisis - bukan rekomendasi investasi", $small, (New-Object System.Drawing.SolidBrush($maroon)), 98, 520)
$og.Save((Join-Path $out "og-image.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $og.Dispose()
Write-Host "  [ok] og-image.png"
