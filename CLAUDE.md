# Atelier paille

Outil web pour concevoir une marqueterie de paille sur un panneau plat (façade, porte, plateau, sous-bock) et prévisualiser son rendu : motifs, sens du fil, trous, chanfreins et arrondis, reflets selon la lumière, plan de pose imprimable à l'échelle 1:1 et estimation de la paille nécessaire.

Utilisateur : un marqueteur amateur qui pose lui-même la paille. L'outil sert à décider d'un motif **avant** de coller, puis à guider la pose. La justesse physique du rendu compte plus que les effets visuels.

## Prototype de référence

`docs/prototype/atelier-paille.html` est un prototype autonome (HTML + canvas + three.js r128) qui fixe le comportement attendu. En cas de doute sur une règle métier ou un rendu, **il fait foi** : ouvre-le dans un navigateur et lis le code avant d'inventer. Ne le modifie pas, c'est une spécification figée.

## Stack

- Angular récent (≥ 20) : composants standalone, signals, `zoneless`, nouveau control flow (`@if`, `@for`), `inject()` plutôt que l'injection par constructeur.
- TypeScript strict (`strict: true`, `noUncheckedIndexedAccess: true`).
- Canvas 2D natif pour le rendu paille et le plan de pose.
- `three` (npm, avec ses types) pour la vue 3D. Pas de wrapper Angular autour de three.js.
- Aucune lib UI lourde : composants maison et SCSS. Angular CDK autorisé (overlay, a11y, drag-drop des calques).
- Pas de backend pour l'instant : l'état vit dans le navigateur (localStorage + export/import JSON).
- Tests : le runner configuré par le CLI Angular. Les fonctions de géométrie pures se testent sans DOM.

## Commandes

```bash
npm start          # ng serve
npm test           # tests unitaires
npm run build      # build de prod
npm run lint       # eslint (angular-eslint)
```

Lance `npm test` et `npm run lint` avant de considérer une tâche finie.

## Architecture

```
src/app/
  core/
    model/            # types du domaine (Project, Zone, EdgeProfile…), aucune dépendance Angular
    geometry/         # fonctions pures : polygones, offset, point-in-polygon, aires, profils
    patterns/         # générateurs de motifs (soleil, bandes, damier, losanges), purs
    materials/        # palette des pailles, estimation matière (BOM)
    export/           # SVG du plan 1:1, plan en pages A4, sérialisation/validation JSON
    import/           # SVG → zones : chemins, transformations, couleurs → pailles
  state/
    project.store.ts  # store à base de signals : état, sélection, undo/redo, persistance
    projects.store.ts # plusieurs projets dans le navigateur (index + vignettes)
    ui.store.ts       # état d'interface hors projet : pose guidée, comparaison, menus, zoom
  render/
    straw-2d.renderer.ts   # rendu paille sur canvas 2D (pur : reçoit ctx + état)
    plan-2d.renderer.ts    # plan de pose (hachures, numéros, pointillés des profils)
    three/
      scene.service.ts     # renderer, caméra orbitale, lumières (hors zone Angular)
      panel-geometry.ts    # BufferGeometry : face, profils, parois, dos
      straw-maps.ts        # génération des textures albedo et direction du fil
      straw.material.ts    # ShaderMaterial (Kajiya-Kay)
  features/
    editor/           # écran principal : canvas + barre d'outils + panneau latéral
    inspector/        # propriétés de la forme sélectionnée
    light-panel/      # lumière, brillance, largeur et irrégularité des brins, fond
    edges-panel/      # épaisseur et profil du chant
    patterns-panel/   # générateurs de motifs
    layers-panel/     # liste des calques (ordre, sélection, alertes)
    bom-panel/        # estimation matière
    export-panel/     # gabarit A4, SVG, JSON, import, réinitialisation
    svg-import/       # boîte d'import d'un dessin SVG
    projects/         # liste des projets
  shared/ui/          # boutons, segmented control, swatch, slider, number-field (mm)
```

