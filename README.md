# ScanDocument EPS

Application web mobile/iPad : fiches à bulles personnalisables, lecture automatique des photos, tableau de résultats.

## Fonctionnement

1. **Mes classes** : créer la classe, importer le CSV PRONOTE (colonne « Élèves »).
2. **Fiches** : construire sa fiche. Des blocs (course, série…) contenant des lignes : **temps** (min:s, minutes 0-5 ou 0-9), **nombre** (0 à 99) ou **choix** (A B C D, 1 à 5…). Une ligne de temps nommée « Estimation » sert au calcul de l'écart estimation/réalisation ; le dernier temps d'un bloc est son temps final. Aperçu en direct. Format automatique : A5 si la fiche tient, sinon A4. Modèles fournis : 2 × 800 m et 3 × 500 m. Une fiche imprimée ou utilisée est verrouillée (la dupliquer pour la modifier) pour que les exemplaires papier restent lisibles.
3. **🖨 Fiches nominatives de la classe** : une fiche par élève, avec son nom et un QR code (A5 : 2 par feuille A4, à couper ; A4 : 1 par feuille). Imprimer en taille réelle. Des **fiches de secours** vierges sont aussi disponibles.
4. Pendant l'épreuve, l'observateur écrit chaque valeur dans la case puis noircit une bulle par colonne.
5. **Scanner** : photographier ou importer les fiches entières, dans n'importe quel ordre. Chaque photo est lue sur l'appareil :
   - les 4 carrés noirs servent à redresser la fiche ;
   - le QR code identifie l'élève et la fiche utilisée ;
   - les bulles donnent les temps.
6. **Résultats** (par classe et par fiche) : les fiches lues sans alerte apparaissent en « Lu ✓ à valider » et se valident d'un coup. Les autres sont « À vérifier ⚠ » avec la raison (deux bulles dans une colonne, ligne incomplète, case « corr. » cochée, temps incohérents…) et la photo à côté pour corriger.
7. Export CSV et sauvegarde JSON.

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
