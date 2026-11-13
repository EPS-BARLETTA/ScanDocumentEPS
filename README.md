# ScanDocument EPS

Application web mobile/iPad pour le suivi des fiches de demi-fond **2 × 800 m**.

## Version initiale

- Création de classes et ajout/import CSV des élèves
- Photographie d'une fiche A5 par élève
- Saisie des temps en regard de la photographie
- Validation individuelle et détection d'incohérences de chronométrage
- Suivi des élèves validés, à vérifier ou non scannés
- Tableau récapitulatif et export CSV
- Sauvegarde et restauration JSON (avec photos)

## Utilisation

Ouvrir `index.html` dans un navigateur moderne, ou activer GitHub Pages sur la branche `main` à la racine du dépôt.

Créer une classe, importer la liste des élèves, puis scanner les fiches. Les temps des 200 m sont des **passages cumulés**. L'écart entre le 200 m le plus rapide et le plus lent est calculé à partir des huit durées de fraction. Les écarts estimation/réalisation sont additionnés en valeur absolue.

## Limites et sécurité

**La reconnaissance automatique de l'écriture manuscrite n'est pas encore implémentée.** Les valeurs doivent être saisies et contrôlées manuellement à partir des photos. Ne pas confondre ce prototype avec un système OCR opérationnel.

Les données sont enregistrées localement dans IndexedDB. La sauvegarde JSON contient les photos et les noms. Ne pas utiliser de données réelles d'élèves avant validation par l'établissement des règles de sécurité, de conservation et de conformité RGPD. GitHub Pages héberge uniquement le code, pas les résultats.

## Suite

Étudier une solution de reconnaissance manuscrite adaptée au gabarit fixe, avec contrôle humain obligatoire et traitement conforme aux règles de protection des données.
