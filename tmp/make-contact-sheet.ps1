Add-Type -AssemblyName System.Drawing
$source = 'C:\Users\admin\.codex\generated_images\01a19781-1b66-73a2-a552-6b5633d9f225'
$files = Get-ChildItem -LiteralPath $source -Filter '*.png' | Sort-Object LastWriteTime -Descending | Select-Object -First 20
$cellW = 240; $cellH = 190; $labelH = 28; $cols = 5; $rows = 4
$sheet = New-Object System.Drawing.Bitmap ($cellW * $cols), (($cellH + $labelH) * $rows)
$graphics = [System.Drawing.Graphics]::FromImage($sheet)
$graphics.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Arial', 9)
for ($i = 0; $i -lt $files.Count; $i++) {
  $image = [System.Drawing.Image]::FromFile($files[$i].FullName)
  $x = ($i % $cols) * $cellW; $y = [math]::Floor($i / $cols) * ($cellH + $labelH)
  $graphics.DrawImage($image, $x, $y, $cellW, $cellH)
  $graphics.DrawString("$i  $($files[$i].BaseName.Substring(5,8))", $font, [System.Drawing.Brushes]::Black, $x + 4, $y + $cellH + 4)
  $image.Dispose()
}
$out = 'C:\Users\admin\Documents\node.js\techwiz\backup\tmp\men-shirts-contact-sheet.png'
$sheet.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $sheet.Dispose(); Write-Output $out
