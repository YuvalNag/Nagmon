# אמנות לטיול הראשון: מערכת השמש

תיאורים מוכנים למחולל התמונות של ההורה, לכל פריט שהטיול צריך (TRIPS.md §4).
ההסברים בעברית. ההנחיות למחולל באנגלית, בתוך בלוקי קוד, כי מחוללים עובדים הכי טוב באנגלית.

- **מקורי בלבד:** כל הדמויות, החיות, הכלי והאריחים כאן הם שלנו. אין שמות, דמויות, לוגואים או משפטים מסדרה, מספר או ממותג קיימים.
- **צניעות** (SDD_MODESTY): בנות ונשים בשמלה או חצאית ארוכה עד הקרסול, או בחליפת חלל ארוכה וצנועה, שרוול ארוך, שום דבר צמוד או בלי שרוולים. אישה נשואה יכולה לכסות ראש. גברים ובנים בלבוש צנוע, וכיפה קטנה אם מתאים.
- **סמלים:** בלי סמלים דתיים של אמונות אחרות. בלי צלב, בלי "+" בתוך ריבוע, ובלי ניצוץ של ארבע קרניים שנראה כמו "+". כוכבים הם נקודות עגולות או כוכב מעוגל של חמש קרניים. סהר לא מופיע לבד ולא ליד כוכב (§3.2.1).
- **עדין:** לגילאי 5 עד 14. בלי פחד, בלי אלימות, בלי כלי נשק, בלי פרצופים כועסים.
- **בלי טקסט בתמונה:** בלי אותיות, מספרים, שלטים, דגלים או לוגואים, גם לא על הכלי ועל הקירות.

---

## 1. מדריך הסגנון

### 1.1 מה מדדתי

מדדתי את הקבצים שבמשחק (`mods/nagmon/sprites/`, `mods/nagmon/gfx/sprites/player/`, `mods/nagmon/gfx/sprites/battle/`) ואת המקורות של ההורה (`art_sources/`).

| מה | מפה (גיליון 3×4) | קרב (דמות) | חיות |
|---|---|---|---|
| **קו מתאר: צבע** | כמעט שחור וחמים: חציון הקצה ‎#050205 עד ‎#241008 | אותו דבר: ‎#030102 עד ‎#110A06. אצל מילה חום כהה מאוד (‎#4D2707) | גוון כהה מאוד של צבע הגוף: ‎#3E0B02 (כתום), ‎#053B41 (ירוק), ‎#07072A (סגול) |
| **קו מתאר: עובי** | במקור (1024×1536): 5 עד 7 פיקסלים, כ־1/50 עד 1/70 מגובה הדמות. במשחק: פיקסל אחד בגודל הטבעי | במקור: 9 עד 13 פיקסלים, כ־1/60 עד 1/100 מהגובה | במקור: כ־11 פיקסלים, כ־1/45 עד 1/55 מהגובה |
| **ראש מול גוף** | הראש (עם השיער) 43%–46% מהגובה: בערך 2.2 ראשים, **גם למבוגרים וגם לילדים** | מבוגרים: הראש 33%–38% (2.6 עד 3 ראשים). ילדים: 37%–42% (2.4 עד 2.7 ראשים) | צ'יבי מאוד: גוף עגול, עיניים גדולות, גפיים קצרות |
| **גובה במשחק** | ה־importer משווה את כולם לאותו גובה: הדמות הגבוהה ביותר בגיליון היא 22/32 מהתא (הינשוף 20/32). לכן מבוגר וילד נבדלים בפרופורציות ובפרטים, לא בגובה | הדמות ממלאת את גובה התא | ממלאת את התא |
| **צבעים** | חיים ורוויים, חמים. 2–3 גוונים לכל משטח (הצללה מדורגת), והדגשה קטנה אחת. במקורות יש אלפי גוונים (מעברים רכים), וזה בסדר: ה־HD מוקטן בהחלקה | כמו במפה | כמו במפה |
| **אור** | רך, מלפנים ומלמעלה, קצת משמאל. ההבדל בין חצי שמאל לימין של דמות קטן מ־2%. הצל: מתחת לסנטר, בצד ימין התחתון של הבגד | כמו במפה. בדמויות הקרב צד שמאל בהיר עד 10% יותר | הדגשה עגולה למעלה משמאל (פלוסון, מבחנון) |
| **רקע** | מג'נטה שטוח ‎#FF00FF בכל המקורות. אין צל על הרצפה | מג'נטה שטוח | מג'נטה שטוח |

**הצבעים של הדמויות שעליהן אנחנו בונים** (נדגמו מהקבצים, גוונים עיקריים):

| דמות | צבעים |
|---|---|
| מילה (`nagmon_mila`) | שמלה כתומה ‎#F77D03 ו־‎#E06403, עיטור שמנת ‎#FCF6B9, זהב ‎#F6C264, עור חום כהה ‎#8D380D ו־‎#492519, שיער שחור מתולתל ‎#241C1A בפקעת גבוהה |
| הינשוף (`nagmon_owl`) | נוצות חומות ‎#A95F3D ו־‎#8F4C31, חזה שזוף ‎#E1AE70, בטן שמנת ‎#F8E3BE, מקור ורגליים כתומים. בקרב: משקפיים עגולים וספר זהוב |
| הרב שלמה (קרב: `nagmon_shopkeeper`) | מעיל ארוך בצבע חאקי־חום ‎#9A8158 ו־‎#987A55, כיפה באותו צבע, זקן ושיער חום כהה ‎#4F382A ו־‎#3A2214, עור ‎#E4AA83, צווארון חולצה לבן, מכנסיים ונעליים חומים כהים |
| האישה בברדס האפור (קרב: `nagmon_teacher`) | ברדס אפור־מרווה ‎#8D8E71 שמכסה את השיער והצוואר, עור ‎#D0AD84 ו־‎#C59672, חולצה בז' עם שרוול ארוך, חצאית ארוכה חומה־זית ‎#5E5342, כרטיסי תמונות צבעוניים בידיים |

### 1.2 שורת הסגנון (מעתיקים לכל הנחיה)

כל הנחיה למטה כבר כוללת את שורת הסגנון. היא כתובה כאן פעם אחת כדי שיהיה קל לבדוק שהיא לא השתנתה:

```text
STYLE: cute chibi pixel art for a cozy top-down adventure game for children; clean crisp pixel edges;
a thin near-black warm outline (#1A0E0A) around the whole figure and its main shapes; bright saturated
warm colours; 2-3 tone cel shading per surface with one small highlight; soft light from the upper
front-left, shadow under the chin and on the lower right; big round friendly eyes with one white
highlight; gentle smile; no dithering noise, no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF everywhere around the figures, no gradient,
no floor, no cast shadow, no frame, no grid lines, no labels.
```

### 1.3 הבד ותאים לכל סוג גיליון

הגדלים האלה הם מה ש־`tools/art/import_art.py` ו־`tools/art/manifest.yaml` מצפים לו. המקור יכול להיות גדול יותר, בתנאי שהפריסה נכונה: ה־importer חותך לפי רשת שווה ומקטין.

| סוג | מה מעלים (מקור) | חיתוך | הקובץ במשחק (HD) | הגודל הטבעי |
|---|---|---|---|---|
| **גיליון מפה** | PNG לאורך, 1024×1536. רשת 3 עמודות × 4 שורות, תא של כ־341×384 | `layout: map`, `grid: [3, 4]`, ‏`k: 8`, ‏`fill: 0.6875` (ינשוף 0.625) | 384×1024, פריים 128×256 | 48×128, פריים 16×32 |
| **קרב (דמות)** | PNG לרוחב, 1536×768 (או 1536×1024). שני חצאים: **מאחור משמאל, מלפנים מימין** | `layout: combat`, ‏`grid: [2, 1]`, ‏`k: 3` | 384×192: שני תאים של 192×192 | 128×64 |
| **חיה** | שלושה PNG ריבועיים 1024×1024: ‏`front.png`, ‏`back.png`, ‏`icon.png` (ADD_MONSTER §2: לפחות 192 ו־72) | ה־importer של תיבת הדואר (ADD_MONSTER §5) | 384×264: מלפנים ומאחור 192×192, אייקונים 72×72 | 128×88 |
| **אריחים** | PNG ריבועי 1024×1024: רשת 4×4 של תאים 256×256. כל תא הוא אריח אחד של 16 פיקסלים, פי 16 | חיתוך לרשת שווה, הקטנה ל־64 (פי 4) ול־16 (§4.0) | גיליון HD באריח של 64×64 (‏k=4, `tools/app/maps.py`: `HD_SCALE = 4`) | אריח 16×16 |
| **חפץ גדול במפה** (החללית) | PNG ריבועי 768×768: החפץ לבד, על מג'נטה | כמו אריחים: 3×3 אריחים | 192×192 | 48×48 |

**כללים לכל הגיליונות** (SDD_ART §5, וגם הפגמים שמצאנו במשלוחים הקודמים):

- רקע מג'נטה שטוח ‎#FF00FF, PNG (לא JPG).
- לפחות 40 פיקסלים של מג'נטה בין דמות לדמות, ובין דמות לשוליים.
- בלי תוויות, בלי מסגרות, בלי קווי רשת, בלי ניצוצות שיוצאים מהתא.
- כל הפריימים של דמות באותו קנה מידה, והרגליים על אותו קו בתחתית התא.
- שורה 2 פונה **שמאלה** ושורה 3 **ימינה**, בכל שלושת הפריימים. במשלוחים הקודמים הפריים השלישי בשורות 2 ו־3 פנה לא פעם לצד ההפוך (manifest: `take: {r2c3: r3c3, r3c3: r2c3}`). את זה אפשר לתקן אצלנו, אבל עדיף שיגיע נכון.
- בשני צעדי ההליכה (עמודות 1 ו־3) רגל אחרת קדימה. במשלוח השלישי הצעדים יצאו כמעט זהים (validation_report.md).

---

## 2. שיטת העקביות

הבעיה שראינו: מילה בקרב גבוהה ורזה יותר מאשר במפה, והעיטור משתנה בין פריימים (validation_report.md, ‏Job 11–12). השיטה:

1. **קודם גיליון המפה.** הוא קובע את הזהות: צבעים, תלבושת, אביזרים, באיזו יד.
   - כשיש בסיס קיים (מילה, הינשוף), מעלים את גיליון המפה הקיים כתמונת ייחוס ומבקשים "same character, same face, hair and colours, new outfit".
2. **אחר כך הקרב, עם גיליון המפה כתמונת ייחוס.** בכל הנחיית קרב יש את המשפט: `Same character, same outfit and colours as the reference image.`
   - הקרב הוא הדמות **הגבוהה יותר** (2.6 עד 3 ראשים), אבל הצבעים, הבגדים והאביזרים זהים.
3. **חיות:** קודם `front.png`. אחר כך `back.png` ו־`icon.png` עם `front.png` כתמונת ייחוס. בהתפתחות: ה־`front.png` של השלב הקודם הוא הייחוס ("same creature family, bigger and more detailed, same colours").
4. **הרב שלמה והאישה בברדס:** הפוך. הקרב כבר קיים ואושר, ולכן **הוא** הייחוס, ומבקשים רק גיליון מפה.
5. **אריחים:** כל הגיליונות של אותו אזור עם אותה פלטה. אחרי הגיליון הראשון של אזור, מעלים אותו כייחוס לבא.

### 2.1 רשימת בדיקה לפני העלאה (מפה מול קרב)

שמים את שתי התמונות זו ליד זו ועוברים על הרשימה:

- [ ] **עור, שיער, עיניים:** אותו גוון, אותה תסרוקת, אותו צבע עיניים.
- [ ] **תלבושת:** אותם צבעים בדיוק, אותו עיטור (נקודות, פסים), אותו מספר כפתורים.
- [ ] **אורך:** שרוול עד פרק היד בשתיהן. חצאית או חליפה עד הקרסול בשתיהן.
- [ ] **אביזרים:** אותם אביזרים, **באותה יד** (גיר, כלי, טאבלט). קסדה: באותה צורה ובאותו צבע מסגרת.
- [ ] **כיפה או כיסוי ראש:** קיים בשתיהן, באותו צבע.
- [ ] **מבנה:** מפה כ־2.2 ראשים, קרב 2.6 עד 3. הדמות לא נראית כמו מישהי אחרת.
- [ ] **מפה:** 12 פריימים, 3×4. שורה 1 מלפנים, 2 שמאלה, 3 ימינה, 4 מאחור. כל פריים בשורה 2 פונה שמאלה, וכל פריים בשורה 3 ימינה.
- [ ] **קרב:** מאחור **משמאל**, מלפנים **מימין**. שום חלק לא חוצה את האמצע.
- [ ] **רקע:** מג'נטה אחיד. אין צל, רצפה, מסגרת, תווית או טקסט.
- [ ] **סמלים:** אין "+" ואין צלב בשום מקום (עיטור, כפתורים, ניצוצות).

