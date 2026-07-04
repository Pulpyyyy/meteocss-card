# Tests de régression

Suite de tests unitaires/logiques pour `dist/meteocss-card.js`. Chaque fichier
charge la carte dans un mini-DOM simulé (aucune dépendance, pas de jsdom) et
vérifie un correctif précis. Tous acceptent en argument optionnel le chemin
d'un autre build de la carte (utile pour comparer avant/après un changement).

## Lancer

```bash
node tests/run-all.js          # toute la suite
node tests/test-resize.js      # un seul test
```

Sans Node.js installé, le runtime embarqué de VS Code fonctionne :

```bash
ELECTRON_RUN_AS_NODE=1 "C:/Users/<user>/AppData/Local/Programs/Microsoft VS Code/Code.exe" tests/run-all.js
```

## Couverture

| Fichier | Correctif couvert |
|---|---|
| `test-hass-refresh.js` | Rafraîchissement des données réelles quand hass change (soleil/météo figés) |
| `test-demo-autostop.js` | Restauration des données réelles à l'auto-stop du démo (10 min) |
| `test-resize.js` | Repositionnement soleil/lune au redimensionnement de la carte |
| `test-condition-fallback.js` | Fallback `conditions.default` dans les chemins de mise à jour dynamique |
| `test-weather-matrix.js` | Mappings des états météo HA (grêle, neige fondue, windy-variant, clear jour/nuit) |
| `test-transform-anims.js` | Animations puffs/neige en `transform` (compositor) au lieu de `margin-left` |
| `test-shadow-skip.js` | Shader d'ombre non relancé à lumière immobile ; redraw sur mouvement/phase lunaire |
| `test-slave-dirtyflag.js` | Cartes esclaves : skip des frames sans changement d'état + reprise d'élection master |
| `test-wind-unit.js` | Conversion de `wind_speed` en km/h selon `wind_speed_unit` |
| `test-card-relative-anims.js` | Trajectoires nuages/pluie/neige relatives à la carte, vitesses préservées |
| `test-webgl-contextloss.js` | Récupération de la couche ombre après perte de contexte WebGL |
| `test-editmode-poller.js` | Timer edit-mode partagé entre cartes, détection sortie du mode édition |
| `test-host-minheight.js` | Hauteur minimale du :host (aperçu de l'éditeur visible) |
| `test-lifecycle.js` | Déconnexion/reconnexion (changement de vue), mort du singleton, cascade de masters démo, partage du singleton `demo_mode` |
| `test-demo-engine.js` | Moteur démo : pause/reprise du temps, cohérence du cycle 24 h, condition forcée |
| `test-config-conformance.js` | Promesses du README : ratios de nuages, deep-merge partiel, intensité pluie, stubs du picker |
| `test-dynamic-render.js` | Chemins incrémentaux : rebuild lune sur changement de phase, mutation d'attributs seule sur rotation, transitions d'horizon du soleil |
| `test-sky-background.js` | Fenêtres de gradient (jour/nuit/aube/crépuscule), couleurs et limites custom, géométrie des phases de lune |
| `test-security-bounds.js` | Échappement XSS des états d'entités, rejet des données astronomiques aberrantes, ombre coupée à la nouvelle lune |
| `test-coords-calculator.js` | Projection orbitale : ellipse, house_angle, invert_azimuth, position fixe (rx=ry=0), clamping |
| `test-double-load.js` | Double chargement du script (cache) : pas de crash, pas de doublon dans le picker |
| `test-shadow-shader.js` | Construction des shaders d'ombre : template unique pour les deux niveaux de qualité, pow() supprimé au défaut, réglages depth/relight exposés, pente physique tan(élévation) |
| `test-ground-compensation.js` | Compensation de sol : sol plat aplati à ~0, hauteur des murs croissante, option horizon, plomberie canvas |
| `test-layer-placement.js` | Pluie/neige/éclairs en foreground uniquement, répartition du brouillard et des nuages par ratio, contrat z-index des couches |
