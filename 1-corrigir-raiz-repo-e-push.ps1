# ============================================================
#  CORRECAO: Repositorio foi criado numa SUBPASTA, arquivos do site FORA.
#  Objetivo: Juntar tudo na mesma raiz e dar push real.
#
#  COMPATIBILIDADE: PowerShell 5 (Windows 10/11 padrão)
#    - NÃO usamos "1>nul" / "2>&1" (sintaxe CMD causa
#      NotSupportedException "FileStream foi solicitado...")
#    - Usamos $null = ... / 2>$null / -ErrorAction SilentlyContinue
# ============================================================
$ErrorActionPreference = 'Continue'
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ROOT
Write-Host ""
Write-Host "==> (0) Pasta atual do projeto: $ROOT" -ForegroundColor Cyan
Write-Host ""

# --- (1) Achar onde esta o .git que o usuario criou ---
$possiveis = @(
  (Join-Path $ROOT ".git"),
  (Join-Path $ROOT "krav-maga-bukan-santos\.git")
)
$gitDir = $null
foreach ($p in $possiveis) { if (Test-Path -LiteralPath $p) { $gitDir = $p; break } }

if (-not $gitDir) {
  Write-Host "[ERRO] Nenhum .git encontrado em:" -ForegroundColor Red
  foreach ($p in $possiveis) { Write-Host "  - $p" }
  Write-Host "Solucao: Rode o '0-push-para-github.bat' primeiro (duplo clique)." -ForegroundColor Yellow
  Write-Host ""
  pause
  exit 1
}
$repoRaiz = Split-Path -Parent $gitDir
Write-Host "(1) .git encontrado em: $repoRaiz" -ForegroundColor Green

# --- (2) Se o repo estiver na subpasta, COPIAR TODOS OS ARQUIVOS DO SITE PARA LA ---
if ($repoRaiz -ne $ROOT) {
  Write-Host ""
  Write-Host "(2) Repositorio esta em SUBPASTA. Copiando TODOS arquivos para '$repoRaiz'..." -ForegroundColor Yellow
  $itens = Get-ChildItem -LiteralPath $ROOT -Force | Where-Object {
    $_.Name -ne ".trae" -and
    $_.Name -ne "krav-maga-bukan-santos" -and
    $_.Name -ne ".git"
  }
  foreach ($item in $itens) {
    $dest = Join-Path $repoRaiz $item.Name
    if (Test-Path -LiteralPath $dest) {
      Write-Host "    skip (ja existe): $($item.Name)" -ForegroundColor DarkGray
    } elseif ($item.PSIsContainer) {
      Copy-Item -LiteralPath $item.FullName -Destination $dest -Recurse -Force
      Write-Host "    copy dir: $($item.Name)" -ForegroundColor Gray
    } else {
      Copy-Item -LiteralPath $item.FullName -Destination $dest -Force
      Write-Host "    copy file: $($item.Name)" -ForegroundColor Gray
    }
  }
  Write-Host "    OK. Tudo copiado para dentro do repo." -ForegroundColor Green
  Set-Location -LiteralPath $repoRaiz
} else {
  Write-Host "(2) Repositorio ja ESTA na raiz. OK." -ForegroundColor Green
  Set-Location -LiteralPath $repoRaiz
}

Write-Host ""
Write-Host "(3) Pasta agora usada como repo: $(Get-Location)"
Write-Host ""

# --- (3) Garante user.name/email (PowerShell 5 safe: capturamos $LASTEXITCODE via cmd intern) ---
$cfgName  = git config --get user.name  2>$null
$cfgEmail = git config --get user.email 2>$null
if ([string]::IsNullOrWhiteSpace($cfgName) -or [string]::IsNullOrWhiteSpace($cfgEmail)) {
  Write-Host "(4) Configurando user LOCAL (padrão) ..." -ForegroundColor Yellow
  git config user.name  "Bukan Santos - Landing Page"
  git config user.email "contato@kravmagabukansantos.com.br"
} else {
  Write-Host "(4) user.name/email ja configurados ($cfgName <$cfgEmail>). OK." -ForegroundColor Green
}

# --- (4) Add + commit ---
Write-Host ""
Write-Host "(5) git add . + commit ..." -ForegroundColor Yellow
git add .
$dirty = git status --porcelain
if ($dirty) {
  git commit -m "feat: landing page Bukan Santos v1 - modularizado JSON/TXT + As 15 Regras + redes oficiais"
  if ($LASTEXITCODE -eq 0) {
    Write-Host "    Commit realizado OK." -ForegroundColor Green
  } else {
    Write-Host "    Commit falhou (exit=$LASTEXITCODE). Continua para tentar push do que ja tem." -ForegroundColor Yellow
  }
} else {
  Write-Host "    Working tree limpo (sem mudancas novas)." -ForegroundColor Yellow
}

# --- (5) Remote origin ---
$orig = git remote get-url origin 2>$null
if (-not $orig) {
  Write-Host ""
  Write-Host "(6) Sem remote. Adicionando origin = https://github.com/rvivac/krav-maga-bukan-santos.git" -ForegroundColor Yellow
  git remote add origin https://github.com/rvivac/krav-maga-bukan-santos.git
  $orig = git remote get-url origin 2>$null
  Write-Host "    Remote configurado = $orig"
} else {
  Write-Host "(6) Remote origin OK = $orig" -ForegroundColor Green
}

# --- (6) Push ---
Write-Host ""
Write-Host "(7) ====== git push -u origin main ======" -ForegroundColor Cyan
git branch -M main
git push -u origin main
$pushExit = $LASTEXITCODE

if ($pushExit -eq 0) {
  Write-Host ""
  Write-Host "=================================================================" -ForegroundColor Green
  Write-Host "   PUSH FINALIZADO COM SUCESSO!"                                      -ForegroundColor Green
  $url = git remote get-url origin 2>$null
  if (-not $url) { $url = 'https://github.com/rvivac/krav-maga-bukan-santos' }
  Write-Host "   Repositorio: $url"
  Write-Host "   Abra no navegador para confirmar os arquivos :)"
  Write-Host "=================================================================" -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "[!] PUSH FALHOU (exit=$pushExit). Causa quase sempre: AUTENTICACAO." -ForegroundColor Red
  Write-Host "   === RESOLUCAO RAPIDA (3 minutos) ===" -ForegroundColor Yellow
  Write-Host "   1) Feche esta janela. Instale/abra o GITHUB DESKTOP (https://desktop.github.com)"
  Write-Host "   2) File -> Add Local Repository -> selecione a pasta:"
  Write-Host "        $(Get-Location)"
  Write-Host "   3) Botao [Publish repository] no painel esquerdo."
  Write-Host "   4) Desmarque 'Keep private', coloque nome 'krav-maga-bukan-santos' -> Publish Repository."
}
Write-Host ""
pause