Règle : `core/` et `render/*.renderer.ts` ne dépendent pas d'Angular. Tout ce qui calcule est pur et testable. Les composants se contentent de lire le store et d'appeler ses méthodes.

## Modèle de données

Toutes les longueurs sont en **millimètres**, tous les angles en **degrés**. Repère : origine en haut à gauche du panneau, x vers la droite, y vers le bas (comme le canvas). La conversion vers le repère three.js (y vers le haut) se fait **uniquement** dans `render/three/`.

```ts
type StrawColor = 'naturel' | 'ble' | 'miel' | 'brule' | 'ebene' | 'garance' | 'indigo' | 'sauge' | 'rose';
type ShapeType = 'rect' | 'ellipse' | 'tri' | 'diamond' | 'hex' | 'poly';
type ProfileType = 'droit' | 'chanfrein' | 'arrondi';
type FillType = 'parallele' | 'eventail' | 'chevron';

interface StrawFill {
  type: FillType;
  cx: number; cy: number;        // origine de l'éventail, coords normalisées de la forme, −3…3
  open: number;                  // chevron : ouverture ± autour de l'axe, 10–80
  band: number;                  // chevron : largeur d'une bande en mm, 2–500
}

interface EdgeProfile { type: ProfileType; size: number }           // size en mm

interface Zone {
  id: number;
  type: ShapeType;
  name: string;                  // ≤ 40 caractères, toujours affiché comme texte
  x: number; y: number;          // centre
  w: number; h: number;
  rot: number;                   // rotation de la forme
  pts?: [number, number][];      // 'poly' seulement : points normalisés dans [-0.5, 0.5]
  color: StrawColor;
  angle: number;                 // sens du fil (parallèle) ou axe (chevron), ABSOLU, 0–179
  hole: boolean;                 // découpe traversante : couleur et angle ignorés
  edge?: EdgeProfile;            // trous seulement
  fill?: StrawFill;              // disposition des brins ; absente = parallèle
}

interface Project {
  panel: { w: number; h: number };
  thick: number;                 // épaisseur, 3–60
  edge: EdgeProfile;             // profil du chant extérieur
  bg: { mode: 'paille' | 'bois'; color: StrawColor; angle: number };
  sw: number;                    // largeur d'un brin, 1–20 (4 par défaut)
  irr: number;                   // irrégularité des brins, 0–1
  light: number;                 // azimut de la lumière, 0–359
  elev: number;                  // hauteur de la lumière (3D), 5–85
  contrast: number;              // force des reflets, 0–1
  gloss: number;                 // finition mate → vernie, 0–1
  view: 'rendu' | 'plan' | '3d';
  zones: Zone[];                 // ordre = ordre de pose, le dernier passe devant
}
```

Toute donnée qui entre (localStorage, import JSON) passe par une fonction `normalizeProject()` qui borne chaque nombre, remplace les couleurs ou types inconnus par des valeurs par défaut et réattribue les ids. Port direct de `norm()` dans le prototype.

## Règles métier

- **Formes** : polygone monde = points unitaires de la forme × (w, h), rotation `rot`, translation (x, y). L'ellipse est approchée par 72 points. Toutes les opérations (hit-test, aires, offsets) travaillent sur ces polygones.
- **Sens du fil** : il est absolu et ne tourne pas avec la forme. Les angles sont pris modulo 180 car un brin n'a pas de sens.
- **Disposition des brins** (`core/geometry/fill.ts`) : chaque forme est découpée en pièces, bornées à `bbox(forme) ∩ panneau`, et c'est la même découpe qui sert au rendu 2D, au plan, au SVG et à la texture de direction 3D.
  - *Parallèle* : bandes droites dans le sens `angle`.
  - *Éventail* : brins en coin rayonnant depuis l'origine, larges de `sw` au plus loin ; le fil suit le rayon ; coupes transversales tous les ~140 mm.
  - *Chevron* (arête de poisson) : bandes parallèles à l'axe `angle`, calées sur le centre de la forme, fil à `axe ± open` en alternance.
  - Pas de pose en arrondi : un brin de paille aplati reste droit, toute disposition est faite de brins rectilignes.
  - L'origine est stockée en coordonnées de la forme : elle suit déplacement, taille et rotation. Le plan de pose la marque d'une croix.