---

## 3. הפריטים

21 פריטים: 7 דמויות, 9 חיות, 5 גיליונות של אריחים וחפצים.

### 3.1 דמויות

**שלד ההנחיה למפה** (כבר מוטמע בכל פריט למטה):

```text
Pixel-art character walking sprite sheet, exactly 12 frames in a grid of 3 columns x 4 rows,
portrait canvas 1024x1536, one figure centred in each equal cell (about 341x384), same scale and
same foot line at the bottom of every cell, at least 40 px of empty magenta between figures.
Row 1: facing the viewer. Row 2: walking to the viewer's LEFT (side view, nose points left) in all
three frames. Row 3: walking to the viewer's RIGHT in all three frames. Row 4: back view, facing away.
Column 1: left foot forward. Column 2: standing still. Column 3: right foot forward.
Proportions: super-chibi, about 2.2 heads tall (head with hair is 45% of the height).
```

**שלד ההנחיה לקרב:**

```text
Same character, same outfit and colours as the reference image. Two full-body views side by side,
landscape canvas 1536x768, each figure centred in its own half, feet near the bottom, same scale,
nothing crosses the middle line, at least 40 px of magenta around each figure.
LEFT half: back view, three-quarters from behind, looking slightly to the right.
RIGHT half: front view, three-quarters facing the viewer, friendly welcoming pose.
Proportions: taller chibi, about 2.8 heads tall (adult) / 2.5 heads tall (child).
```

---

#### 3.1.1 מילה בחליפת חלל

- **מטרה:** המורה מובילה את הטיול. היא מופיעה ביציאה מהאקדמיה, בחללית ובכל אזור.
- **הבסיס:** `nagmon_mila` (מפה וקרב). שומרים את הפנים, העור החום הכהה, הפקעת המתולתלת הגבוהה, העגילים הקטנים, הגיר ביד ימין, והכתום והשמנת שלה.
- **מה משתנה:** חליפת חלל ארוכה במקום השמלה, וקסדת בועה שקופה. **העיטור:** בשמלה של היום יש סימנים קטנים שדומים ל־"+". בחליפה הם מתחלפים בנקודות עגולות ובכוכבי לכת קטנים עם טבעת.
- **קבצים:** `art_inbox/nagmon_mila_space/map.png`, ‏`art_inbox/nagmon_mila_space/battle.png`
- **גודל ופריסה:** מפה 1024×1536 (3×4), קרב 1536×768 (מאחור משמאל, מלפנים מימין). במשחק: `mods/nagmon/sprites/nagmon_mila_space.png` (384×1024) ו־`mods/nagmon/gfx/sprites/player/nagmon_mila_space.png` (384×192).
- **תמונת ייחוס:** למפה: `art_sources/batch3/map/mila_map.png`. לקרב: ה־`map.png` החדש.

**מפה:**

```text
Reference image: the existing map sprite sheet of this teacher. Same character, same face, same deep
brown skin, same high curly black bun, same small gold earrings, same orange and cream colours,
NEW OUTFIT: a long, modest, loose space suit.

Pixel-art character walking sprite sheet, exactly 12 frames in a grid of 3 columns x 4 rows,
portrait canvas 1024x1536, one figure centred in each equal cell (about 341x384), same scale and
same foot line at the bottom of every cell, at least 40 px of empty magenta between figures.
Row 1: facing the viewer. Row 2: walking to the viewer's LEFT (side view, nose points left) in all
three frames. Row 3: walking to the viewer's RIGHT in all three frames. Row 4: back view, facing away.
Column 1: left foot forward. Column 2: standing still. Column 3: right foot forward.
Proportions: super-chibi, about 2.2 heads tall (head with hair is 45% of the height).

Character: a warm, cheerful adult woman teacher with deep brown skin and a high bun of tight black
curls. She wears a loose, ankle-length space suit in bright orange (#F77D03) with darker orange
shading (#E06403): a padded long-sleeved top with cream (#FCF6B9) cuffs at the wrists, and over the
legs a wide A-line skirt panel of the same suit fabric that falls to the ankles; small cream space
boots. A soft cream collar ring at the neck holds a round, clear glass bubble helmet that encloses
her whole head and bun, with one small white curved shine on its upper left. Trim along the hem and
cuffs: a row of small round cream dots and tiny ringed planets in gold (#F6C264). She holds a small
white chalk stick in her right hand, as before. The suit is loose, never tight.

STYLE: cute chibi pixel art for a cozy top-down adventure game for children; clean crisp pixel edges;
a thin near-black warm outline (#1A0E0A) around the whole figure and its main shapes; bright saturated
warm colours; 2-3 tone cel shading per surface with one small highlight; soft light from the upper
front-left, shadow under the chin and on the lower right; big round friendly eyes with one white
highlight; gentle smile; no dithering noise, no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF everywhere around the figures, no gradient,
no floor, no cast shadow, no frame, no grid lines, no labels.
```

**קרב:**

```text
Same character, same outfit and colours as the reference image (the map sprite sheet of the teacher
in her orange space suit). Two full-body views side by side, landscape canvas 1536x768, each figure
centred in its own half, feet near the bottom, same scale, nothing crosses the middle line, at least
40 px of magenta around each figure.
LEFT half: back view, three-quarters from behind, looking slightly to the right.
RIGHT half: front view, three-quarters facing the viewer, raising the chalk in her right hand like a
teacher about to explain, warm smile.
Proportions: taller chibi, about 2.8 heads tall; not slim, the same soft rounded shapes as the map.

Character: adult woman teacher, deep brown skin, high bun of tight black curls inside a round clear
glass bubble helmet with one small white shine on the upper left, small gold earrings. Loose,
ankle-length bright orange (#F77D03) space suit, long sleeves with cream (#FCF6B9) cuffs, a wide
A-line skirt panel to the ankles, small cream space boots, soft cream collar ring. Trim: small round
cream dots and tiny gold ringed planets along hem and cuffs.

STYLE: cute chibi pixel art for a cozy adventure game for children; clean crisp pixel edges; a thin
near-black warm outline (#1A0E0A); bright saturated warm colours; 2-3 tone cel shading with one small
highlight; soft light from the upper front-left; big round friendly eyes with one white highlight;
no dithering noise, no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
```

**להימנע:**

```text
plus signs, crosses, four-point sparkles, short skirt, bare arms, short sleeves, tight suit,
form-fitting suit, visor that hides the face, different hairstyle, lighter skin, text, logo,
patches with letters, flag, extra characters, floor, shadow, checkerboard background
```

**בדיקות קבלה:**

- הפנים, העור, הפקעת והעגילים כמו ב־`nagmon_mila` היום.
- החליפה רחבה ועד הקרסול, השרוולים עד פרק היד. הקסדה שקופה והפנים נראות.
- אין "+" בעיטור. הגיר ביד ימין בכל הפריימים שבהם רואים את היד.
- רשימת הבדיקה של §2.1 עוברת.

---

#### 3.1.2 הינשוף בקסדת חלל

- **מטרה:** הינשוף החכם מלווה את הטיול: מסביר ונותן רמזים. בדיאלוג רואים את צד הקדמי של הקרב.
- **הבסיס:** `nagmon_owl` (ההורה אישר). שומרים את הנוצות החומות, החזה השזוף, הבטן בצבע שמנת עם סימני הנוצות בצורת לב, העיניים הענבריות הגדולות, המקור והרגליים הכתומים, ואת הגוף העגול.
  - **משקפיים:** בקרב של היום יש לינשוף משקפיים עגולים וספר זהוב, ובמפה אין. נשארים נאמנים לבסיס: במפה בלי משקפיים, בקרב עם.
- **מה משתנה:** קסדת בועה קטנה ושקופה, וטבעת צווארון כתומה רכה (הצבע של מילה), כדי שיראו שהם צוות.
- **קבצים:** `art_inbox/nagmon_owl_space/map.png`, ‏`art_inbox/nagmon_owl_space/battle.png`
- **גודל ופריסה:** מפה 1024×1536 (3×4, ‏`fill: 0.625`), קרב 1536×768. במשחק: `mods/nagmon/sprites/nagmon_owl_space.png` ו־`mods/nagmon/gfx/sprites/player/nagmon_owl_space.png`.
- **תמונת ייחוס:** למפה: `art_sources/owl_map.png`. לקרב: ה־`map.png` החדש **וגם** `mods/nagmon/gfx/sprites/player/nagmon_owl.png` (בשביל המשקפיים והספר).
- **מבט מאחור אמיתי:** בקרב של היום הדיוקן השני עומד במקום גב. הפעם מבקשים גב אמיתי.

**מפה:**

```text
Reference image: the existing map sprite sheet of this owl. Same owl, same feathers and colours,
only add a space helmet.

Pixel-art character walking sprite sheet, exactly 12 frames in a grid of 3 columns x 4 rows,
portrait canvas 1024x1536, one figure centred in each equal cell (about 341x384), same scale and
same foot line at the bottom of every cell, at least 40 px of empty magenta between figures.
Row 1: facing the viewer. Row 2: hopping-walking to the viewer's LEFT (side view, beak points left)
in all three frames. Row 3: to the viewer's RIGHT in all three frames. Row 4: back view, facing away.
Column 1: left foot forward. Column 2: standing still. Column 3: right foot forward.

Character: a small, round, wise and friendly owl with brown feathers (#A95F3D, darker #8F4C31),
a tan chest (#E1AE70), a cream belly (#F8E3BE) with little heart-shaped feather marks, large round
amber eyes, a small orange beak, orange feet, short ear tufts, wings folded at its sides. It wears a
round clear glass bubble helmet over its whole head, ear tufts inside the bubble, one small white
curved shine on the upper left of the glass, and a soft padded orange (#F77D03) collar ring where the
helmet meets the body. No glasses on the map sheet. Back view: plain brown back feathers, the back of
the bubble and the orange collar.

STYLE: cute chibi pixel art for a cozy top-down adventure game for children; clean crisp pixel edges;
a thin near-black warm outline (#1A0E0A) around the whole figure and its main shapes; bright saturated
warm colours; 2-3 tone cel shading per surface with one small highlight; soft light from the upper
front-left; big round friendly eyes with one white highlight; no dithering noise, no blur, no
painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF everywhere around the figures, no gradient,
no floor, no cast shadow, no frame, no grid lines, no labels.
```

**קרב:**

```text
Same owl, same feathers, helmet and colours as the first reference image (the map sheet), with the
round glasses and the glowing golden book of the second reference image. Two views side by side,
landscape canvas 1536x768, each figure centred in its own half, bottom near the bottom edge, same
scale, nothing crosses the middle line, at least 40 px of magenta around each figure.
LEFT half: true back view, three-quarters from behind: brown back feathers, folded wings, the back of
the clear bubble helmet and the orange collar ring.
RIGHT half: front view, three-quarters facing the viewer: round thin glasses over the large amber eyes,
holding an open glowing golden book in both wings, small round golden light dots floating above the
book, a kind, wise smile.
Proportions: chubby round owl, head and body almost one shape, as in the references.

STYLE: cute chibi pixel art for a cozy adventure game for children; clean crisp pixel edges; a thin
near-black warm outline (#1A0E0A); bright saturated warm colours; 2-3 tone cel shading with one small
highlight; soft light from the upper front-left; no dithering noise, no blur, no painterly texture,
no text, no letters in the book.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
```

**להימנע:**

```text
four-point sparkles, plus-shaped glints, crosses, scary eyes, sharp talons, angry brows, letters in
the book, visor that hides the face, astronaut suit covering the feathers, different feather colours,
text, logo, floor, shadow, checkerboard background
```

**בדיקות קבלה:**

- זה הינשוף של היום: אותם צבעים, אותו גוף, אותן עיניים. רק קסדה וצווארון נוספו.
- במפה בלי משקפיים, בקרב עם משקפיים וספר (כמו היום).
- בגב: גב אמיתי, לא פנים.
- נקודות האור מעל הספר עגולות, לא בצורת "+".

---

#### 3.1.3 האסטרונומית: המאסטרית של הטיול

