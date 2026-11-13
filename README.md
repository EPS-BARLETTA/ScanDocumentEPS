# ScanDocument EPS

Application web mobile/iPad : fiches à bulles personnalisables, lecture automatique des photos, tableau de résultats.

## Fonctionnement (4 étapes)

1. **Classes** : répertoire des classes rangées par dossiers (ex. « 2026-2027 »). Import du CSV PRONOTE : avec une colonne « Classe », toutes les classes sont créées d'un coup ; sinon les élèves vont dans la classe ouverte.
2. **Bibliothèque** :
   - *Modèles prêts à l'emploi* : 2 × 800 m avec estimation, 3 × 500 m avec estimation. « Utiliser ce modèle » en fait une copie.
   - *Mes fiches* : catalogue de tes fiches (classes pour lesquelles elles ont été imprimées, fiches lues et validées). « Modifier » ouvre l'éditeur : blocs (course, série…) et lignes **temps** (min:s), **nombre** (0-99) ou **choix** (A B C D…). Aperçu en direct, A5 si possible sinon A4. Une fiche imprimée ou utilisée est verrouillée (la dupliquer pour la modifier).
   - **🖨 Préparer l'évaluation** : choisir les classes et le nombre de fiches de secours, puis **télécharger le dossier à imprimer** (ZIP : un fichier HTML par classe, prêt à imprimer en taille réelle) ou imprimer directement.
3. **Scanner** : photographier ou importer les fiches entières, dans n'importe quel ordre. Le QR code identifie l'élève et la fiche, les bulles donnent les valeurs. Lecture sur l'appareil.
4. **Résultats** : par fiche, pour une classe ou toutes les classes. Les fiches lues sans alerte (« Lu ✓ à valider ») se valident d'un coup ; les autres sont « À vérifier ⚠ » avec la raison et la photo. **Export HTML** (un tableau par classe + détail des valeurs), CSV en option.

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
