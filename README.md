# Sasalele — App de gestion associative

Application web de gestion associative auto-hébergée.  
Stack : **React 18 + Vite 5 + Recharts** — pas de base de données, persistance via fichiers JSON.

---

## Installation sur un nouveau VPS

### Prérequis

- Ubuntu ou Debian
- Accès root
- Port 80 ouvert
- Git installé (`apt install git`)

### En trois commandes

```bash
git clone https://github.com/Le-plex/sasalele.git /opt/sasalele
cd /opt/sasalele
bash install.sh
```

Le script `install.sh` fait tout automatiquement :
1. Installe Node.js 20 LTS si absent
2. Installe les dépendances npm
3. Crée le dossier `data/` avec les fichiers JSON vides
4. Installe et démarre le service systemd `sasalele`

### Premier lancement

Accède à `http://<IP_DU_SERVEUR>` — une page de configuration te guide pour :
- Choisir le nom de l'association
- Choisir la couleur du thème
- Créer le compte administrateur

---

## Restaurer depuis une sauvegarde

Si tu as une sauvegarde d'une instance existante (fichier `.tar.gz`) :

**Option A — Via l'interface** *(recommandé)*  
Installe normalement, connecte-toi, puis va dans **Administration → Maintenance → Sauvegardes → Restaurer**.

**Option B — En ligne de commande**
```bash
# Depuis le répertoire d'installation
tar -xzf sasalele-backup-YYYY-MM-DD.tar.gz
systemctl restart sasalele
```

Tout est restauré : événements, dépenses, réunions, utilisateurs, fichiers uploadés, etc.  
> La configuration Qonto (`qonto-secrets.json`) est volontairement exclue des sauvegardes — à re-saisir manuellement dans Administration → Maintenance.

---

## Sauvegarder les données

### Via l'interface
Administration → **Maintenance** → section **Sauvegardes** → bouton **Télécharger la sauvegarde**

Télécharge un fichier `sasalele-backup-YYYY-MM-DD.tar.gz` contenant tous les JSON et les fichiers uploadés.

### En ligne de commande
```bash
tar -czf sasalele-backup-$(date +%Y-%m-%d).tar.gz -C /opt/sasalele data/
```

### Sauvegarde automatique quotidienne
```bash
mkdir -p /root/backups
echo "0 3 * * * tar -czf /root/backups/sasalele-\$(date +\%Y-\%m-\%d).tar.gz -C /opt/sasalele data/" | crontab -
```

---

## Mise à jour

```bash
cd /opt/sasalele
git pull
npm install        # uniquement si package.json a changé
systemctl restart sasalele
```

Ou depuis l'interface : Administration → **Maintenance** → **Mises à jour** *(fonctionnalité à venir)*

---

## Commandes utiles

```bash
systemctl start sasalele       # Démarrer
systemctl stop sasalele        # Arrêter
systemctl restart sasalele     # Redémarrer
systemctl status sasalele      # Statut
journalctl -u sasalele -f      # Logs en direct
```

---

## Structure des fichiers

```
/
├── index.html              # Shell HTML
├── vite.config.js          # Config Vite + API middleware (routes /api/*)
├── package.json
├── install.sh              # Script d'installation automatique
├── sasalele.service        # Exemple de fichier service systemd
│
├── src/
│   └── koalitales.jsx      # Application complète
│
└── data/                   # ⚠ Non versionné — données persistantes
    ├── data.json           # Données applicatives (events, dépenses, réunions…)
    ├── users.json          # Comptes utilisateurs (hashs, tokens, permissions)
    ├── invites.json        # Codes d'invitation
    ├── roles.json          # Rôles et permissions personnalisés
    ├── logs.json           # Journal d'activité
    └── uploads/            # Fichiers uploadés (logos, avatars, CR de réunions…)
```

> Le dossier `data/` est exclu du repo git. Ne jamais le versionner — il contient des données personnelles.

---

## Architecture technique

| Composant | Détail |
|-----------|--------|
| Frontend | React 18, CSS-in-JS, responsive (breakpoint 768px) |
| Serveur | Vite dev server — le middleware `configureServer` expose toutes les routes `/api/*` |
| Persistance | Fichiers JSON dans `data/` — lecture/écriture atomique (write → rename) |
| Auth | Token aléatoire dans `localStorage`, mot de passe hashé (Base64 + sel) |
| Fichiers | Uploadés dans `data/uploads/`, servis via `GET /uploads/<fichier>` |
| Service | systemd — `Restart=on-failure`, démarre au boot |

### Permissions disponibles (RBAC)

`create_event` · `edit_event` · `invoices` · `settings` · `catalog` · `manage_users` · `manage_inventory` · `manage_meetings` · `manage_prestations` · `manage_depenses` · `manage_treasury` · `web_admin`

Le compte root (créé à l'installation) possède toutes les permissions.

---

## Pages de l'application

| Page | Permission requise | Description |
|------|--------------------|-------------|
| Dashboard | tous | KPIs, graphiques, aperçu général |
| Événements | tous / `edit_event` | Gestion complète avec 7 onglets |
| Factures | `invoices` | Factures + catalogue tarifaire |
| Inventaire | `manage_inventory` | Matériel, quantités, emplacements |
| Réunions | `manage_meetings` | Agenda, participants, CR uploadé |
| Prestations | `manage_prestations` | Suivi des prestations |
| Contacts | tous | CRUD contacts liés aux events |
| Dépenses | tous / `manage_depenses` | Tricount, remboursements, solde |
| Comptabilité | `manage_treasury` | Workflow de confirmation des remboursements |
| Association | `settings` | Logo, SIRET, IBAN, paramètres |
| Utilisateurs | `manage_users` | RBAC, codes d'invitation |
| Maintenance | `web_admin` | Mode maintenance, sauvegardes, Qonto, mises à jour |