- **מטרה:** בסוף הטיול, בתחנת החלל: מבחן עם שאלות, ומי שמנצח מקבל תג. דמות חדשה, חמה וחכמה, לא מפחידה.
- **מראה:** אישה בוגרת, עור זית בהיר. מטפחת סגולה כהה עם נקודות כסף קטנות שמכסה את השיער (כיסוי ראש של אישה נשואה). מעיל תחנה ארוך עד הקרסול בכחול לילה, עם שרוולים ארוכים ועיטור כסף. בידה טלסקופ קטן מפליז.
- **קבצים:** `art_inbox/nagmon_astronomer/map.png`, ‏`art_inbox/nagmon_astronomer/battle.png`
- **גודל ופריסה:** מפה 1024×1536 (3×4), קרב 1536×768. במשחק: `mods/nagmon/sprites/nagmon_astronomer.png` ו־`.../player/nagmon_astronomer.png`.
- **שם:** "האסטרונומית" בינתיים. את השם הפרטי בוחר ההורה.

**מפה:**

```text
Pixel-art character walking sprite sheet, exactly 12 frames in a grid of 3 columns x 4 rows,
portrait canvas 1024x1536, one figure centred in each equal cell (about 341x384), same scale and
same foot line at the bottom of every cell, at least 40 px of empty magenta between figures.
Row 1: facing the viewer. Row 2: walking to the viewer's LEFT (side view, nose points left) in all
three frames. Row 3: walking to the viewer's RIGHT in all three frames. Row 4: back view, facing away.
Column 1: left foot forward. Column 2: standing still. Column 3: right foot forward.
Proportions: super-chibi, about 2.2 heads tall (head with headscarf is 45% of the height).

Character: a kind, wise adult woman astronomer who works on a space station. Light olive skin, warm
brown eyes, a calm proud smile. Her hair is fully covered by a soft headscarf tied at the back of the
neck, deep violet (#5B3A8C) with tiny round silver dots. She wears a loose, ankle-length station coat
in midnight blue (#24346E, shading #1A2550) with long sleeves to the wrists, silver-grey (#C8CEDA)
cuffs and a silver trim along the hem made of small circles and little orbit lines. Underneath, a
long dark-blue skirt reaching the ankles; small grey shoes. She holds a small brass telescope
(#D9A441) in her right hand. Back view: the knot of the headscarf, the long coat, the telescope tip.

STYLE: cute chibi pixel art for a cozy top-down adventure game for children; clean crisp pixel edges;
a thin near-black warm outline (#1A0E0A) around the whole figure and its main shapes; bright saturated
colours; 2-3 tone cel shading per surface with one small highlight; soft light from the upper
front-left, shadow under the chin and on the lower right; big round friendly eyes with one white
highlight; gentle smile; no dithering noise, no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF everywhere around the figures, no gradient,
no floor, no cast shadow, no frame, no grid lines, no labels.
```

**קרב:**

```text
Same character, same outfit and colours as the reference image (the map sheet of the astronomer).
Two full-body views side by side, landscape canvas 1536x768, each figure centred in its own half,
feet near the bottom, same scale, nothing crosses the middle line, at least 40 px of magenta around
each figure.
LEFT half: back view, three-quarters from behind, looking slightly to the right: the violet headscarf
knot, the long midnight-blue coat, the brass telescope.
RIGHT half: front view, three-quarters facing the viewer: she holds the brass telescope in her right
hand and points gently upward with her left hand, as if inviting the viewer to look at the sky;
proud, encouraging smile.
Proportions: taller chibi, about 2.8 heads tall.

Character: adult woman astronomer, light olive skin, hair fully covered by a deep violet (#5B3A8C)
headscarf with tiny round silver dots; loose ankle-length midnight-blue (#24346E) coat, long sleeves
with silver-grey (#C8CEDA) cuffs, silver hem trim of small circles and orbit lines, long dark-blue
skirt to the ankles, small grey shoes, brass (#D9A441) telescope.

STYLE: cute chibi pixel art for a cozy adventure game for children; clean crisp pixel edges; a thin
near-black warm outline (#1A0E0A); bright saturated colours; 2-3 tone cel shading with one small
highlight; soft light from the upper front-left; big round friendly eyes with one white highlight;
no dithering noise, no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
```

**להימנע:**

```text
crosses, plus signs, star-and-crescent, wizard hat, magic wand, stern or angry face, uniform with
badges or letters, short sleeves, short skirt, tight clothes, hair showing from under the scarf,
text, logo, flag, floor, shadow, checkerboard background
```

**בדיקות קבלה:**

- נראית שונה ממילה (צבעים, עור, מטפחת) ומהאישה בברדס האפור (סגול וכחול, לא אפור).
- השיער מכוסה. מעיל וחצאית עד הקרסול, שרוול עד פרק היד.
- הטלסקופ ביד ימין בשתי התמונות.
- רשימת הבדיקה של §2.1 עוברת.

---

#### 3.1.4 המהנדסת של בסיס הירח (אזור 1)

- **מטרה:** דמות באזור הירח. מספרת על כוח משיכה חלש ועל המכתשים, ושואלת שאלה אחת.
- **מראה:** אישה צעירה, עור חום בינוני. חליפת עבודה ארוכה ורחבה בטורקיז ולבן, עם ברדס רך של החליפה שמכסה את השיער. חגורת כלים, ומפתח ברגים גדול וידידותי ביד.
- **קבצים:** `art_inbox/nagmon_moon_engineer/map.png`, ‏`art_inbox/nagmon_moon_engineer/battle.png`
- **גודל ופריסה:** מפה 1024×1536 (3×4), קרב 1536×768.

**מפה:**

```text
Pixel-art character walking sprite sheet, exactly 12 frames in a grid of 3 columns x 4 rows,
portrait canvas 1024x1536, one figure centred in each equal cell (about 341x384), same scale and
same foot line at the bottom of every cell, at least 40 px of empty magenta between figures.
Row 1: facing the viewer. Row 2: walking to the viewer's LEFT (side view, nose points left) in all
three frames. Row 3: walking to the viewer's RIGHT in all three frames. Row 4: back view, facing away.
Column 1: left foot forward. Column 2: standing still. Column 3: right foot forward.
Proportions: super-chibi, about 2.2 heads tall (head with hood is 45% of the height).

Character: a cheerful young woman engineer at a base on the Moon. Medium brown skin, dark brown eyes,
a friendly grin. Her hair is fully covered by the soft rounded hood of her work suit, white with a
turquoise rim. She wears a loose, ankle-length work suit in turquoise (#2BB3B1, shading #1C8A8C) and
white (#F2F5F7): a padded long-sleeved top with white cuffs, and a wide long skirt panel of the same
fabric to the ankles over padded white boots. A brown tool belt (#8A5A34) with round pockets. She
carries a big friendly yellow (#F2C230) wrench in her right hand. Back view: the hood, a small round
white air pack on her back with one green light.

STYLE: cute chibi pixel art for a cozy top-down adventure game for children; clean crisp pixel edges;
a thin near-black warm outline (#1A0E0A) around the whole figure and its main shapes; bright saturated
colours; 2-3 tone cel shading per surface with one small highlight; soft light from the upper
front-left, shadow under the chin and on the lower right; big round friendly eyes with one white
highlight; gentle smile; no dithering noise, no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF everywhere around the figures, no gradient,
no floor, no cast shadow, no frame, no grid lines, no labels.
```

**קרב:**

```text
Same character, same outfit and colours as the reference image (the map sheet of the Moon-base
engineer). Two full-body views side by side, landscape canvas 1536x768, each figure centred in its own
half, feet near the bottom, same scale, nothing crosses the middle line, at least 40 px of magenta
around each figure.
LEFT half: back view, three-quarters from behind, looking slightly to the right: hood, round white
air pack with one green light, tool belt, yellow wrench in her right hand.
RIGHT half: front view, three-quarters facing the viewer: resting the big yellow wrench on her
shoulder with her right hand, giving a cheerful wave with her left hand.
Proportions: taller chibi, about 2.8 heads tall.

Character: young woman engineer, medium brown skin, hair fully covered by the soft white hood with a
turquoise rim; loose ankle-length turquoise (#2BB3B1) and white work suit, long sleeves with white
cuffs, long skirt panel to the ankles, padded white boots, brown tool belt with round pockets,
yellow (#F2C230) wrench.

STYLE: cute chibi pixel art for a cozy adventure game for children; clean crisp pixel edges; a thin
near-black warm outline (#1A0E0A); bright saturated colours; 2-3 tone cel shading with one small
highlight; soft light from the upper front-left; big round friendly eyes with one white highlight;
no dithering noise, no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
```

**להימנע:**

```text
plus-shaped screws, crosses, red cross, weapon, hammer raised to hit, tight suit, short sleeves,
trousers without the long skirt panel, hair showing, helmet visor hiding the face, letters or
numbers on the suit, logo, floor, shadow, checkerboard background
```

**בדיקות קבלה:**

- הברדס מכסה את השיער. החליפה רחבה, עם חצאית עד הקרסול. שרוול עד פרק היד.
- המפתח ביד ימין, נראה ככלי ולא מאיים.
- רשימת הבדיקה של §2.1 עוברת.

---

#### 3.1.5 נהג הרכב במאדים (אזור 3)

- **מטרה:** דמות באזור כוכבי הלכת הסלעיים. מספר למה מאדים אדום, ושואל שאלה אחת.
- **מראה:** גבר צעיר, עור בהיר עם נמשים, שיער ג'ינג'י קצר, כיפה סרוגה קטנה בכחול כהה עם שוליים כתומים. סרבל נהיגה רחב בצבע חלודה וחול, שרוולים ארוכים, וקסדת בועה שקופה שרואים דרכה את הכיפה. בידו טאבלט עגול עם מפה.
- **קבצים:** `art_inbox/nagmon_rover_driver/map.png`, ‏`art_inbox/nagmon_rover_driver/battle.png`
- **גודל ופריסה:** מפה 1024×1536 (3×4), קרב 1536×768.

**מפה:**

```text
Pixel-art character walking sprite sheet, exactly 12 frames in a grid of 3 columns x 4 rows,
portrait canvas 1024x1536, one figure centred in each equal cell (about 341x384), same scale and
same foot line at the bottom of every cell, at least 40 px of empty magenta between figures.
Row 1: facing the viewer. Row 2: walking to the viewer's LEFT (side view, nose points left) in all
three frames. Row 3: walking to the viewer's RIGHT in all three frames. Row 4: back view, facing away.
Column 1: left foot forward. Column 2: standing still. Column 3: right foot forward.
Proportions: super-chibi, about 2.2 heads tall (head is 45% of the height).

Character: a friendly young man who drives a rover on Mars. Fair skin with light freckles, short
copper-red hair, green eyes, a big smile. On the crown of his head a small round knitted kippah in
navy blue (#22346A) with a thin orange edge. He wears a round clear glass bubble helmet over his head
(the kippah and hair are visible through it, one small white shine on the upper left) and a loose
long-sleeved driver's coverall in rust orange (#C2562B, shading #8E3A1E) and sand beige (#E8C99A),
with sand-beige knee pads, chunky brown boots (#5A3A24) and a padded sand collar ring. He holds a small
round tablet with a red-and-orange map in his left hand. Back view: the kippah through the helmet,
a small square air pack with rounded corners and one green light.

STYLE: cute chibi pixel art for a cozy top-down adventure game for children; clean crisp pixel edges;
a thin near-black warm outline (#1A0E0A) around the whole figure and its main shapes; bright saturated
warm colours; 2-3 tone cel shading per surface with one small highlight; soft light from the upper
front-left, shadow under the chin and on the lower right; big round friendly eyes with one white
highlight; gentle smile; no dithering noise, no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF everywhere around the figures, no gradient,
no floor, no cast shadow, no frame, no grid lines, no labels.
```

**קרב:**

