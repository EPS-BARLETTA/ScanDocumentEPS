# ScanDocument EPS

Application web mobile/iPad pour le suivi des fiches de demi-fond **2 × 800 m**.

## Fonctionnement

1. **Mes classes** : créer la classe, importer le CSV PRONOTE (colonne « Élèves »).
2. **🖨 Fiches nominatives de la classe** : une fiche A5 par élève, avec son nom et un QR code (2 fiches par feuille A4, à couper). Imprimer en taille réelle. Des **fiches de secours** vierges sont aussi disponibles.
3. Pendant la course, l'observateur écrit chaque temps dans la case puis noircit une bulle par colonne (minutes · 1er chiffre des secondes · 2e chiffre).
4. **Scanner** : photographier ou importer les fiches entières, dans n'importe quel ordre. Chaque photo est lue sur l'appareil :
   - les 4 carrés noirs servent à redresser la fiche ;
   - le QR code identifie l'élève ;
   - les bulles donnent les temps.
5. **Résultats** : les fiches lues sans alerte apparaissent en « Lu ✓ à valider » et se valident d'un coup. Les autres sont « À vérifier ⚠ » avec la raison (deux bulles dans une colonne, ligne incomplète, case « corr. » cochée, temps incohérents…) et la photo à côté pour corriger.
6. Export CSV et sauvegarde JSON.

## Erreurs prévues

| Situation | Ce que fait l'appli |
|---|---|
| Deux bulles ou aucune dans une colonne | Fiche « À vérifier », comparer avec le temps écrit |
| Élève qui s'est trompé | Il noircit la case « corr. » et écrit le bon temps à côté : fiche « À vérifier » |
| Passages incohérents | Alerte (passage plus petit que le précédent) |
| QR illisible, fiche de secours | Fiche gardée dans « Fiches à traiter », choisir l'élève à la main |
| Même élève photographié deux fois | La lecture non validée est remplacée ; si une fiche validée existe, alerte |
| Repères non trouvés | Message pour reprendre la photo |

## Technique

Aucun serveur : tout tourne dans le navigateur, hors connexion après la première ouverture.
- `fiche.js` : gabarit de la fiche, génération SVG, lecture (seuillage adaptatif, repères, homographie, lecture des bulles).
- `lib/qrcode.js` (qrcode-generator, MIT) et `lib/jsQR.js` (jsQR, Apache-2.0).

## Données et RGPD

Les données sont enregistrées localement dans IndexedDB. Les photos ne quittent pas l'appareil. Le QR code ne contient pas le nom, seulement un identifiant interne. La sauvegarde JSON contient les photos et les noms. Faire valider l'usage de données réelles par l'établissement. GitHub Pages héberge uniquement le code, pas les résultats.
