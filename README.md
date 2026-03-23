# Sasalele — App de gestion associative

Application web de gestion associative pour les Koalisons.
Stack : **React 18 + Vite 5 + Recharts** — pas de base de données, persistance via fichiers JSON.

---

## Déploiement rapide (nouveau VPS)

### Prérequis
- Ubuntu/Debian avec accès root
- Port 80 ouvert

### Installation en une commande

```bash
git clone <URL_DU_REPO> /root
cd /root
bash install.sh
systemctl start sasalele
```

Le script `install.sh` :
1. Installe Node.js 20 LTS si absent
2. Installe les dépendances npm
3. Crée le dossier `data/` avec les fichiers JSON vides
4. Build l'app en production
5. Installe et active le service systemd `sasalele`

### Premier lancement

Accède à `http://<IP_DU_SERVEUR>` — l'app demande de créer le compte administrateur au premier démarrage.

---

## Commandes

```bash
# Développement (hot reload)
npm run dev

# Build production
npm run build

# Service systemd
systemctl start sasalele
systemctl stop sasalele
systemctl restart sasalele
systemctl status sasalele
journalctl -u sasalele -f        # Logs en direct
```

---

## Structure des fichiers

```
/
├── index.html              # Shell HTML
├── vite.config.js          # Config Vite + API middleware
├── package.json
├── install.sh              # Script d'installation automatique
├── sasalele.service        # Fichier service systemd (référence)
│
├── src/
│   └── koalitales.jsx      # Application complète (monolithe)
│
└── data/                   # ⚠ Non versionné — données persistantes
    ├── data.json           # Données applicatives
    ├── users.json          # Comptes utilisateurs
    ├── invites.json        # Codes d'invitation
    ├── roles.json          # Configuration des rôles
    ├── logs.json           # Journal d'activité
    └── uploads/            # Fichiers uploadés (avatars, logos, CR)
```

> **Important :** le dossier `data/` est exclu du repo git (`.gitignore`).
> Ne jamais versionner les données — elles contiennent des informations personnelles.

---

## Sauvegarde des données

Les données sont dans `/root/data/`. Pour sauvegarder :

```bash
# Sauvegarde manuelle
tar -czf backup-$(date +%Y%m%d).tar.gz /root/data/

# Sauvegarde automatique quotidienne (crontab)
echo "0 3 * * * tar -czf /root/backups/data-\$(date +\%Y\%m\%d).tar.gz /root/data/" | crontab -
mkdir -p /root/backups
```

---

## Mise à jour

```bash
cd /root
git pull
npm install          # Si les dépendances ont changé
npm run build
systemctl restart sasalele
```

---

## Architecture

- **Frontend** : React 18, CSS-in-JS, responsive (breakpoint 768px)
- **Backend** : Middleware Vite — `GET/POST /api/data`, `/api/users`, `/api/logs`, `/api/upload`…
- **Auth** : Session token dans `localStorage`, hash mot de passe Base64+sel
- **Fichiers** : uploadés dans `data/uploads/`, servis via `GET /uploads/<fichier>`
- **Permissions (RBAC)** : `create_event`, `edit_event`, `invoices`, `settings`, `catalog`, `manage_users`, `manage_inventory`, `manage_meetings`, `manage_prestations`, `manage_depenses`, `manage_treasury`, `web_admin`