```text
Same character, same outfit and colours as the reference image (the map sheet of the Mars rover
driver). Two full-body views side by side, landscape canvas 1536x768, each figure centred in its own
half, feet near the bottom, same scale, nothing crosses the middle line, at least 40 px of magenta
around each figure.
LEFT half: back view, three-quarters from behind, looking slightly to the right: the navy kippah seen
through the clear bubble helmet, the rounded air pack, the rust-orange coverall.
RIGHT half: front view, three-quarters facing the viewer: holding the round map tablet in his left
hand, giving a thumbs-up with his right hand, big friendly smile.
Proportions: taller chibi, about 2.8 heads tall.

Character: young man, fair freckled skin, short copper-red hair, small navy (#22346A) knitted kippah
with a thin orange edge, clear bubble helmet, loose long-sleeved rust-orange (#C2562B) and sand-beige
(#E8C99A) coverall, sand knee pads, chunky brown boots, round map tablet.

STYLE: cute chibi pixel art for a cozy adventure game for children; clean crisp pixel edges; a thin
near-black warm outline (#1A0E0A); bright saturated warm colours; 2-3 tone cel shading with one small
highlight; soft light from the upper front-left; big round friendly eyes with one white highlight;
no dithering noise, no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
```

**להימנע:**

```text
crosses, plus signs, flags, mission patches, letters or numbers, tight suit, short sleeves, shorts,
missing kippah, large hat instead of kippah, visor hiding the face, scary expression, floor, shadow,
checkerboard background
```

**בדיקות קבלה:**

- הכיפה הקטנה נראית בכל הפריימים מלפנים, מהצד ומאחור.
- סרבל רחב, שרוולים ארוכים. אין טלאי עם אותיות.
- הטאבלט ביד שמאל בשתי התמונות.
- רשימת הבדיקה של §2.1 עוברת.

---

#### 3.1.6 הרב שלמה (גיליון מפה בלבד)

- **מטרה:** ההורה ביקש שהדמות של גיליון הקרב `nagmon_shopkeeper` תהיה דמות משלה: הרב שלמה. **הקרב כבר קיים**, וחסר גיליון מפה שמתאים לו.
  - גיליון המפה הקיים `nagmon_shopkeeper` (סינר, זקן מתולתל, כיפה כחולה) הוא דמות אחרת, ונשאר למוכר.
- **תמונת ייחוס:** `mods/nagmon/gfx/sprites/player/nagmon_shopkeeper.png` (רק הדמות, בלי הקופה), או המקור `art_sources/teachers.jpg` (הגיליון העליון, "Battle sheet").
- **מראה, כמו בקרב:** גבר מבוגר וחייכן, עור בהיר־אפרסק, זקן מלא ושיער קצר בחום כהה, כיפה עגולה בצבע של המעיל. מעיל ארוך עד הברך בחאקי־חום עם כפתורים, צווארון לבן של חולצה, מכנסיים ונעליים חומים כהים.
- **קבצים:** `art_inbox/nagmon_rav_shlomo/map.png`
- **גודל ופריסה:** 1024×1536 (3×4). במשחק: `mods/nagmon/sprites/nagmon_rav_shlomo.png`. הקרב: העתק של הקובץ הקיים בשם `nagmon_rav_shlomo.png`.

```text
Reference image: the battle portrait of this man (ignore the cash register). Same man, same face,
beard, kippah, coat and colours; make his top-down walking sprite sheet.

Pixel-art character walking sprite sheet, exactly 12 frames in a grid of 3 columns x 4 rows,
portrait canvas 1024x1536, one figure centred in each equal cell (about 341x384), same scale and
same foot line at the bottom of every cell, at least 40 px of empty magenta between figures.
Row 1: facing the viewer. Row 2: walking to the viewer's LEFT (side view, nose points left) in all
three frames. Row 3: walking to the viewer's RIGHT in all three frames. Row 4: back view, facing away.
Column 1: left foot forward. Column 2: standing still. Column 3: right foot forward.
Proportions: super-chibi, about 2.3 heads tall (head with beard is 43% of the height).

Character: a warm, smiling grown man, a respected teacher of the community. Light peach skin (#E4AA83),
a full rounded dark brown beard (#4F382A) and short dark brown hair, kind eyes that crinkle when he
smiles. A small round kippah on the crown of his head in the same khaki-brown as his coat. A long,
loose, knee-length coat in khaki-brown (#9A8158, shading #7E6950) buttoned down the front, a white
shirt collar showing at the neck, long sleeves to the wrists, dark brown trousers (#4F382A) and dark
brown shoes (#3A2214). Hands empty, relaxed. Back view: the kippah on the back of the head, short
dark hair, the plain long coat.

STYLE: cute chibi pixel art for a cozy top-down adventure game for children; clean crisp pixel edges;
a thin near-black warm outline (#1A0E0A) around the whole figure and its main shapes; warm earthy
colours; 2-3 tone cel shading per surface with one small highlight; soft light from the upper
front-left, shadow under the chin and on the lower right; gentle smile; no dithering noise, no blur,
no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF everywhere around the figures, no gradient,
no floor, no cast shadow, no frame, no grid lines, no labels.
```

**להימנע:**

```text
cash register, counter, apron, curly beard, blue kippah, hat, crosses, plus signs, clerical collar,
robes of other religions, text, letters, logo, floor, shadow, checkerboard background
```

**בדיקות קבלה:**

- שמים את הפריים מלפנים (שורה 1, אמצע) ליד הקרב: אותו זקן, אותו צבע מעיל וכיפה.
- אין סינר ואין קופה. הכיפה בצבע המעיל, לא כחולה.
- 12 פריימים, כיוונים נכונים.

---

#### 3.1.7 האישה בברדס האפור (גיליון מפה בלבד)

- **מטרה:** הדמות של גיליון הקרב `nagmon_teacher` מקבלת גיליון מפה משלה. היום הגננת מיכל משתמשת בגיליון מפה של דמות אחרת (חצאית סגולה, פקעת), שלא מתאים לקרב.
- **תמונת ייחוס:** `mods/nagmon/gfx/sprites/player/nagmon_teacher.png`, או המקור `art_sources/teachers.jpg` (הגיליון התחתון).
- **מראה, כמו בקרב:** אישה צעירה, עור בהיר, פנים רגועות וחייכניות. ברדס רך אפור־מרווה שמכסה את כל השיער והצוואר ומקיף את הפנים. חולצה בז' עם שרוול ארוך, חצאית ארוכה עד הקרסול בחום־זית. כרטיסי תמונות צבעוניים ביד.
- **קבצים:** `art_inbox/nagmon_grey_hood/map.png`
- **גודל ופריסה:** 1024×1536 (3×4). במשחק: `mods/nagmon/sprites/nagmon_grey_hood.png`.
- **שם:** מי היא ומה שמה: החלטה של ההורה. ה־slug זמני.

```text
Reference image: the battle portrait of this woman. Same woman, same face, same grey hood, same
clothes and colours; make her top-down walking sprite sheet.

Pixel-art character walking sprite sheet, exactly 12 frames in a grid of 3 columns x 4 rows,
portrait canvas 1024x1536, one figure centred in each equal cell (about 341x384), same scale and
same foot line at the bottom of every cell, at least 40 px of empty magenta between figures.
Row 1: facing the viewer. Row 2: walking to the viewer's LEFT (side view, nose points left) in all
three frames. Row 3: walking to the viewer's RIGHT in all three frames. Row 4: back view, facing away.
Column 1: left foot forward. Column 2: standing still. Column 3: right foot forward.
Proportions: super-chibi, about 2.2 heads tall (head with hood is 45% of the height).

Character: a calm, kind young woman teacher. Fair skin (#D0AD84, shading #C59672), soft brown eyes,
a gentle smile, a little brown hair at the forehead. A soft sage-grey hood (#8D8E71, shading #69614F)
covers all her hair and her neck and frames her face. A loose beige long-sleeved top (#CDB08A) to the
wrists, and a loose ankle-length skirt in olive brown (#5E5342, shading #443025); small dark shoes.
In her right hand she holds a small fan of three colourful picture cards (red, green, blue). Back
view: the rounded grey hood down to the shoulders, the beige top, the long skirt.

STYLE: cute chibi pixel art for a cozy top-down adventure game for children; clean crisp pixel edges;
a thin near-black warm outline (#1A0E0A) around the whole figure and its main shapes; soft earthy
colours with the bright cards as accents; 2-3 tone cel shading per surface with one small highlight;
soft light from the upper front-left, shadow under the chin and on the lower right; big round friendly
eyes with one white highlight; no dithering noise, no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF everywhere around the figures, no gradient,
no floor, no cast shadow, no frame, no grid lines, no labels.
```

**להימנע:**

```text
hair bun, purple skirt, visible hair, nun's habit, veil of other religions, crosses, plus signs,
letters on the cards, short sleeves, short skirt, tight clothes, floor, shadow, checkerboard background
```

**בדיקות קבלה:**

- הפריים מלפנים ליד הקרב: אותו ברדס, אותם צבעים, אותו פרצוף.
- השיער מכוסה. חצאית עד הקרסול, שרוול עד פרק היד.
- על הכרטיסים ציורים פשוטים, בלי אותיות.

---

### 3.2 חיות

**איך זה נכנס** (ADD_MONSTER.md): תיקייה לכל חיה, `art_inbox/<slug>/` עם `monster.json`, ‏`front.png`, ‏`back.png` ו־`icon.png`. כל התמונות 1024×1024, רקע מג'נטה.

**כיוונים, כמו החיות הקיימות** (פלוסון, מבחנון):

- `front.png`: היריב רואה אותה. מבט מלפנים, מסובבת קצת לשמאל הצופה.
- `back.png`: החיה של הילד. מאחור, מסובבת קצת לימין, כאילו מסתכלת על היריב. מותר שהתחתית תיחתך.
- `icon.png`: הראש והפנים, או החיה כולה כשהיא כמעט רק ראש. צורה פשוטה וברורה, כי במשחק היא 24×24.

**שורת הסגנון לחיות:**

```text
STYLE: cute chubby creature in pixel art for a children's monster-collecting game; rounded friendly
shapes, big shiny eyes with one white highlight, small happy mouth, short stubby limbs; a thin outline
in a very dark shade of the body colour (almost black); bright saturated colours; 2-3 tone cel
shading with one round highlight on the upper left; clean crisp pixel edges; no dithering noise,
no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
Square canvas 1024x1024, the creature centred, feet near the bottom, at least 60 px of magenta on
every side, nothing touches the edge.
```

**מה בחרתי בשמות** (מותר לשפר, ההורה מחליט):

| שרשרת | עברית | אנגלית | למה |
|---|---|---|---|
| הירח | ירחון ← סהרון | Moonlet ← Crescento | Moonlet היא מילה אמיתית: ירח קטן |
| השמש | **שמשי** ← להבון | Sunling ← Flaron | "שמשון" הוא שם של דמות מהתנ"ך. "שמשי" קצר וקל לילד, ובלי שתי מילים |
| מאדים | חלודון ← מאדימון | Rustlet ← Marsimo | מאדים אדום בגלל חלודה, ומכאן השם |
| שבתאי | טבעתון ← שבתאון | Ringlet ← Saturnio | |
| שביט | שביטון | Zoomet | שביט + zoom: הוא מהיר |

**הסוגים:** כולן `cosmic` או `sky`, ושתיהן שואלות מדעים (`subjects.yaml`: ‏`science: elements: [water, wood, venom, sky, frost, cosmic]`). **לא** `fire` לשמש ולא `earth` למאדים, כי אז הן היו שואלות חשבון וגאומטריה.

**איפה הן חיות:** ב־`where.map` כתבתי את ארבעת האזורים של הטיול: `solar_moon`, ‏`solar_sun`, ‏`solar_rocky`, ‏`solar_giants`. **תוכנית:** המפות האלה עוד לא קיימות, והיום הבדיקה מקבלת רק `route1` (ADD_MONSTER §3). כשהמפות ייבנו (M7), השמות האלה ייכנסו. ההתפתחויות בלי `where`: פוגשים אותן רק דרך התפתחות, כמו בשאר הנגמונים (SDD_ART §2.10).

**רמות:** האזורים עולים ברמה (5–9, ‏8–12, ‏11–15, ‏14–18), וגם רמת ההתפתחות עולה: 16, ‏18, ‏20, ‏22.

---

#### 3.2.1 ירחון (Moonlet)

- **מטרה:** החיה הנפוצה של אזור הירח. נושא: הירח והמופעים שלו.
- **מראה:** אבן ירח עגולה וקטנה, כסופה־אפורה, עם מכתשים רכים כמו נמשים. חצי אחד של הגוף מואר בשמנת זוהר, והחצי השני בצל לבנדר־כחלחל: המופע. רגליים קצרות.
- **סהר:** סהר לבד, ובמיוחד ליד כוכב, הוא סמל של אמונה אחרת. לכן המופע הוא **אור וצל על גוף עגול**, לא צורת סהר, ואין כוכב ליד.
- **קבצים:** `art_inbox/moonlet/monster.json`, ‏`front.png`, ‏`back.png`, ‏`icon.png`