- **Calques** : peintre classique, la zone suivante recouvre la précédente. Les trous sont toujours appliqués après toutes les zones, quel que soit leur rang. Les numéros du plan de pose sont l'index + 1.
- **Zone étroite** : moins de 3 brins de large (`min(w, h) < 3 × sw`, formes non `poly`), signalée dans les calques et l'inspecteur.
- **Motifs** : chaque générateur renvoie des `Zone` ordinaires, modifiables ensuite. Le soleil oriente le fil de chaque rayon selon sa bissectrice. Ses secteurs débordent du panneau, c'est voulu : seule la partie visible compte.
- **Changement de dimensions du panneau** : positions et tailles des zones mises à l'échelle, sauf la taille des trous (un perçage garde sa cote).
- **Profils** : rayon effectif = `min(size, thick − 0.5)`. Le perçage garde sa cote et le profil élargit l'ouverture en façade. Un trou dont le profil sort du panneau ou chevauche un autre trou est percé sans profil, ou découpé par la texture seulement en dernier recours.
- **Estimation matière** : échantillonnage sur une grille d'environ 120 cases dans la plus grande dimension, couleur visible par point, trous exclus. Mètres de bande = surface / `sw` × 1,15 (chute). Les profils ajoutent `périmètre × (longueur d'arc − r)` (arrondi : πr/2, chanfrein : √2·r). Toujours présenté comme une estimation.

## Physique des reflets : ne pas inverser

La paille fendue et aplatie est striée dans le sens du fil et se comporte comme du métal brossé. **Elle brille quand la lumière arrive en travers des brins**, pas dans leur axe. Le premier prototype avait ce modèle à l'envers.

- 2D : facteur de luminosité `1 − c·0.42 + c·0.72·sin²(angleFil − azimutLumière)`, avec `c = contrast`.
- 3D : modèle anisotrope de Kajiya-Kay. Spéculaire = `sin(T, H)^p`, diffus pondéré par `sin(T, L)`. `T` vient de la texture de direction, avec un léger décalage par brin (canal B) pour éviter que tous les brins brillent en bloc.
- Sur un profil, la tangente est courbée : `T = (T₀·e)e + (T₀·u)(u·cos t − z·sin t)`. Ici `u` est la direction du vide dans le plan, `e` la direction du bord et `t` l'angle du profil (0 en façade, 90° sur la paroi).

Toute évolution du rendu doit garder ces règles. Si tu les changes, explique pourquoi dans la PR.

## Rendu

### 2D (`straw-2d.renderer.ts`)
Pour chaque zone : clip au polygone, rotation selon le fil, bandes de largeur `sw`. Chaque bande a sa teinte, avec une variation pseudo-aléatoire graine = id de zone, puis :
- un liseré sombre aux joints ;
- des coupes transversales tous les 140 mm environ (longueur utile d'un brin) ;
- une texture de fibres en `multiply`.

Les trous sont faits en `destination-out` avec une ombre intérieure. Les bandes de profil sont un anneau assombri plus une ligne claire au début de la courbe. Rendu déclenché par `requestAnimationFrame`, jamais en boucle continue.

### Plan de pose (`plan-2d.renderer.ts`)
Fond blanc, hachures dans le sens du fil et dans la couleur de la zone, contours noirs, numéro posé sur un point réellement visible de la zone. Trous en pointillés rouges, début des profils en pointillés gris. L'export SVG reproduit le même contenu avec `width/height` en `mm` et `viewBox` en mm, pour une impression à 100 % qui sert de gabarit.

### 3D (`render/three/`)
- Deux textures canvas générées à partir de l'état, d'au plus 2048 px de côté : **albedo** (rendu 2D sans reflet) et **direction** (R, G = cos, sin du fil remappés en 0–1 ; B = décalage par brin). La texture de direction n'a pas de mipmaps (filtre linéaire), sinon les directions se moyennent n'importe comment.
- Géométrie construite à la main en `BufferGeometry`, à deux groupes :
  - groupe 0, paille (shader) : face avant triangulée avec `ShapeUtils.triangulateShape` sur les contours décalés, plus les anneaux de profil (8 pas pour un arrondi, 1 facette pour un chanfrein) ;
  - groupe 1, médium (`MeshLambertMaterial`) : parois et dos.
  - Attributs supplémentaires : `aU` (direction du vide) et `aT` (angle du profil). Les UV des profils = projection xy, pour que la paille continue depuis la façade.
- Offsets de contour par onglet, facteur borné à 1/0,35 sur les angles aigus. Normales lissées si l'angle entre deux arêtes fait moins de 35°, vives sinon.
- La caméra orbitale est maison (glisser, molette, pincement, double-clic = de face) et vise la forme sélectionnée.
- Ne reconstruire textures et géométrie que si une clé dérivée de (panel, bg, sw, irr, zones, thick, edge) change, avec un debounce d'environ 140 ms. Lumière, caméra et brillance ne modifient que des uniforms.
- **three.js doit tourner hors de la zone Angular** et dans un service, avec nettoyage complet (geometry, textures, renderer) dans `DestroyRef`.
- Le prototype utilise r128 et fait sa correction gamma dans le shader. Avec un three récent, règle explicitement `ColorManagement`, l'`outputColorSpace` du renderer et le `colorSpace` des textures, et retire la correction manuelle si elle fait double emploi. Vérifie visuellement que l'albedo 3D correspond à la 2D.

## Interface Angular

Layout (reprendre celui du prototype) :
- **En-tête** : titre, gabarits (sous-bock 100×100, façade de tiroir 450×150, porte de buffet 400×700, couvercle 220×140, plateau 1000×550, porte 830×2040), largeur et hauteur en mm, sélecteur de vue (Rendu paille / Plan de pose / Vue 3D), Annuler / Rétablir.
- **Zone de travail** : panneau sur un tapis de découpe vert avec grille mm adaptative (pas de 5, 10, 50, 100 ou 500 mm selon l'échelle) et barre d'outils des formes et des trous. Un petit soleil déplaçable sur le tapis règle l'azimut. Poignées : coin = redimensionnement symétrique proportionnel (Maj = libre), milieux du côté droit et du côté bas = largeur ou hauteur seule, rotation par pas de 5° (Maj = libre). Aimantation des déplacements, des tailles et de l'origine de l'éventail aux bords, centres et milieux du panneau et des autres formes (≈ 8 px à l'écran, Alt pour l'éviter) ; une taille s'aimante aussi à l'autre dimension (retrouver un cercle) et aux cotes des autres formes.
- **Panneau latéral**, une section par composant : Sélection, Lumière et paille, Chants et épaisseur, Motifs, Calques, Matière, Exporter.
- Sous 900 px tout s'empile : titre, canvas, puis contrôles.

Store (`project.store.ts`) :
- `project = signal<Project>`, `selectedId = signal<number | null>`, `computed` pour la zone sélectionnée, l'estimation matière et les polygones préparés.
- Mutations : une modification « live » (slider en cours, drag) ne crée pas d'entrée d'historique. Un `commit()` à la fin du geste (pointerup, `change`) pousse l'état précédent dans l'historique (100 entrées max).
- Persistance : `effect()` qui enregistre le dernier état commité dans localStorage, dans un try/catch. Au démarrage : localStorage normalisé, sinon le projet exemple (porte de buffet, soleil 12 rayons, chant arrondi 4 mm, trou de prise en main arrondi 6 mm).
- Raccourcis : Ctrl/Cmd+Z, Ctrl/Cmd+Maj+Z ou Ctrl+Y, Suppr, Ctrl/Cmd+D (dupliquer), flèches (1 mm, Maj = 10 mm), Échap. Ignorés quand le focus est dans un champ.

Conventions UI :
- Cibles d'au moins 44 px, champs à 16 px minimum (pas de zoom iOS), focus visible.
- Libellés en français, en minuscule de phrase. Unités toujours affichées (mm, °, %).
- Nombres formatés en `fr-FR`. Aucun texte utilisateur injecté en HTML brut.
- Thème clair et sombre via `light-dark()`. Le tapis vert reste identique dans les deux.

## Conventions de code

- Un composant = un fichier `.ts` avec template et styles inline s'ils sont courts, sinon des fichiers séparés. `ChangeDetectionStrategy.OnPush` partout.
- Pas de `any`. Les types du domaine viennent de `core/model`.
- Les fonctions de rendu reçoivent tout ce dont elles ont besoin en paramètres (contexte, état, échelle, origine) : aucune variable globale mutable comme dans le prototype.
- Générateurs aléatoires déterministes (graine = id de zone) pour que le rendu ne scintille pas d'une frame à l'autre.
- Commits en français, à l'impératif, courts.

## Pièges connus (vus sur le prototype)

- `ExtrudeGeometry` avec biseau applique le même biseau à tous les contours et met la face du biseau dans le matériau des parois : d'où la géométrie construite à la main.
- Les trous et profils qui se chevauchent cassent la triangulation : filtrer avant, prévoir un repli sans profil.
- Le soleil des motifs génère des polygones bien plus grands que le panneau : toujours borner les boucles de dessin à `bbox(zone) ∩ panneau`.
- Une `CanvasPattern` est liée à son contexte : la recréer pour chaque canvas hors écran.
- Grands panneaux (porte 830×2040) : beaucoup de bandes par frame. Couper les détails (coupes transversales, reflets de bande) quand une bande fait moins de 2 px à l'écran.
- La sélection au clic ne doit pas attraper les secteurs qui débordent : ignorer les clics hors du panneau. Une forme qui déborde largement (`overflowsPanel`) n'a ni poignées de taille ni rôle de repère d'aimantation ; son contour de sélection est coupé au panneau.
- Un `<select>` dont les `<option>` viennent d'un `@for` : marquer l'option avec `[selected]`, pas `[value]` sur le select (la valeur est posée avant que les options existent).

## Ergonomie en place

- **Zoom et déplacement** du canvas 2D : molette ou pincement (autour du pointeur), glisser le tapis, `+` `−` `0`, double-clic sur le tapis pour revenir à la vue ajustée. Le zoom revient à l'ajusté quand les dimensions du panneau changent.
- **Gabarit A4** (`core/export/plan-tiles.ts`) : pages qui se recouvrent de 10 mm, repères A1, B1…, croix de calage dans les recouvrements, règle de 50 mm pour vérifier l'impression à 100 %, orientation choisie pour économiser du papier.
- **Pose guidée** (plan de pose) : une zone visible à la fois dans l'ordre de pose, le reste voilé, avec paille, disposition, surface visible et mètres de bande.
- **Menu contextuel** (clic droit) sur une forme ; **aide** (touche `?`) ; **conseil** à la première visite.
- **Aperçus des motifs** avant de les ajouter ; **comparaison de deux lumières** côte à côte en rendu paille.
- **Projets multiples** enregistrés dans le navigateur avec vignette.
- **Mobile** : réglages dans un panneau qui glisse depuis le bas.
- **Import SVG** (`core/import/`) : chaque forme remplie devient une zone `poly` dans l'ordre du document. Transformations, unités physiques (`width` en mm, cm, in…), couleurs → paille la plus proche (modifiable), simplification des contours. Le fichier est lu avec `DOMParser` et jamais inséré dans la page. Bouton dans la barre d'outils, dans Exporter, ou dépôt du fichier sur le tapis.

## Hors périmètre pour l'instant

Comptes utilisateurs et backend, panneaux non rectangulaires, courbes de Bézier libres, trous et dégradés à l'import SVG (les sous-chemins évidés deviennent des zones pleines), rendu de la texture réelle des nœuds de paille.
