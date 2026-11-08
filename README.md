# ScanController

*Analog Precision for Manga & Webtoons.*

Extension Chrome qui fait défiler vos scans tout seul, à vitesse de croisière. Vous dosez le freinage avec la gâchette analogique de votre manette (DualSense ou Xbox), ou avec la barre Espace.

## Installation

1. Ouvrir `chrome://extensions`
2. Activer le **Mode développeur** (en haut à droite)
3. **Charger l'extension non empaquetée** et choisir ce dossier
4. Recharger l'onglet du scan

## Commandes

| DualSense | Xbox | Clavier | Effet |
| --- | --- | --- | --- |
| ✕ | A | Alt + S / clic sur la pilule | Activer / pause |
| R2 | RT | Espace (amorti) | Frein analogique (100 % = arrêt) |
| L2 | LT | — | Boost jusqu'à +150 % |
| D-Pad ↑/↓ | D-Pad ↑/↓ | — | Vitesse de croisière ± 15 px/s |
| Stick (vertical) | Stick (vertical) | — | Déplacement manuel |

La manette est détectée automatiquement : un toast s'affiche (« DualSense détectée — Pressez R2 pour doser le scroll ») et l'icône de la pilule change.
L'API Gamepad ne rend la manette visible qu'après un premier appui sur un bouton.

## Interface

- **Floating Pill** (HUD en Shadow DOM, en bas à droite) : point d'état lumineux, vitesse en temps réel, et un arc qui se remplit selon la pression sur R2 / Espace.
- **Au survol**, la pilule se déplie sur les réglages rapides :
  - **Vitesse de croisière** : 20 à 600 px/s
  - **Courbe de freinage** : de vive à soyeuse (temps de lissage de la vitesse et amorti de la barre Espace)
  - **Sensibilité gâchette** : de ferme à réactive (courbe de réponse de R2, avec un aperçu en direct)
- **Popup** (icône de l'extension) : état de l'onglet, bouton ON/OFF et les mêmes réglages, synchronisés via `chrome.storage.local`.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `content.js` | Moteur de scroll, détection des entrées, HUD |
| `styles.css` | Styles du HUD (chargés dans le Shadow DOM) |
| `popup.html` / `popup.js` | Popup de l'extension |
| `assets/logo.svg`, `icons/` | Logo vectoriel et icônes PNG |
| `showcase.html` | Landing page avec démo live (lecteur + HUD réel) |

## Showcase

Ouvrir `showcase.html` dans Chrome. La page charge le vrai `content.js` dans le lecteur et lance une démo scriptée en boucle : activation, toast DualSense, pressions sur R2, ouverture du panneau. La démo s'arrête dès qu'on clique sur « Prendre la main », qu'on appuie sur Espace ou Alt + S, ou qu'on branche une manette.