```json
{
  "slug": "moonlet",
  "name_he": "ירחון",
  "name_en": "Moonlet",
  "description_he": "אבן ירח קטנה ועגולה. בכל לילה צד אחר שלה מואר, בדיוק כמו הירח.",
  "description_en": "A small round moon pebble. Each night a different side of it glows, just like the Moon.",
  "types": ["cosmic"],
  "stage": "basic",
  "evolves_into": { "slug": "crescento", "at_level": 16 },
  "evolves_from": null,
  "shape": "blob",
  "height_cm": 30,
  "weight_kg": 2,
  "where": [
    { "map": "solar_moon", "levels": [5, 9], "rarity": "common", "time": "any" }
  ],
  "moves": "auto",
  "images": { "front": "front.png", "back": "back.png", "icon": "icon.png" }
}
```

**מלפנים:**

```text
A small round moon-pebble creature, front view, turned slightly to the viewer's left. Its body is a
smooth ball of pale silver-grey (#C9CCD6) with a few soft shallow craters like freckles. The light
falls on one side: the left half of the ball glows soft cream (#FFF6C8), the right half rests in a
gentle lavender-blue shadow (#8C8FB0), like a Moon phase on a round body. Big sleepy-happy dark eyes,
a tiny smile, rosy cheeks, two short stubby feet, two little round arms. Three tiny round grey
pebbles float around it in a small orbit.
STYLE: cute chubby creature in pixel art for a children's monster-collecting game; rounded friendly
shapes, big shiny eyes with one white highlight, small happy mouth, short stubby limbs; a thin outline
in a very dark shade of the body colour (almost black); bright saturated colours; 2-3 tone cel
shading with one round highlight on the upper left; clean crisp pixel edges; no dithering noise,
no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
Square canvas 1024x1024, the creature centred, feet near the bottom, at least 60 px of magenta on
every side, nothing touches the edge.
```

**מאחור** (ייחוס: `front.png`):

```text
Same creature as the reference image, same colours and proportions, seen from behind, turned slightly
to the right as if looking at an opponent: the round back of the silver-grey ball with soft craters,
the cream lit side and the lavender shadow side on the same sides of the body as in the reference,
the two stubby feet, the three tiny pebbles in orbit. No face visible.
(Same STYLE and BACKGROUND lines as the front image.)
```

**סמל** (ייחוס: `front.png`):

```text
Same creature as the reference image, a simple icon of the whole round body (it is almost all head),
front view, big eyes and tiny smile, the cream lit half and lavender shadow half clearly readable,
no orbiting pebbles. Bold simple shapes that stay readable when shrunk to 24x24 pixels.
Square canvas 1024x1024, centred, 60 px magenta margin.
(Same STYLE and BACKGROUND lines as the front image.)
```

**להימנע:**

```text
crescent shape, crescent with a star, star shapes, four-point sparkles, plus signs, sharp teeth,
angry eyes, spikes, text, floor, shadow, checkerboard background
```

**בדיקות קבלה:** עגול, נראה כמו אבן ירח ידידותית. צד מואר וצד בצל (המופע). אין צורת סהר ואין כוכב.

---

#### 3.2.2 סהרון (Crescento)

- **מטרה:** ההתפתחות של ירחון, ברמה 16.
- **מראה:** גדול יותר ועגול. פס של אור שמנת עובר על הגוף כמו מופע, ובצד החשוך כמה נקודות אור קטנות (אור הארץ). שני חלוקי ירח מסתובבים סביבו, וטבעת אבק כסופה עדינה.
- **קבצים:** `art_inbox/crescento/...` (ארבעת הקבצים). ייחוס ל־`front.png`: ה־`front.png` של ירחון.

```json
{
  "slug": "crescento",
  "name_he": "סהרון",
  "name_en": "Crescento",
  "description_he": "ירחון שגדל. האור עובר על הגוף שלו מצד לצד, והוא יודע איזה מופע יש לירח הלילה.",
  "description_en": "A grown Moonlet. Light slides across its body, and it always knows tonight's Moon phase.",
  "types": ["cosmic", "sky"],
  "stage": "stage1",
  "evolves_into": null,
  "evolves_from": "moonlet",
  "shape": "sprite",
  "height_cm": 70,
  "weight_kg": 8,
  "where": [],
  "moves": "auto",
  "images": { "front": "front.png", "back": "back.png", "icon": "icon.png" }
}
```

**מלפנים** (ייחוס: ה־`front.png` של ירחון):

```text
The evolved form of the reference creature: same creature family, bigger and more detailed, same
colours. Front view, turned slightly to the viewer's left. A larger, perfectly round silver-grey
(#C9CCD6) moon creature that floats a little above the ground. A wide band of glowing cream light
(#FFF6C8) covers the left part of its round body, the rest is soft night blue (#5A5F94) with a few
tiny round light dots (earthshine). Soft craters like freckles. Big wise friendly eyes, a confident
smile, small round arms, a short rounded tail of moon dust below. Two small round grey moon pebbles
orbit it on a thin, soft silver dust ring.
STYLE: cute chubby creature in pixel art for a children's monster-collecting game; rounded friendly
shapes, big shiny eyes with one white highlight, small happy mouth, short stubby limbs; a thin outline
in a very dark shade of the body colour (almost black); bright saturated colours; 2-3 tone cel
shading with one round highlight on the upper left; clean crisp pixel edges; no dithering noise,
no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
Square canvas 1024x1024, the creature centred, near the bottom, at least 60 px of magenta on every
side, nothing touches the edge.
```

**מאחור וסמל:** כמו בירחון (§3.2.1), עם ה־`front.png` של סהרון כייחוס: "Same creature as the reference image, seen from behind, turned slightly to the right... no face visible", ו־"a simple icon of the whole round body...".

**להימנע:**

```text
crescent shape, crescent with a star, star shapes, four-point sparkles, plus signs, sharp teeth,
angry eyes, spikes, wings like a bat, text, floor, shadow, checkerboard background
```

**בדיקות קבלה:** ברור שזה ירחון שגדל (אותם צבעים, אותם מכתשים). עדיין עגול, לא סהר. אין כוכבים.

---

#### 3.2.3 שמשי (Sunling)

- **מטרה:** החיה הנפוצה של אזור "ליד השמש". נושא: יום ולילה, השמש כוכב.
- **מראה:** כדור שמש קטן וחמים, צהוב־כתום, עם קרניים רכות ועגולות כמו עלי כותרת. משקפי מגן כהים ועגולים (צריך משקפי מגן ליד השמש, TRIPS §3). פנים שמחות.
- **קבצים:** `art_inbox/sunling/...`

```json
{
  "slug": "sunling",
  "name_he": "שמשי",
  "name_en": "Sunling",
  "description_he": "שמש קטנה וחמימה עם משקפי מגן. היא מזכירה שהשמש היא כוכב, הכוכב הכי קרוב אלינו.",
  "description_en": "A warm little sun in safety goggles. It reminds you the Sun is a star, the closest one to us.",
  "types": ["cosmic"],
  "stage": "basic",
  "evolves_into": { "slug": "flaron", "at_level": 18 },
  "evolves_from": null,
  "shape": "blob",
  "height_cm": 35,
  "weight_kg": 3,
  "where": [
    { "map": "solar_sun", "levels": [8, 12], "rarity": "common", "time": "day" }
  ],
  "moves": "auto",
  "images": { "front": "front.png", "back": "back.png", "icon": "icon.png" }
}
```

**מלפנים:**

```text
A small round sun creature, front view, turned slightly to the viewer's left. A chubby ball of warm
golden yellow (#FFC93C) with an orange (#FF8A1F) rim of shading, surrounded by eight short, soft,
rounded rays like flower petals in light orange. It wears round dark-teal (#1F5C66) safety goggles on
its eyes with a small white shine on each lens, and its happy eyes are visible behind them. Rosy
cheeks, a big happy open smile, two little round arms, two short stubby feet. A soft warm glow
directly around the body only.
STYLE: cute chubby creature in pixel art for a children's monster-collecting game; rounded friendly
shapes, big shiny eyes with one white highlight, small happy mouth, short stubby limbs; a thin outline
in a very dark shade of the body colour (almost black); bright saturated colours; 2-3 tone cel
shading with one round highlight on the upper left; clean crisp pixel edges; no dithering noise,
no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
Square canvas 1024x1024, the creature centred, feet near the bottom, at least 60 px of magenta on
every side, nothing touches the edge.
```

**מאחור וסמל** (ייחוס: `front.png`): "Same creature as the reference image, seen from behind, turned slightly to the right: the round golden back, the petal rays, the goggle strap across the back of the head, no face visible." והסמל: "a simple icon of the whole round body with goggles and smile, bold shapes readable at 24x24".

**להימנע:**

```text
flames, fire, burning, smoke, sharp spikes, sun with a human adult face, angry eyes, sunglasses brand,
plus signs, crosses, four-point sparkles, hooked or cross-like ray patterns, text, floor,
shadow, checkerboard background
```

**בדיקות קבלה:** הקרניים עגולות ורכות (לא להבות ולא קוצים), ומספרן לא יוצר צורת צלב. המשקפיים ברורים.

---

#### 3.2.4 להבון (Flaron)

- **מטרה:** ההתפתחות של שמשי, ברמה 18.
- **מראה:** גדול וזוהר יותר, זהב־כתום. סביבו שלוש לולאות אור רכות כמו סרטים (התפרצויות שמש), משקפי המגן מורמים על המצח, חיוך בטוח.
- **קבצים:** `art_inbox/flaron/...`. ייחוס: ה־`front.png` של שמשי.

```json
{
  "slug": "flaron",
  "name_he": "להבון",
  "name_en": "Flaron",
  "description_he": "שמשי שגדל. סביבו לולאות של אור, ובזכותו יש לנו יום כשהצד שלנו של כדור הארץ פונה אליו.",
  "description_en": "A grown Sunling ringed with loops of light. Our side of Earth has day when it faces him.",
  "types": ["cosmic", "sky"],
  "stage": "stage1",
  "evolves_into": null,
  "evolves_from": "sunling",
  "shape": "sprite",
  "height_cm": 90,
  "weight_kg": 12,
  "where": [],
  "moves": "auto",
  "images": { "front": "front.png", "back": "back.png", "icon": "icon.png" }
}
```

**מלפנים** (ייחוס: ה־`front.png` של שמשי):

```text
The evolved form of the reference creature: same creature family, bigger and more detailed, same
colours. Front view, turned slightly to the viewer's left. A larger glowing golden-orange (#FFB020,
rim #FF7A1A) round sun creature that floats a little above the ground, with twelve soft rounded
petal rays and three smooth ribbon-like loops of light (#FFE27A) arching out of its body and back in,
like gentle solar loops. The dark-teal round safety goggles are pushed up on its forehead. Bright
confident friendly eyes, a proud smile, small round arms held out wide in a welcoming way.
STYLE: cute chubby creature in pixel art for a children's monster-collecting game; rounded friendly
shapes, big shiny eyes with one white highlight, small happy mouth, short stubby limbs; a thin outline
in a very dark shade of the body colour (almost black); bright saturated colours; 2-3 tone cel
shading with one round highlight on the upper left; clean crisp pixel edges; no dithering noise,
no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
Square canvas 1024x1024, the creature centred, near the bottom, at least 60 px of magenta on every
side, nothing touches the edge.
```

**מאחור וסמל:** כמו בשמשי, עם ה־`front.png` של להבון כייחוס.

**להימנע:**

```text
flames, fire, burning, smoke, explosions, sharp spikes, angry eyes, plus signs, crosses, four-point
sparkles, cross-like or hooked ray patterns, text, floor, shadow, checkerboard background
```

**בדיקות קבלה:** ברור שזה שמשי שגדל. הלולאות רכות כמו סרטים, לא אש.

---

#### 3.2.5 חלודון (Rustlet)

- **מטרה:** החיה הנפוצה של אזור כוכבי הלכת הסלעיים. נושא: מאדים, סדר כוכבי הלכת.
- **מראה:** אבן קטנה ועגולה בצבע חלודה, מאובקת, עם כתמים כתומים. ענני אבק קטנים ליד הרגליים. שני ירחים קטנים בצורת תפוח אדמה מסתובבים סביבה (כמו שני הירחים של מאדים).
- **קבצים:** `art_inbox/rustlet/...`

