#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  Sasalele — Script d'installation automatique
#  Usage : bash install.sh
#  Prérequis : Ubuntu/Debian, accès root, port 80 disponible
# ─────────────────────────────────────────────────────────────────
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║     Sasalele — Installation      ║"
echo "  ╚══════════════════════════════════╝"
echo ""

# ── 0. Vérifications préalables ───────────────────────────────────
[ "$EUID" -ne 0 ] && error "Ce script doit être lancé en root (sudo bash install.sh)"

INSTALL_DIR=$(pwd)
info "Répertoire d'installation : $INSTALL_DIR"

# ── 1. Node.js ────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  warn "Node.js non trouvé — installation via NodeSource (v20 LTS)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
NODE_VER=$(node -v)
info "Node.js $NODE_VER"

# ── 2. Dépendances npm ────────────────────────────────────────────
info "Installation des dépendances npm..."
npm install --silent
info "Dépendances installées"

# ── 3. Dossier data ───────────────────────────────────────────────
mkdir -p data/uploads
info "Dossier data/uploads créé"

init_json() {
  local file="data/$1"
  local default="$2"
  if [ ! -f "$file" ]; then
    echo "$default" > "$file"
    info "Créé : $file"
  else
    warn "Existant (conservé) : $file"
  fi
}

init_json "data.json"    "null"
init_json "users.json"   "[]"
init_json "invites.json" "[]"
init_json "roles.json"   "[]"
init_json "logs.json"    "[]"

# ── 4. Service systemd ────────────────────────────────────────────
SERVICE_FILE="/etc/systemd/system/sasalele.service"

if [ ! -f "$SERVICE_FILE" ]; then
  cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Sasalele — App de gestion associative
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/node_modules/.bin/vite --port 80 --host 0.0.0.0
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=development

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable sasalele
  info "Service systemd installé et activé"
else
  warn "Service systemd déjà présent (non modifié)"
fi

# ── 5. Démarrage ──────────────────────────────────────────────────
systemctl start sasalele
sleep 2
if systemctl is-active --quiet sasalele; then
  info "Service démarré"
else
  warn "Le service n'a pas démarré — vérifiez avec : journalctl -u sasalele -f"
fi

# ── 6. Résumé ─────────────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║        Installation terminée !           ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Accès : http://${IP}"
echo ""
echo "  Au premier accès, une page de configuration"
echo "  vous guidera pour régler le nom de l'asso,"
echo "  le thème, et créer le compte administrateur."
echo ""
echo "  Si vous avez une sauvegarde (.tar.gz), vous"
echo "  pouvez l'importer depuis la page Maintenance."
echo ""
echo "  Commandes utiles :"
echo "    systemctl start sasalele      # Démarrer"
echo "    systemctl stop sasalele       # Arrêter"
echo "    systemctl restart sasalele    # Redémarrer"
echo "    systemctl status sasalele     # Statut"
echo "    journalctl -u sasalele -f     # Logs en direct"
echo ""
