# ============================================================
#  Krav-Maga Bukan Santos — Setup Repositório GitHub (Local + Remoto)
#  Powershell 5 · Execute dentro da pasta: Bukan_Santos11
# ============================================================
#  O que este script FAZ:
#   1. Cria .gitignore (se não existir)
#   2. git init com branch "main"
#   3. Se user.name / user.email NÃO estiverem configurados GLOBALMENTE,
#      configura LOCALMENTE com valores padrão (você pode editar abaixo)
#   4. git add .  (todos arquivos exceto os do .gitignore)
#   5. Commit inicial: "feat: landing page Bukan Santos v1 · modularizado em JSON/TXT"
#   6. Tenta criar o repositório REMOTO no GitHub via `gh repo create` (CLI):
#        - Nome:       krav-maga-bukan-santos
#        - Visibilidade: público
#        - Descrição:  Landing page da escola Krav-Maga Bukan Santos (SP).
#                      HTML único + conteúdo modularizado em 6 JSONs e 30 TXTs.
#   7. Faz o push inicial:  git push -u origin main
#
#  COMO USAR:
#   a) Abra o PowerShell e navegue até a pasta do projeto:
#      cd  "c:\Users\rviva\OneDrive\Documentos\14-Vibecoding\09-Bukan Santos\Bukan_Santos11"
#
#   b) (1ª vez só, se nunca usou Git/GitHub CLI):
#      - Instalar Git:      https://git-scm.com/download/win
#      - Instalar GitHub CLI: https://cli.github.com/  (baixar MSI)
#      - Logar no GitHub:    gh auth login
#
#   c) Execute o script:
#      Set-ExecutionPolicy -Scope Process Bypass -Force
#      .\criar-repositorio-github.ps1
# ============================================================
$ErrorActionPreference = 'Stop'
$REPO_NAME   = 'krav-maga-bukan-santos'
$GITHUB_USER = 'rvivac'
$REPO_URL    = "https://github.com/$GITHUB_USER/$REPO_NAME.git"
$REPO_PUBLICO = $true
$DESC = "Landing page da escola Krav-Maga Bukan Santos (SP). HTML unico + conteudo modularizado em 6 JSONs e 30 arquivos TXT editaveis. Paleta roxo/dourado, assets oficiais, WhatsApp flutuante, linhagem Bukan Rehovot."
$COMMIT_MSG  = "feat: landing page Bukan Santos v1 · modularizado em JSON/TXT"

# --- 0. Garante que estamos na pasta do script ---
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $SCRIPT_DIR
Write-Host ""
Write-Host "==> [0/7] Pasta atual:" (Resolve-Path .).Path -ForegroundColor Cyan
Write-Host ""

# --- 1. Verifica Git instalado ---
function Existe-Cmd {
  param([Parameter(Mandatory=$true)][string]$Nome)
  return [bool](Get-Command $Nome -ErrorAction SilentlyContinue)
}
if (-not (Existe-Cmd 'git')) {
  Write-Host "[ERRO] Git NAO esta instalado. Baixe em: https://git-scm.com/download/win" -ForegroundColor Red
  exit 1
}
Write-Host "[1/7] Git OK" -ForegroundColor Green
Write-Host "      " (git --version)

# --- 2. .gitignore (se faltar) ---
if (-not (Test-Path -LiteralPath '.gitignore')) {
  @"
.vscode/
.idea/
.trae/
Thumbs.db
__pycache__/
*.pyc
.venv/
venv/
node_modules/
.env
.env.*
*.log
screenshots/
*.tmp
"@ | Set-Content -LiteralPath '.gitignore' -Encoding UTF8
  Write-Host "[2/7] .gitignore criado." -ForegroundColor Green
} else {
  Write-Host "[2/7] .gitignore ja existe, OK." -ForegroundColor Green
}

# --- 3. git init + branch main ---
if (-not (Test-Path -LiteralPath '.git')) {
  git init -b main
  Write-Host "[3/7] git init (branch main) concluido." -ForegroundColor Green
} else {
  Write-Host "[3/7] Repositorio local JA inicializado (.git existe), pulando git init." -ForegroundColor Green
}