```json
{
  "slug": "rustlet",
  "name_he": "חלודון",
  "name_en": "Rustlet",
  "description_he": "אבן קטנה מהמאדים. היא אדומה בגלל חלודה: ברזל שפגש חמצן.",
  "description_en": "A little pebble from Mars. It is red because of rust: iron that met oxygen.",
  "types": ["cosmic"],
  "stage": "basic",
  "evolves_into": { "slug": "marsimo", "at_level": 20 },
  "evolves_from": null,
  "shape": "blob",
  "height_cm": 30,
  "weight_kg": 6,
  "where": [
    { "map": "solar_rocky", "levels": [11, 15], "rarity": "common", "time": "any" }
  ],
  "moves": "auto",
  "images": { "front": "front.png", "back": "back.png", "icon": "icon.png" }
}
```

**מלפנים:**

```text
A small round rust-red pebble creature from Mars, front view, turned slightly to the viewer's left.
A chubby, slightly lumpy ball of rust red (#C4532B, shading #8E3A1E) with dusty orange (#E88A4A) spots
and a soft dusting of sand colour (#E8C99A) on top. Big curious dark eyes, a cheeky little smile,
rosy cheeks, two short stubby feet with small puffs of red dust around them. Two tiny lumpy
potato-shaped grey-brown moons float around it, one bigger, one smaller.
STYLE: cute chubby creature in pixel art for a children's monster-collecting game; rounded friendly
shapes, big shiny eyes with one white highlight, small happy mouth, short stubby limbs; a thin outline
in a very dark shade of the body colour (almost black); bright saturated colours; 2-3 tone cel
shading with one round highlight on the upper left; clean crisp pixel edges; no dithering noise,
no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
Square canvas 1024x1024, the creature centred, feet near the bottom, at least 60 px of magenta on
every side, nothing touches the edge.
```

**מאחור וסמל** (ייחוס: `front.png`): "Same creature, seen from behind, turned slightly to the right: rust-red back with orange spots, sand dust on top, dust puffs at the feet, the two little moons. No face." והסמל: "simple icon of the round rust-red body with eyes and smile, no moons, readable at 24x24".

**להימנע:**

```text
lava, fire, cracks like wounds, spikes, sharp teeth, angry eyes, metal robot parts, plus signs,
crosses, text, floor, shadow, checkerboard background
```

**בדיקות קבלה:** אדום חלודה, ידידותי. שני ירחים קטנים ולא עגולים.

---

#### 3.2.6 מאדימון (Marsimo)

- **מטרה:** ההתפתחות של חלודון, ברמה 20.
- **מראה:** יצור סלע אדום, חזק ועגלגל, על ארבע רגליים קצרות. על הגב הר רחב ושטוח ועדין (ההר הגבוה במערכת השמש), בלי עשן ובלי לבה. שני הירחים הקטנים מסתובבים סביבו.
- **קבצים:** `art_inbox/marsimo/...`. ייחוס: ה־`front.png` של חלודון.

```json
{
  "slug": "marsimo",
  "name_he": "מאדימון",
  "name_en": "Marsimo",
  "description_he": "על הגב שלו הר רחב ושטוח, כמו ההר הכי גבוה במערכת השמש, שנמצא במאדים.",
  "description_en": "On his back is a wide, flat mountain, like the tallest one in the Solar System, on Mars.",
  "types": ["cosmic"],
  "stage": "stage1",
  "evolves_into": null,
  "evolves_from": "rustlet",
  "shape": "landrace",
  "height_cm": 110,
  "weight_kg": 60,
  "where": [],
  "moves": "auto",
  "images": { "front": "front.png", "back": "back.png", "icon": "icon.png" }
}
```

**מלפנים** (ייחוס: ה־`front.png` של חלודון):

```text
The evolved form of the reference creature: same creature family, bigger and more detailed, same
colours. Front view, turned slightly to the viewer's left. A sturdy, rounded, gentle rock creature on
four short stubby legs, rust red (#C4532B, shading #8E3A1E) with dusty orange (#E88A4A) patches.
On its back rises one wide, gently sloped, flat-topped mountain in lighter red-orange with a soft
round dip at the top, calm and clean, no smoke. A friendly broad face with big kind eyes and a wide
calm smile. Soft swirls of red dust at its feet. The two tiny potato-shaped moons orbit around it.
STYLE: cute chubby creature in pixel art for a children's monster-collecting game; rounded friendly
shapes, big shiny eyes with one white highlight, small happy mouth, short stubby limbs; a thin outline
in a very dark shade of the body colour (almost black); bright saturated colours; 2-3 tone cel
shading with one round highlight on the upper left; clean crisp pixel edges; no dithering noise,
no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
Square canvas 1024x1024, the creature centred, feet near the bottom, at least 60 px of magenta on
every side, nothing touches the edge.
```

**מאחור וסמל:** כמו בחלודון, עם ה־`front.png` של מאדימון כייחוס. בגב רואים היטב את ההר.

**להימנע:**

```text
erupting volcano, lava, smoke, fire, horns, spikes, claws, sharp teeth, angry brows, dinosaur jaws,
plus signs, crosses, text, floor, shadow, checkerboard background
```

**בדיקות קבלה:** ברור שזה חלודון שגדל. ההר רגוע: בלי עשן, בלי לבה. נראה חזק וחביב, לא מאיים.

---

#### 3.2.7 טבעתון (Ringlet)

- **מטרה:** חיה לא נפוצה באזור הענקים והטבעות. נושא: שבתאי, כוח המשיכה.
- **מראה:** כדור קטן בצבע זהב חיוור עם פסים רכים, וטבעת אחת דקה ונטויה מסביב, כמו חישוק. מרחף.
- **קבצים:** `art_inbox/ringlet/...`

```json
{
  "slug": "ringlet",
  "name_he": "טבעתון",
  "name_en": "Ringlet",
  "description_he": "כדור קטן עם טבעת שמסתובבת סביבו. הטבעת עשויה מהמון חתיכות של קרח ואבן.",
  "description_en": "A small ball with a ring spinning around it. The ring is made of many bits of ice and rock.",
  "types": ["sky"],
  "stage": "basic",
  "evolves_into": { "slug": "saturnio", "at_level": 22 },
  "evolves_from": null,
  "shape": "flier",
  "height_cm": 40,
  "weight_kg": 1,
  "where": [
    { "map": "solar_giants", "levels": [14, 18], "rarity": "uncommon", "time": "any" }
  ],
  "moves": "auto",
  "images": { "front": "front.png", "back": "back.png", "icon": "icon.png" }
}
```

**מלפנים:**

```text
A small round floating planet creature, front view, turned slightly to the viewer's left. A chubby
ball of pale gold (#F1D28A) with soft horizontal bands of cream (#FBEBC4) and light caramel (#D9A75E).
One thin tilted ring around its middle, like a hula hoop, made of tiny pale blue-white rounded
pebbles of ice and grey rock (#CFE3F0, #A9A39A), passing in front of its tummy and behind its back.
Big bright happy eyes, a small open smile, rosy cheeks, two tiny round arms, no legs, it floats.
STYLE: cute chubby creature in pixel art for a children's monster-collecting game; rounded friendly
shapes, big shiny eyes with one white highlight, small happy mouth, short stubby limbs; a thin outline
in a very dark shade of the body colour (almost black); bright saturated colours; 2-3 tone cel
shading with one round highlight on the upper left; clean crisp pixel edges; no dithering noise,
no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
Square canvas 1024x1024, the creature centred in the lower half, at least 60 px of magenta on every
side, the ring does not touch the edge.
```

**מאחור וסמל** (ייחוס: `front.png`): "Same creature, seen from behind, turned slightly to the right: the banded round back, the tilted ring passing in front and behind in the same tilt as the reference. No face." והסמל: "simple icon: round banded ball with eyes, smile and the ring, readable at 24x24".

**להימנע:**

```text
halo, angel, glowing circle above the head, wedding ring, jewellery, plus signs, crosses, star shapes,
four-point sparkles, angry eyes, text, floor, shadow, checkerboard background
```

**בדיקות קבלה:** הטבעת סביב האמצע ונטויה, לא מעל הראש (לא הילה). עשויה מחלוקים קטנים.

---

#### 3.2.8 שבתאון (Saturnio)

- **מטרה:** ההתפתחות של טבעתון, ברמה 22.
- **מראה:** כדור גדול ורך בזהב חיוור עם פסים, טבעת רחבה של כמה פסים (קרח ואבן), וירח קטן אחד שמסתובב. נראה קליל ושמח, כאילו צף.
- **קבצים:** `art_inbox/saturnio/...`. ייחוס: ה־`front.png` של טבעתון.

```json
{
  "slug": "saturnio",
  "name_he": "שבתאון",
  "name_en": "Saturnio",
  "description_he": "קל כל כך, שבאמבטיה ענקית הוא היה צף. בדיוק כמו שבתאי.",
  "description_en": "So light that in a giant bathtub it would float. Just like Saturn.",
  "types": ["sky", "cosmic"],
  "stage": "stage1",
  "evolves_into": null,
  "evolves_from": "ringlet",
  "shape": "flier",
  "height_cm": 120,
  "weight_kg": 4,
  "where": [],
  "moves": "auto",
  "images": { "front": "front.png", "back": "back.png", "icon": "icon.png" }
}
```

**מלפנים** (ייחוס: ה־`front.png` של טבעתון):

```text
The evolved form of the reference creature: same creature family, bigger and more detailed, same
colours. Front view, turned slightly to the viewer's left. A big, soft, round floating planet creature
in pale gold (#F1D28A) with gentle bands of cream, caramel and soft peach. A wide tilted ring of three
bands (pale blue-white ice #CFE3F0, light grey rock #A9A39A, cream) circles its middle, made of many
tiny rounded pebbles, passing in front of its tummy and behind its back. One small round pale moon
orbits above the ring. Big calm happy eyes, a relaxed smile, small round arms resting on the ring as
if floating in water.
STYLE: cute chubby creature in pixel art for a children's monster-collecting game; rounded friendly
shapes, big shiny eyes with one white highlight, small happy mouth, short stubby limbs; a thin outline
in a very dark shade of the body colour (almost black); bright saturated colours; 2-3 tone cel
shading with one round highlight on the upper left; clean crisp pixel edges; no dithering noise,
no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
Square canvas 1024x1024, the creature centred in the lower half, at least 60 px of magenta on every
side, the ring does not touch the edge.
```

**מאחור וסמל:** כמו בטבעתון, עם ה־`front.png` של שבתאון כייחוס.

**להימנע:**

```text
halo, angel, circle above the head, crown, plus signs, crosses, star shapes, four-point sparkles,
storm, angry eyes, text, floor, shadow, checkerboard background
```

**בדיקות קבלה:** ברור שזה טבעתון שגדל. הטבעת רחבה, נטויה, סביב האמצע. אין כתר ואין הילה.

---

#### 3.2.9 שביטון (Zoomet)

- **מטרה:** חיה נדירה, בלי התפתחות. מופיעה בלילה באזור הענקים (חגורת האסטרואידים). נושא: שביטים, כוח המשיכה.
- **מראה:** ראש עגול של קרח כחלחל־לבן, עם פנים שמחות ומהירות. זנב ארוך ורך בשני צבעים: כחול בהיר וזנב אבק בשמנת, שזורם אחורה. גוף קטן מאוד.
- **קבצים:** `art_inbox/zoomet/...`

```json
{
  "slug": "zoomet",
  "name_he": "שביטון",
  "name_en": "Zoomet",
  "description_he": "כדור של קרח ואבק. ליד השמש צומח לו זנב ארוך, שתמיד מצביע הרחק ממנה.",
  "description_en": "A ball of ice and dust. Near the Sun it grows a long tail that always points away from it.",
  "types": ["sky", "cosmic"],
  "stage": "standalone",
  "evolves_into": null,
  "evolves_from": null,
  "shape": "flier",
  "height_cm": 50,
  "weight_kg": 3,
  "where": [
    { "map": "solar_giants", "levels": [15, 18], "rarity": "rare", "time": "night" }
  ],
  "moves": "auto",
  "images": { "front": "front.png", "back": "back.png", "icon": "icon.png" }
}
```

**מלפנים:**

