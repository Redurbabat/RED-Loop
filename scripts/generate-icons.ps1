Add-Type -AssemblyName System.Drawing
$projectPath = Split-Path -Parent $PSScriptRoot
function Write-RedIcon([int]$size, [string]$targetPath) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#A9233B'))
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $font = [System.Drawing.Font]::new('Segoe UI', [single]($size * 0.62), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString('R', $font, [System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new(0, -0.02 * $size, $size, $size), $format)
    $bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $format.Dispose(); $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
$iconFolder = Join-Path $projectPath 'ios/REDLoop/Assets.xcassets/AppIcon.appiconset'
New-Item -ItemType Directory -Path $iconFolder -Force | Out-Null
Write-RedIcon 1024 (Join-Path $iconFolder 'AppIcon.png')
Write-RedIcon 128 (Join-Path $projectPath 'ios/REDLoopExtension/Resources/icon.png')
