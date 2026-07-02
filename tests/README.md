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