```text
A small speedy comet creature, front view, turned slightly to the viewer's left, flying. Its head is
a round ball of icy pale blue-white (#DDF1FF, shading #8EC5E8) with a few grey dust specks, big bright
excited eyes, a wide happy grin, two tiny round arms stretched forward. Behind it streams a long,
soft, wavy tail curving up and to the right: a narrow straight light-blue (#7CC8FF) tail and a wider
curved cream (#FFF1C9) dust tail, both made of soft rounded puffs that fade out in steps. Small round
ice dots around the head.
STYLE: cute chubby creature in pixel art for a children's monster-collecting game; rounded friendly
shapes, big shiny eyes with one white highlight, small happy mouth, short stubby limbs; a thin outline
in a very dark shade of the body colour (almost black); bright saturated colours; 2-3 tone cel
shading with one round highlight on the upper left; clean crisp pixel edges; no dithering noise,
no blur, no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no floor, no shadow, no frame, no labels.
Square canvas 1024x1024, the creature and its whole tail inside the canvas with at least 60 px of
magenta on every side.
```

**מאחור וסמל** (ייחוס: `front.png`): "Same creature, seen from behind, turned slightly to the right, flying away from the viewer toward an opponent: the round icy back of the head, the two-colour tail flowing toward the viewer and to the left. No face." והסמל: "simple icon: the round icy head with eyes and grin and a short stub of the tail, readable at 24x24".

**להימנע:**

```text
fire, flames, meteor crash, explosion, impact, sharp spikes, four-point sparkles, star shapes,
plus signs, crosses, angry eyes, text, floor, shadow, checkerboard background
```

**בדיקות קבלה:** הזנב כולו בתוך התמונה. רך ועשוי מבועות, לא אש. נראה מהיר ושמח.

---

### 3.3 אריחים וחפצים

#### 3.3.0 איך אריחים נכנסים למשחק

- **מה המשחק קורא** (`tools/app/maps.py`, ‏SDD_ART §2.11): אריח של 16×16 פיקסלים במפה (קובץ TSX), וגיליון HD באותה פריסה **בדיוק פי 4** (אריח 64×64) ב־`mods/nagmon/gfx/tilesets/` באותו שם. אם הגודל לא פי 4 בדיוק, הבנייה נכשלת (`not 4x`).
- `tools/art/upscale_tiles.py` מגדיל אריחים **ישנים** של 16 פיקסלים ב־xBRZ. לאריחים חדשים שמצוירים גדול הוא לא צריך: מקטינים אותם.
- **תוכנית:** ייבוא של גיליון אריחים חדש עוד לא קיים בקוד (אין `layout` לאריחים ב־`manifest.yaml`). אחרי "העלתי" אוסיף אותו: חיתוך לרשת שווה, הקטנה של כל תא ל־64×64 (HD) ול־16×16 (הגיליון הטבעי), ו־TSX. יש בדיקה לכל שלב.
- **הפורמט הכי קל לייבוא:**
  - PNG ריבועי **1024×1024**, רשת של **4×4 תאים, כל תא 256×256**: אריח אחד של 16 פיקסלים, פי 16. ההקטנה ל־64 היא בדיוק פי 4, ול־16 פי 16. בלי שארית.
  - בלי רווח בין התאים, בלי קווים, בלי מסגרת, בלי טקסט. כל תא ממלא את המקום שלו בדיוק.
  - **קרקע** (תאים אטומים): ממלאת את כל התא עד הקצה. **חפצים** (סלע, בולדר): על מג'נטה, והחפץ לא נוגע בקצה התא.
  - **בלי תפרים:** כל אריח קרקע מתחבר לעצמו מכל ארבעת הצדדים, ולכל אריח קרקע אחר באותו גיליון. בלי מסגרת כהה, בלי הצללה בשוליים, בלי מעבר אור מצד לצד.
  - **אריח שמכיל משהו על הקרקע** (מכתש, עקבות): ברבע החיצוני של התא (64 פיקסלים מכל צד) רק הקרקע הבסיסית (קרקע A), כדי שיתחבר לכל שכן.
  - **חפץ גדול** (מכתש גדול, תצורת סלע): על פני כמה תאים צמודים, וקווי החיתוך עוברים דרכו. הקצוות החיצוניים שלו כמו בכלל הקודם.
- **מבט:** מלמעלה, כמו העיר: הקרקע ישר מלמעלה, וקירות וחפצים בזווית של שלושה רבעים (רואים את החזית ואת החלק העליון).
- **אור:** כמו בדמויות, מלמעלה משמאל. **אין** צל מוטל על הקרקע (המשחק מניח את החפצים על כל קרקע).
- **בדיקה של ההורה:** פותחים את התמונה, ומסתכלים שאין קווים בין התאים ואין שוליים כהים. אני בודק אחרי ההעלאה גם את החיבור (2×2 מכל אריח קרקע).

**שורת הסגנון לאריחים:**

```text
STYLE: pixel-art tile sheet for a cozy top-down adventure game for children; clean crisp pixel edges;
bright saturated colours; 2-3 tone cel shading with light from the upper left; dark outlines only on
objects (rocks, boulders, walls, doors), never on ground tiles; no dithering noise, no blur, no
painterly texture, no text, no perspective on the ground (seen straight from above), no cast shadows,
no vignette.
GRID: square canvas 1024x1024 split into exactly 4 columns x 4 rows of equal 256x256 cells, no gaps,
no grid lines, no frame, no labels. Each ground cell fills its whole cell edge to edge and tiles
seamlessly with itself and with every other ground cell. Objects stand on flat magenta #FF00FF inside
their cell and do not touch the cell edge.
```

---

#### 3.3.1 הירח: קרקע ומכתשים

- **מטרה:** אזור 1. קרקע אפורה־כסופה של הירח, מכתשים, סלעים.
- **קובץ:** `art_inbox/tiles_moon/tiles.png`, ‏1024×1024 (4×4 תאים של 256).
- **פריסה:**