# --- 4. Config user LOCAL se GLOBAL estiver vazio ---
$cfgGlobalNome  = git config --global --get user.name
$cfgGlobalEmail = git config --global --get user.email
if ([string]::IsNullOrWhiteSpace($cfgGlobalNome) -or [string]::IsNullOrWhiteSpace($cfgGlobalEmail)) {
  Write-Host "[4/7] Config GLOBAL user.name/user.email nao encontrada -> aplicando LOCAL padrão (edite se quiser)." -ForegroundColor Yellow
  git config user.name  "Bukan Santos - Landing Page"
  git config user.email "contato@kravmagabukansantos.com.br"
} else {
  Write-Host "[4/7] user.name/email GLOBAL ja configurados ($cfgGlobalNome <$cfgGlobalEmail>), OK." -ForegroundColor Green
}

# --- 5. git add . + commit inicial ---
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
  Write-Host "[5/7] Nada para commitar (working tree limpa). Commit inicial JA feito? Pulando add/commit." -ForegroundColor Yellow
} else {
  git add .
  git commit -m $COMMIT_MSG
  Write-Host "[5/7] Commit inicial criado: '$COMMIT_MSG'." -ForegroundColor Green
}

# --- 6. Repositório REMOTO: tenta gh repo create ---
$temGh  = Existe-Cmd 'gh'
$temRemote = git remote get-url origin 2>$null

if (-not [string]::IsNullOrWhiteSpace($temRemote)) {
  Write-Host "[6/7] Remote 'origin' ja existe: $temRemote  -> Pulando criacao." -ForegroundColor Yellow
} elseif ($temGh) {
  Write-Host "[6/7] GitHub CLI detectado. Autenticando status..." -ForegroundColor Cyan
  gh auth status 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "      ! gh NAO logado. Execute:  gh auth login   (depois rode o script novamente)" -ForegroundColor Yellow
    Write-Host "      Ou crie o repo manualmente: https://github.com/new"
  } else {
    $visibilidade = if ($REPO_PUBLICO) { '--public' } else { '--private' }
    Write-Host "      Criando repositorio no GitHub:  $REPO_NAME ($visibilidade) ..." -ForegroundColor Cyan
    & gh repo create $REPO_NAME $visibilidade --description $DESC --source . --remote origin --push
    if ($LASTEXITCODE -eq 0) {
      Write-Host "[6/7] Repositorio remoto criado com SUCESSO via gh CLI!" -ForegroundColor Green
      $urlRepo = git remote get-url origin
      Write-Host "      URL: $urlRepo"
      Write-Host "[7/7] Push incluso pelo proprio --push do gh repo create. Finalizado." -ForegroundColor Green
      exit 0
    } else {
      Write-Host "      ! gh repo create falhou (exit=$LASTEXITCODE). Vamos tentar estrategia manual abaixo..." -ForegroundColor Yellow
    }
  }
} else {
  Write-Host "[6/7] GitHub CLI (gh.exe) NAO instalado. Pule para estrategia manual abaixo." -ForegroundColor Yellow
}

# --- 6b. Estrategia MANUAL (caso gh falhou / nao instalado) ---
Write-Host ""
Write-Host "-------------------------------------------------------"
Write-Host "  ESTRATEGIA MANUAL — crie o repositorio no navegador:" -ForegroundColor Cyan
Write-Host "-------------------------------------------------------"
Write-Host "  1) Abra:  https://github.com/new"
Write-Host "  2) Repository name :  $REPO_NAME"
Write-Host "  3) Public  (marque)"
Write-Host "  4) NÃO marque 'Initialize with README' (nem .gitignore, nem license)"
Write-Host "  5) Clique em  [ Create repository ]"
Write-Host ""
Write-Host "  Depois que criar, VOLTE AQUI e execute os 3 comandos abaixo no PowerShell:"
Write-Host ""
Write-Host "      git remote add origin $REPO_URL" -ForegroundColor White
Write-Host "      git branch -M main"                                                        -ForegroundColor White
Write-Host "      git push -u origin main"                                                     -ForegroundColor White
Write-Host ""
Write-Host "  * Username GitHub configurado:  $GITHUB_USER"
Write-Host "  * URL final do repo:  $REPO_URL"
Write-Host "-------------------------------------------------------"
exit 0
