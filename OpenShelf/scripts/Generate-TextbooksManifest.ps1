<#
.SYNOPSIS
    Rebuild the manifest from the real files after you rename PDFs on disk.
.DESCRIPTION
    Writes a UTF-8 CSV readable by OpenShelf's importer. Never renames or edits PDFs.
    BookTitle is initially the filename without .pdf; review and correct it in Excel
    if a textbook's displayed name should differ from its filename.
.EXAMPLE
    .\scripts\Generate-TextbooksManifest.ps1 -Root 'D:\Library\Textbooks'
#>
param(
    [string] $Root = 'D:\Library\Textbooks',
    [string] $Output = ''
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
    throw "Textbook folder not found: $Root"
}
$Root = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
if (-not $Output) {
    $Output = Join-Path (Split-Path -Parent $PSScriptRoot) 'data\Textbooks-Manifest.csv'
}

$Files = @(Get-ChildItem -LiteralPath $Root -Filter '*.pdf' -File -Recurse | Sort-Object FullName)
if ($Files.Count -eq 0) { throw "No PDFs found below $Root" }
$Rows = foreach ($File in $Files) {
    $Relative = $File.FullName.Substring($Root.Length).TrimStart('\')
    $Parts = @($Relative -split '\\')
    if ($Parts.Count -ne 3) {
        throw "Expected exactly Level\\Subject\\Book.pdf. Unexpected path: $Relative"
    }
    if ($Parts[0] -notin @('Class 8', 'Class 9', 'Class 10', '1st Puc', '2nd Puc')) {
        throw "Unknown study-level folder: $($Parts[0])"
    }
    [PSCustomObject]@{
        Level        = $Parts[0]
        Subject      = $Parts[1]
        FileName     = $File.Name
        RelativePath = $Relative
        FullPath     = $File.FullName
        SizeMB       = [math]::Round($File.Length / 1MB, 2)
        BookTitle    = $File.BaseName
    }
}
$Rows | Export-Csv -LiteralPath $Output -Encoding UTF8 -NoTypeInformation
Write-Host "Created $Output with $($Rows.Count) actual PDF rows (no files renamed)."
Write-Host 'Review BookTitle values; then run npm run pdf:check and npm run pdf:import from the OpenShelf root.'