| | עמודה 1 | עמודה 2 | עמודה 3 | עמודה 4 |
|---|---|---|---|---|
| **שורה 1** | קרקע A | קרקע B (וריאציה) | קרקע C: חלוקים קטנים | קרקע עם עקבות מגפיים |
| **שורה 2** | מכתש קטן בקרקע | שני מכתשים זעירים בקרקע | סלע ירח (מג'נטה) | בולדר עגול (מג'נטה) |
| **שורה 3** | מכתש גדול: רבע שמאלי עליון | מכתש גדול: רבע ימני עליון | קרקע כהה ("ים" של הירח) | גבעת אבק קטנה (מג'נטה) |
| **שורה 4** | מכתש גדול: רבע שמאלי תחתון | מכתש גדול: רבע ימני תחתון | מעבר: קרקע A לקרקע כהה | ריק (מג'נטה) |

```text
Pixel-art ground tile sheet of the surface of the Moon for a cozy top-down children's game.
Palette: pale silver grey (#C9CCD6), mid grey (#A3A7B5), cool shadow lavender-grey (#7E8296),
dark grey "sea" (#6B6F80), tiny white specks.
Row 1: cell 1 plain moon dust ground A with fine soft speckles; cell 2 ground B, the same ground with
a slightly different speckle pattern; cell 3 ground C, the same ground with a few tiny rounded
pebbles; cell 4 the same ground with a short trail of rounded boot prints going up.
Row 2: cell 1 ground A with one small shallow round crater in the centre (a raised soft rim, a
lavender shadow inside on the left, light on the inner right); cell 2 ground A with two tiny craters;
cell 3 one rounded grey moon rock on magenta; cell 4 one big smooth round grey boulder on magenta.
Rows 3-4, cells 1-2: ONE big shallow round crater drawn across these four cells together as a 2x2
block, centred on the meeting point of the four cells, with the plain ground A all around it near the
outer edges of the block.
Row 3: cell 3 darker grey smooth "sea" ground, seamless; cell 4 a small soft mound of moon dust on
magenta. Row 4: cell 3 a soft wavy transition from ground A (top) to the darker sea ground (bottom);
cell 4 empty flat magenta.
STYLE: pixel-art tile sheet for a cozy top-down adventure game for children; clean crisp pixel edges;
bright saturated colours; 2-3 tone cel shading with light from the upper left; dark outlines only on
objects (rocks, boulders, walls, doors), never on ground tiles; no dithering noise, no blur, no
painterly texture, no text, no perspective on the ground (seen straight from above), no cast shadows,
no vignette.
GRID: square canvas 1024x1024 split into exactly 4 columns x 4 rows of equal 256x256 cells, no gaps,
no grid lines, no frame, no labels. Each ground cell fills its whole cell edge to edge and tiles
seamlessly with itself and with every other ground cell. Objects stand on flat magenta #FF00FF inside
their cell and do not touch the cell edge.
```

**להימנע:**

```text
flag, astronaut, footprints of animals, plus-shaped marks, crosses, Earth in the sky, stars on the
ground, 3D perspective, horizon, vignette, borders between cells, text
```

**בדיקות קבלה:** 16 תאים שווים. קרקע A, B, C וכהה מתחברות בלי תפר. המכתש הגדול שלם כשמחברים את ארבעת התאים.

---

#### 3.3.2 מאדים: קרקע וסלעים

- **מטרה:** אזור 3. קרקע אדומה־כתומה מאובקת, סלעים, עקבות של רכב.
- **קובץ:** `art_inbox/tiles_mars/tiles.png`, ‏1024×1024 (4×4 תאים של 256).
- **פריסה:**

| | עמודה 1 | עמודה 2 | עמודה 3 | עמודה 4 |
|---|---|---|---|---|
| **שורה 1** | קרקע A | קרקע B (וריאציה) | קרקע C: אדוות של אבק | קרקע D: משטח סלע כהה |
| **שורה 2** | סלע אדום קטן (מג'נטה) | סלע גבוה (מג'נטה) | שני סלעים (מג'נטה) | דיונת אבק נמוכה (מג'נטה) |
| **שורה 3** | תצורת סלע גדולה: שמאל עליון | תצורת סלע גדולה: ימין עליון | עקבות רכב בקרקע (אנכי) | מכתש קטן בקרקע |
| **שורה 4** | תצורת סלע גדולה: שמאל תחתון | תצורת סלע גדולה: ימין תחתון | חלוקים בקרקע | ריק (מג'נטה) |

```text
Pixel-art ground tile sheet of the surface of Mars for a cozy top-down children's game.
Palette: rust red (#C4532B), dusty orange (#E88A4A), sand (#E8C99A), deep red-brown shadow (#8E3A1E),
dark rock (#6E3424).
Row 1: cell 1 plain dusty red-orange ground A with fine soft speckles; cell 2 ground B, the same
ground with a slightly different speckle pattern; cell 3 ground C, the same ground with soft
horizontal ripples of sand-coloured dust; cell 4 ground D, flat darker red-brown rock floor with a
few soft lines.
Row 2: cell 1 one small rounded red rock on magenta; cell 2 one taller rounded red rock with a flat
top on magenta; cell 3 a pair of small rounded rocks on magenta; cell 4 a low soft dune of orange
dust on magenta.
Rows 3-4, cells 1-2: ONE big rounded friendly rock formation (layered red and orange bands, flat
top) drawn across these four cells together as a 2x2 block, on magenta, not touching the outer edges
of the block.
Row 3: cell 3 ground A with two parallel rover wheel tracks running from top edge to bottom edge, so
it can repeat vertically; cell 4 ground A with one small shallow crater in the centre.
Row 4: cell 3 ground A with scattered tiny rounded pebbles; cell 4 empty flat magenta.
STYLE: pixel-art tile sheet for a cozy top-down adventure game for children; clean crisp pixel edges;
bright saturated colours; 2-3 tone cel shading with light from the upper left; dark outlines only on
objects (rocks, boulders, walls, doors), never on ground tiles; no dithering noise, no blur, no
painterly texture, no text, no perspective on the ground (seen straight from above), no cast shadows,
no vignette.
GRID: square canvas 1024x1024 split into exactly 4 columns x 4 rows of equal 256x256 cells, no gaps,
no grid lines, no frame, no labels. Each ground cell fills its whole cell edge to edge and tiles
seamlessly with itself and with every other ground cell. Objects stand on flat magenta #FF00FF inside
their cell and do not touch the cell edge.
```

**להימנע:**

```text
lava, fire, volcano smoke, skulls, bones, sharp spikes, plus-shaped marks, crosses, flags, robots,
3D perspective, horizon, vignette, borders between cells, text
```

**בדיקות קבלה:** הקרקעות מתחברות בלי תפר. עקבות הרכב מתחברים מלמעלה למטה. תצורת הסלע שלמה בארבעת התאים.

---

#### 3.3.3 רקע של חלל: שדה כוכבים

- **מטרה:** הרקע מחוץ לקרקע ולתחנה (מה שרואים מעבר לקצה של הירח, ובחלונות). משטח אחד שחוזר על עצמו.
- **קובץ:** `art_inbox/tiles_space/stars.png`, ‏1024×1024. כל התמונה היא **בלוק אחד של 4×4 אריחים** שחוזר על עצמו בלי תפר (הקצה הימני ממשיך לשמאלי, והעליון לתחתון).

```text
Pixel-art seamless starfield background for a cozy top-down children's game, square canvas 1024x1024,
to be cut into a 4x4 grid of equal 256x256 tiles. The whole image tiles seamlessly: the right edge
continues into the left edge and the top edge into the bottom edge.
Deep night-blue to indigo space (#0B1030, with soft areas of #1A1F4A and a very faint violet haze
#2A2060), filled evenly with small round stars: many tiny single dots in white and pale blue, some
slightly bigger round dots in pale yellow and soft pink, a few with a small soft round glow. Stars are
round dots only. Evenly spread, no big empty patches, no bright band, no planets, no objects.
STYLE: clean crisp pixel edges, 2-3 tone colours, no dithering noise, no blur, no painterly texture,
no text, no vignette, no frame, no grid lines.
```

**להימנע:**

```text
four-point star sparkles, plus-shaped stars, cross-shaped glints, five-point star icons, star of any
symbol, crescent moon, planets, galaxies with faces, nebula with faces, vignette, darker edges,
grid lines, text
```

**בדיקות קבלה:** כל הכוכבים נקודות עגולות. כשמניחים 2×2 עותקים זה ליד זה, לא רואים איפה נגמרת תמונה.

---

#### 3.3.4 תחנת החלל: קירות, רצפה, דלת וחלון

- **מטרה:** התחנה של האסטרונומית, שבה המבחן בסוף הטיול. גם בסיס הירח יכול להשתמש בה.
- **קובץ:** `art_inbox/tiles_station/tiles.png`, ‏1024×1024 (4×4 תאים של 256).
- **קיר הוא שני אריחים בגובה** (חלק עליון וחלק תחתון), כמו בבתים בעיר. **דלת** גם היא שני אריחים.
- **פריסה:**

| | עמודה 1 | עמודה 2 | עמודה 3 | עמודה 4 |
|---|---|---|---|---|
| **שורה 1** | רצפה A | רצפה B (וריאציה) | רצפה עם אור עגול | שטיח עגול (על רצפה) |
| **שורה 2** | קיר: חלק עליון | קיר עם חלון עגול: עליון | דלת סגורה: עליון | דלת פתוחה: עליון |
| **שורה 3** | קיר: חלק תחתון | קיר עם חלון עגול: תחתון | דלת סגורה: תחתון | דלת פתוחה: תחתון |
| **שורה 4** | פינת קיר שמאלית (עליון) | פינת קיר ימנית (עליון) | שולחן בקרה (מג'נטה) | טלסקופ גדול (מג'נטה) |

```text
Pixel-art interior tile sheet of a friendly space station for a cozy top-down children's game.
Palette: soft white panels (#EEF2F6, shading #C9D2DC), turquoise accents (#2BB3B1), midnight blue
trim (#24346E), warm orange lights (#F77D03), light grey floor (#B8C0CC, shading #9AA3B0).
Row 1 (floor, seen from above, each tile seamless with itself and with the other floor tiles):
cell 1 floor A, light grey rounded square panels with soft seams that line up with the cell edges;
cell 2 floor B, the same panels with one panel slightly lighter; cell 3 floor A with one small round
warm orange floor light in the centre; cell 4 floor A with a round turquoise rug in the centre.
Rows 2-3: walls are two tiles tall, front-facing, seen in three-quarter top-down view, and each wall
column repeats seamlessly to the left and right.
Column 1: plain wall, upper half in row 2 (white panels with a midnight-blue top trim), lower half in
row 3 (white panels with a turquoise stripe and a baseboard).
Column 2: the same wall with one big ROUND porthole window showing deep blue space with a few round
white star dots; the window spans the upper and lower halves.
Column 3: a closed rounded sliding door, white with a turquoise frame and one small round green
light, spanning the upper half (row 2) and lower half (row 3).
Column 4: the same door open, the two panels slid to the sides, a soft lit corridor inside.
Row 4: cell 1 left end of the wall (upper half) with a rounded corner; cell 2 right end of the wall
(upper half) with a rounded corner; cell 3 a small control desk with round buttons and a blank glowing
screen, on magenta; cell 4 a big friendly brass telescope (#D9A441) on a three-legged stand, pointing
up, on magenta.
STYLE: pixel-art tile sheet for a cozy top-down adventure game for children; clean crisp pixel edges;
bright saturated colours; 2-3 tone cel shading with light from the upper left; dark outlines only on
objects (rocks, boulders, walls, doors), never on ground tiles; no dithering noise, no blur, no
painterly texture, no text, no perspective on the ground (seen straight from above), no cast shadows,
no vignette.
GRID: square canvas 1024x1024 split into exactly 4 columns x 4 rows of equal 256x256 cells, no gaps,
no grid lines, no frame, no labels. Each ground cell fills its whole cell edge to edge and tiles
seamlessly with itself and with every other ground cell. Objects stand on flat magenta #FF00FF inside
their cell and do not touch the cell edge.
```

**להימנע:**

```text
square window with cross-shaped bars, window panes forming a plus, plus-shaped screws, red cross,
first-aid sign, crosses, letters or numbers on the screen, signs, logos, flags, warning stripes,
dark scary corridors, 3D perspective on the floor, vignette, borders between cells, text
```

**בדיקות קבלה:** החלונות עגולים, בלי סורגים בצורת "+". הקיר והדלת מתחברים לגובה (שורה 2 מעל שורה 3). הרצפה בלי תפר. על המסך אין טקסט.

---

#### 3.3.5 החללית: המעבורת של מילה

- **מטרה:** הכלי הקסום של מילה, בצורת חללית, חונה על המפה (חפץ). השם הסופי: החלטה של ההורה.
- **קובץ:** `art_inbox/shuttle_space/ship.png`, ‏768×768: חפץ אחד על מג'נטה, שתופס 3×3 אריחים (במשחק 48×48, ‏HD ‏192×192). אפשר להוסיף `ship_open.png` עם הדלת פתוחה, באותו גודל ובאותו מקום.
- **מראה:** מבנה עגול וידידותי בצבעים של מילה (כתום ושמנת) עם פסים בטורקיז. חלון קדמי גדול ועגול, חלונות עגולים קטנים, כנפיים קטנות ומעוגלות, ושלוש רגליים עגולות. בלי פרצוף, בלי טקסט ובלי דגל.

```text
Pixel-art map object for a cozy top-down children's game: a teacher's magic school shuttle in its
spaceship form, parked on the ground, seen in three-quarter top-down view (you see its front and its
top), on flat magenta #FF00FF. Square canvas 768x768 (a block of 3x3 tiles), the ship centred and
filling most of the block, at least 32 px of magenta on every side.
A chubby, rounded, friendly little spaceship shaped like a smooth egg lying on its side, bright orange
(#F77D03, shading #E06403) with cream (#FCF6B9) panels and turquoise (#2BB3B1) stripes. One big round
front window with a soft blue glass shine, a row of three small round portholes on its side, two
short rounded fins at the back, a small round turquoise light on top, three short round landing legs
with round pads. A rounded door on its side with a small round handle. Trim of small cream dots and
tiny gold (#F6C264) ringed planets along the stripes. A gentle warm glow under the engines, no flames.
STYLE: cute pixel art for a cozy top-down adventure game for children; clean crisp pixel edges; a thin
near-black warm outline (#1A0E0A) around the ship and its main shapes; bright saturated warm colours;
2-3 tone cel shading with one small highlight; light from the upper left; no dithering noise, no blur,
no painterly texture, no text.
BACKGROUND: one flat solid magenta colour #FF00FF, no gradient, no ground, no cast shadow, no frame,
no labels.
```

**להימנע:**

```text
face on the ship, eyes, mouth, school bus, existing spacecraft designs, rocket with fire, flames,
smoke, weapons, cannons, flags, letters, numbers, logos, plus signs, crosses, red cross, star icons,
ground, shadow, checkerboard background
```

**בדיקות קבלה:** נראית כמו כלי של מילה (כתום ושמנת), לא כמו כלי מסדרה או מהמציאות. בלי טקסט, בלי פרצוף, בלי אש. כולה בתוך הריבוע, עם שוליים.

---

## 4. העלאה

1. לכל פריט: תיקייה משלו בריפו הפרטי `YuvalNag/nagmon-data`, בתוך `art_inbox/<slug>/`. בדף של GitHub: **Add file ← Upload files**, וגוררים את הקבצים.
2. שמות הקבצים בדיוק כמו בכל פריט:

| פריט | תיקייה | קבצים |
|---|---|---|
| מילה בחליפת חלל | `art_inbox/nagmon_mila_space/` | `map.png`, ‏`battle.png` |
| הינשוף בקסדה | `art_inbox/nagmon_owl_space/` | `map.png`, ‏`battle.png` |
| האסטרונומית | `art_inbox/nagmon_astronomer/` | `map.png`, ‏`battle.png` |
| המהנדסת של בסיס הירח | `art_inbox/nagmon_moon_engineer/` | `map.png`, ‏`battle.png` |
| נהג הרכב במאדים | `art_inbox/nagmon_rover_driver/` | `map.png`, ‏`battle.png` |
| הרב שלמה | `art_inbox/nagmon_rav_shlomo/` | `map.png` |
| האישה בברדס האפור | `art_inbox/nagmon_grey_hood/` | `map.png` |
| 9 החיות | `art_inbox/<slug>/`: ‏`moonlet`, ‏`crescento`, ‏`sunling`, ‏`flaron`, ‏`rustlet`, ‏`marsimo`, ‏`ringlet`, ‏`saturnio`, ‏`zoomet` | `monster.json`, ‏`front.png`, ‏`back.png`, ‏`icon.png` |
| הירח | `art_inbox/tiles_moon/` | `tiles.png` |
| מאדים | `art_inbox/tiles_mars/` | `tiles.png` |
| חלל | `art_inbox/tiles_space/` | `stars.png` |
| תחנת החלל | `art_inbox/tiles_station/` | `tiles.png` |
| החללית | `art_inbox/shuttle_space/` | `ship.png` (ואם יש, `ship_open.png`) |

3. PNG בלבד, ברקע מג'נטה. אם המחולל נותן JPG, להמיר ל־PNG לא עוזר: עדיף לבקש שוב PNG.
4. את ה־`monster.json` מעתיקים מהבלוק של החיה. מותר לשנות שם או תיאור, עד 120 תווים.
5. אפשר להעלות חלק, ולא הכול בבת אחת. בכל פעם כותבים לי **"העלתי"**.

**מה אני עושה אחרי "העלתי":**

- בודק כל קובץ: גודל, פריסה, רקע, כיוונים, צניעות, סמלים (רשימת הבדיקה של §2.1).
- מוסיף רשומה ל־`tools/art/manifest.yaml` ומייבא ל־HD. חיה: לפי ADD_MONSTER §5. אריחים: חיתוך, הקטנה ו־TSX (§3.3.0).
- מראה את התוצאה באלבום הדמויות לאישור, ורק אחרי האישור היא נכנסת למשחק.
- המקורות נשמרים ב־`art_sources/` (לא נכנסים לאפליקציה).

## 5. פתוח

- **שמות:** השמות של החיות (בעיקר "שמשי" במקום "שמשון קטן"), השמות הפרטיים של האסטרונומית, המהנדסת והנהג, והשם של האישה בברדס האפור: החלטה של ההורה.
- **המפות של האזורים** (`solar_moon`, ‏`solar_sun`, ‏`solar_rocky`, ‏`solar_giants`): תוכנית, עד שהמפות ייבנו ב־M7.
- **אייקון אחד או שניים:** בגיליון החיה במשחק יש שני פריימים לתפריט. ADD_MONSTER מבקש `icon.png` אחד. אם רוצים קפיצה בתפריט, אפשר להעלות גם `icon2.png`, אותו ראש קצת למעלה.
- **הינשוף:** משקפיים רק בקרב, כמו היום. אם ההורה מעדיף משקפיים גם במפה, מוסיפים לשורה של הדמות "thin round glasses".
- **מילה:** בשמלה של היום יש סימנים קטנים שדומים ל־"+". בחליפה הם יוחלפו בנקודות, אבל השמלה עצמה לא משתנה כאן.
