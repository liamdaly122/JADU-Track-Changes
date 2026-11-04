# Leeds prototyping CMS - tiny local web server (no Node or Python needed)
# Double-click this file, or run:  powershell -ExecutionPolicy Bypass -File serve.ps1
# Serves the CMS at http://localhost:8765 and provides /__proxy?url=... so the importer can fetch leeds.ac.uk pages.
param([int]$Port = 8765, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
try { $listener.Start() } catch { Write-Host "Could not start on port $Port ($_). Try: powershell -File serve.ps1 -Port 8766"; exit 1 }
Write-Host "Leeds prototyping CMS running at $prefix  (Ctrl+C to stop)"
if (-not $NoBrowser) { Start-Process $prefix | Out-Null }

$mime = @{ '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.gif'='image/gif'; '.svg'='image/svg+xml'; '.webp'='image/webp'; '.woff'='font/woff'; '.woff2'='font/woff2'; '.ttf'='font/ttf'; '.ico'='image/x-icon'; '.txt'='text/plain; charset=utf-8'; '.md'='text/markdown; charset=utf-8' }
$client = New-Object System.Net.WebClient
$client.Headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LeedsPrototypingCMS/1.0'

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request; $res = $ctx.Response
    $path = [uri]::UnescapeDataString($req.Url.AbsolutePath)
    try {
      if ($path -eq '/__proxy') {
        $url = $req.QueryString['url']
        if (-not $url -or $url -notmatch '^https?://') { $res.StatusCode = 400; $bytes = [Text.Encoding]::UTF8.GetBytes('Missing or invalid url parameter') }
        else {
          $client.Headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LeedsPrototypingCMS/1.0'
          $bytes = $client.DownloadData($url)
          $ct = $client.ResponseHeaders['Content-Type']; if (-not $ct) { $ct = 'text/html; charset=utf-8' }
          $res.ContentType = $ct
          $res.AddHeader('Access-Control-Allow-Origin', '*')
          Write-Host "proxy  $url ($($bytes.Length) bytes)"
        }
      } else {
        if ($path -eq '/') { $path = '/index.html' }
        $file = Join-Path $root ($path.TrimStart('/') -replace '/', '\')
        if ((Test-Path $file -PathType Leaf) -and ([IO.Path]::GetFullPath($file)).StartsWith([IO.Path]::GetFullPath($root))) {
          $ext = [IO.Path]::GetExtension($file).ToLower()
          $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
          $res.AddHeader('Cache-Control', 'no-cache')
          $bytes = [IO.File]::ReadAllBytes($file)
        } else { $res.StatusCode = 404; $res.ContentType = 'text/plain'; $bytes = [Text.Encoding]::UTF8.GetBytes("Not found: $path") }
      }
    } catch { $res.StatusCode = 502; $res.ContentType = 'text/plain'; $bytes = [Text.Encoding]::UTF8.GetBytes("Error: $($_.Exception.Message)") }
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.OutputStream.Close()
  } catch { if ($listener.IsListening) { Write-Host "Request error: $($_.Exception.Message)" } }
}
