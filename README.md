# ScanDocument EPS

Application web mobile/iPad : fiches à bulles personnalisables, lecture automatique des photos, tableau de résultats.

## Fonctionnement

L'accueil propose trois actions :

1. **🖨 Préparer une évaluation** : choisir la fiche, cocher les classes, puis **télécharger le dossier à imprimer** (ZIP, un fichier par classe) ou imprimer directement.
2. **📷 Scanner les fiches** : photographier les fiches entières. Les fiches reconnues vont dans les résultats ; les autres restent à vérifier avec les valeurs lues.
3. **📊 Voir les résultats** : par fiche, pour une classe ou toutes ; validation groupée ; export HTML (CSV en option).

En bas de l'accueil :
- **👥 Mes classes** : import PRONOTE (une colonne « Classe » crée toutes les classes), classes rangées par dossiers.
- **📚 Mes fiches** : 2 × 800 m et 3 × 500 m avec estimation fournis ; création et modification de fiches (blocs, lignes temps / nombre / choix, A5 ou A4).
- **⚙ Sauvegarde**.

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
- `fiche.js` : mise en page calculée à partir du modèle, génération SVG, lecture (seuillage adaptatif, repères, homographie, lecture des bulles).
- `app.js` : application (classes, éditeur de fiches, scan, résultats, sauvegarde).
- `lib/qrcode.js` (qrcode-generator, MIT) et `lib/jsQR.js` (jsQR, Apache-2.0).

## Données et RGPD

Les données sont enregistrées localement dans IndexedDB. Les photos ne quittent pas l'appareil. Le QR code ne contient pas le nom, seulement un identifiant interne. La sauvegarde JSON contient les photos et les noms. Faire valider l'usage de données réelles par l'établissement. GitHub Pages héberge uniquement le code, pas les résultats.
