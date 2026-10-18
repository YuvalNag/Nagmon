# SDD: מנוע הלמידה (WP2)

> הרכיב `nagmon.learning`: מודל השאלה, דירוג Elo, חזרה מרווחת, בחירת השאלה הבאה, שליטה וכוכבים, מטבעות, יומן ודשבורד, וכל מחוללי החשבון, הגאומטריה וההיגיון.
> Python טהור: בלי pygame ובלי tuxemon. החוזים בסעיפים 3–4 של `SDD_ARCHITECTURE.md` נשמרים כלשונם. כל הרחבה מסומנת כאן ב־**(הרחבה)**.

## 1. סקירה: מה קיים

- **בריפו:** אין עדיין קוד נגמון. יש שלושה מסמכים: `GAME_PLAN.md` (עקרונות, לולאות, מנוע), `SDD_ARCHITECTURE.md` (חוזים) ו־`SDD_CONTENT.md` (פורמט YAML).
- **מה נלקח מהם:**
  - רמה אישית לכל מיומנות, ויעד הצלחה של 75–80% (Math Garden);
  - Elo עם מהירות ו־K דינמי;
  - Leitner בחמש קופסאות (1, 3, 7, 14, 30 ימים);
  - בחירה 70/20/10;
  - מוקדי הורה;
  - כוכב רק משליטה אמיתית;
  - מטבעות שגדלים עם קושי ועם מקצוע חלש;
  - הסבר לכל שאלה ותיוג טעויות אופייניות;
  - יומן תשובות ודשבורד שבו כל מספר מוסבר.
- **מה משתנה מ־GAME_PLAN:**
  - הדירוג הוא בסולם logit (θ ו־b סביב 0), לא בסולם 1200. הסף `mastery.threshold` הוא הסתברות (0.8). קובץ ישן עם דירוג 1200 מומר במיגרציה (סעיף 10).
  - קבצי המיומנויות יושבים ב־`mods/nagmon/learning/skills/`, לפי SDD_CONTENT.

## 2. מבנה החבילה

```
nagmon/__init__.py
nagmon/learning/
  __init__.py        # ייצוא ה־API הציבורי
  model.py           # Choice, Figure, Question, CheckResult, check_answer
  rating.py          # Elo בסולם logit, זמן תגובה, K דינמי
  srs.py             # Leitner
  learner.py         # LearnerState ו־to_dict/from_dict עם schema_version
  content.py         # Skill, ContentLibrary, GeneratorRegistry, מחולל bank
  selector.py        # בחירת השאלה הבאה (70/20/10)
  engine.py          # LearningEngine, AnswerOutcome, SubjectProgress
  dashboard.py       # DashboardData: מספרים עם הסבר
  generators/
    common.py        # GenContext, בוני שאלות (מספר, בחירה, נכון/לא נכון)
    misconceptions.py  # קטלוג תגי טעויות: תיאור להורה ורמז לילד
    names.py         # שמות, חפצים ואימוג'י
    arithmetic.py  fractions.py  algebra.py  word_problems.py
    geometry.py  logic.py
mods/nagmon/learning/skills/{math,geometry,logic}.yaml
tests/nagmon/test_learning_*.py
```

## 3. מודל השאלה (`model.py`)

- החוזה מ־SDD_ARCHITECTURE §3 נשמר כמו שהוא. **(הרחבה)** שדה `meta: Mapping[str, Any]` ב־`Question`, וברירת המחדל שלו ריקה:
  - `seed`: הזרע שממנו נוצרה השאלה. כך אפשר לייצר אותה שוב בחזרה מרווחת;
  - `calc`: האופרנדים, כדי שהבדיקות יחשבו את התשובה בעצמן;
  - `fraction_form`: מדיניות שברים (ראו בהמשך);
  - `word`: מילה באנגלית, לדשבורד. בשימוש WP5.
- **(הרחבה)** סוגי `Figure` נוספים: `objects`, `pie`, `grid_path`, `coordinate`, `symmetry`, `pattern`, `grid_numbers`. נתוני הציור מפורטים בסעיף 13.
- `CheckResult(correct: bool, normalized: str | tuple[str, ...] | None, misconception: str | None)`.

**נרמול תשובות:**

| קלט | כלל |
|---|---|
| כל טקסט | `NFKC`. מוחקים סימני כיוון (U+200E, U+200F, U+202A–U+202E, U+2066–U+2069) וניקוד (U+0591–U+05C7). מכווצים רווחים וחותכים בקצוות |
| מספר | `"07"` = `"7"`, `"3.50"` = `"3.5"`, `"3.0"` = `"3"`, `".5"` = `"0.5"`, `"+5"` = `"5"`, `"−3"` (מינוס יוניקוד) = `"-3"`, `"-0"` = `"0"`, `"1,000"` = `"1000"`. פסיק שאחריו בדיוק 3 ספרות הוא מפריד אלפים. כל פסיק אחר הוא נקודה עשרונית (`"2,5"` = `"2.5"`). מותר `₪`, `%` ו־`°` בקצוות |
| שבר | `"1/2"`, וגם מספר מעורב `"1 1/2"` (= `3/2`). ההשוואה לפי ערך מדויק (`Fraction`) |
| מדיניות שברים | `meta["fraction_form"]`: `"value"` (ברירת מחדל): כל ייצוג שווה ערך נכון, למשל `2/4`, `1/2` ו־`0.5`. `"simplest"`: חייבים שבר מצומצם. `2/4` כש־`1/2` הוא התשובה נחשב שגוי, עם תג `not_simplified` |
| בחירה | מזהה (`"b"`), או טקסט הבחירה בעברית או באנגלית (בלי רגישות לאותיות גדולות) |
| נכון/לא נכון | המזהים `true` ו־`false`. מתקבלים גם `נכון`/`לא נכון`, `כן`/`לא`, `true`/`false`, `yes`/`no` |
| טקסט (`letters`) | casefold, בלי פיסוק בקצוות |
| סדר (`order`) | רצף מזהים. משווים tuple |

- **טעות אופיינית:** `misconceptions` ממפה תשובה שגויה לתג.
  - בשאלת בחירה, המפתח הוא מזהה הבחירה.
  - בשאלת מספר, המפתח הוא המספר המנורמל.

## 4. דירוג (`rating.py`)

**מודל:** `P(correct) = g + (1 − g) · σ(θ − b)`.
- `g` הוא הסיכוי לנחש:
  - בבחירה: `1/n`;
  - בנכון/לא נכון: `1/2`;
  - בסדר: `1/n!`;
  - בתשובה פתוחה: 0.
- θ: דירוג הילד במיומנות (לכל מיומנות בנפרד).
- b: הקושי האפקטיבי של הפריט, `q.difficulty + offset_הילד(item_id)`.

**θ התחלתי:** `clip(0.8 · (כיתת הילד − כיתת המיומנות), −2.4, 2.4)`.

**עדכון:**
- `S ∈ {0, 1}`, `E = P`.
- `θ ← θ + K_θ · w · (S − E)` ו־`b ← b − K_b · w · (S − E)`.
- המשקל `w`:
  - **רגיל:** 1;
  - **"לא יודע/ת"** (`dont_know`): `S = 0` ו־`w = 0.5`;
  - **נכון עם רמז:** `S = 1` ו־`w = 0.5`;
  - **בונוס מהירות** (רק כשהטיימר פעיל): `w = 1 + 0.5 · max(0, 1 − t/d)`, ורק לתשובה **נכונה**.
- אין עונש על איטיות, ואין קנס נוסף על טעות מהירה (עדכון מחקר הלמידה, במקום HSHS של Math Garden).
- כשהטיימר כבוי, זמן התגובה לא משפיע בכלל.

**טיימר:**
- `settings["timer"]`: ברירת המחדל פעיל מגיל 9, וכבוי מתחת לגיל 9.
- אם הגיל לא ידוע, הטיימר פעיל מכיתה ד' ומעלה.

**K דינמי:**
- `K(n) = k_min + (k_max − k_min) / (1 + n / n_half)`.
- לילד: `k_max=0.6`, `k_min=0.12`, `n_half=12`.
- לפריט: `k_max=0.4`, `k_min=0.05`, `n_half=20`.

**דדליין (שניות),** משמש רק לבונוס המהירות:
- בסיס לגיל 11: `choice 20`, `true_false 12`, `number 25`, `order 30`, `letters 30`, `tap_figure 15`.
- מכפיל גיל: `1 + 0.15 · (11 − age)`, בין 1 ל־2.

**offset לפריט:**
- נשמר לכל ילד, עד 4,000 פריטים.
- כשמתמלא, נמחקים הפריטים שלא נראו הכי הרבה זמן.
- מאגר משותף למשפחה הוא אופציונלי, ולא ממומש בשלב הזה.

## 5. חזרה מרווחת (`srs.py`)

- קופסאות 1..5. המרווחים: 1, 3, 7, 14 ו־30 ימים. השעון מוזרק (`clock`).
- **פריט חדש:** אם עונים נכון, הוא עובר לקופסה 2 (חוזר בעוד 3 ימים). אם טועים, הוא בקופסה 1 (חוזר בעוד יום).
- **פריט קיים:** אם עונים נכון, עולה קופסה (עד 5), ו־`due = now + interval(box)`. אם טועים, חוזר לקופסה 1 (+1 יום) ו־`lapses += 1`.
- **רמז:** תשובה נכונה עם רמז לא מקדמת. הפריט נשאר בקופסה, ו־`due` מתעדכן לפי הקופסה הנוכחית.
- **כרטיס:** `item_id`, `skill_id`, `seed`, `box`, `due`, `reviews`, `lapses`, `last`. ה־seed מאפשר לייצר מחדש את אותה שאלה.
- **אילו מיומנויות נכנסות:**
  - מיומנות עם `srs: true` ב־YAML (עובדות כמו לוח הכפל);
  - כל מיומנות `bank` (ברירת מחדל).

## 6. בחירת השאלה הבאה (`selector.py`)

**הגדרות** (`m` = נשלטה, `a` = "מונחת": כיתת המיומנות נמוכה מכיתת הילד, ואין סימן קושי):
- **מתקשה:** לפחות 5 ניסיונות, ודיוק מתחת ל־0.5 ב־10 האחרונים.
- **פתוחה (`unlocked`):** כל דרישות הקדם `m` או `a`.
- **חזית:** פתוחה, לא `m`, לא `a`, ו־(כיתה ≤ כיתת הילד, או שכבר נוסתה).
- **מתיחה (חדשה):** פתוחה, לא `m`, לא `a`, לא נוסתה, וכיתה > כיתת הילד. בוחרים קודם את הכיתה הנמוכה.

**יעדי הצלחה** (ניתנים לשינוי ב־`settings`):

| יעד | גיל 5–7 | גיל 8 ומעלה |
|---|---|---|
| `target_frontier`: חזית, מתיחה ושילוב | 0.875 (טווח 0.85–0.90) | 0.80 (טווח 0.78–0.82) |
| `target_review`: חזרה | 0.90 | 0.90 |

**סדר הבחירה:**
1. מגרילים דלי:
   - 70%: **חזית**;
   - 20%: **חזרה**. כרטיסי Leitner שהגיע זמנם, או מיומנות שנשלטה ולא תורגלה 14 יום;
   - 10%: **מתיחה**.
   - אם הדלי ריק, עוברים לדלי הבא בסדר חזית → חזרה → מתיחה → כל מיומנות זמינה.
2. **שילוב (interleaving)** בהקשר `battle`: 30% מבחירות החזית הן **שילוב**. במקום מיומנות החזית, בוחרים מכל המיומנויות שהילד כבר פגש באותו מקצוע (כולל כאלה שנשלטו). המשקל עולה ככל שעבר יותר זמן מהתרגול האחרון.
3. **מבחן בוס** (`context="boss"`, `skill_ids=[...]`):
   - שאלות מעורבות מתוך קבוצת המיומנויות;
   - כל פעם בוחרים מיומנות שנשאלה הכי מעט במבחן הנוכחי;
   - יעד ההצלחה הוא `target_frontier`;
   - בלי דוגמה פתורה.
4. **דוגמה פתורה קודם:**
   - בפגישה הראשונה של הילד עם מיומנות (0 ניסיונות, ולא הוצגה לו דוגמה), השאלה חוזרת עם `meta["worked_example"] = True`. הממשק מציג את ההסבר **לפני** המענה.
   - פעם אחת בלבד לכל מיומנות (`learner.worked_examples`).
   - תשובה לדוגמה פתורה נרשמת ביומן, אבל לא מעדכנת דירוג, שליטה או Leitner.
   - אפשר לכבות: `settings["worked_examples"] = False`.
5. **בחירת מיומנות בחזית:**
   - משקל `w = (0.2 + exp(−((p₀ − T)/0.15)²)) · (1 + 0.5·טעויות_אופייניות_אחרונות)`, כש־`p₀ = σ(θ)` (פריט ממוצע) ו־T הוא יעד החזית.
   - מוקד הורה (`settings["focus"]`: מזהים או קידומות): כשיש מוקד זמין, ב־60% מהפעמים בוחרים רק מתוכו, גם אם המיומנות נשלטה או מונחת. ובכל מקרה המשקל שלו ×4.
6. **בחירת פריט:**
   - מייצרים 6 מועמדים מזרעים שונים, ומדלגים על פריטים מתוך `N=8` האחרונים.
   - בוחרים את המועמד שהסיכוי הצפוי שלו הכי קרוב ליעד. כרטיס Leitner שהגיע זמנו נוצר מחדש מה־seed שלו.
   - `difficulty_bias` מוסיף ל־b בהערכה. ערך חיובי = שאלות קשות יותר (למשל ללכידת מפלצת חזקה).
7. **מסננים:**
   - `subject`, `skill_id` ו־`skill_ids` מהקריאה;
   - `settings["subjects"]`: המקצועות הפעילים של הילד.

## 7. שליטה, כוכבים, מטבעות, רמז ורצף (`engine.py`)

**שליטה:**
- `mastery: {min_attempts=12, threshold=0.8}` (ברירת מחדל, ניתן לשינוי לכל מיומנות).
- נשלטת כשמתקיימים שלושה תנאים:
  - `n ≥ min_attempts`;
  - `θ ≥ logit(threshold)`, כלומר פריט ממוצע נפתר בסיכוי 80% לפחות;
  - דיוק ≥ threshold ב־10 הניסיונות האחרונים.
- כל שליטה חדשה מוסיפה ⭐ למקצוע ונכנסת ל־`newly_mastered`. כוכב לא נלקח בחזרה (בלי דפוסים אפלים).

**איכות:**
- **טיימר כבוי** (ברירת המחדל מתחת לגיל 9): רק `correct` (×1.5) או `wrong` (×1.0).
- **טיימר פעיל:** `super` (×2.0) הוא **בונוס** לתשובה נכונה, בלי רמז, כש־`elapsed ≤ סף(סוג, גיל)`.
  - הסף לגיל 11: `choice 6`, `true_false 4`, `number 8`, `order 12`, `letters 12`, `tap_figure 6` שניות.
  - הסף מוכפל ב־`1 + 0.15·(11 − age)`, בין 1 ל־2.
  - תשובה איטית היא פשוט `correct`.

**לא יודע/ת:**
- `submit(q, None)` או `submit(q, ..., dont_know=True)`.
- התוצאה: `wrong`, בלי תג טעות, ועם ההסבר המלא (דוגמה פתורה).
- הדירוג מתעדכן בחצי משקל. Leitner מחזיר את הפריט לקופסה 1.

**רמז:**
- `engine.hint(q) -> Hint(text_he, eliminate)`:
  - בשאלת בחירה, פוסל אפשרות שגויה אחת;
  - בשאר הסוגים, נותן את הצעד הראשון של ההסבר (או `meta["hint_he"]`).
- `submit(..., hint_used=True)` עם תשובה נכונה:
  - נחשב נכון (לא שגוי), אבל לא super;
  - המטבעות יורדים לחצי;
  - הדירוג מתעדכן בחצי משקל;
  - Leitner לא מקדם.

**משוב:**
- כל `AnswerOutcome` כולל `correct_answer`, התשובה בצורת תצוגה. **(הרחבה)**
- הוא כולל גם `explanation_he` עם הצעד המלא. ההסברים במחוללים מראים את החישוב, לא רק את התוצאה.

**מטבעות:**
- תשובה נכונה: `1 + round(3·(1 − p))`, כש־p הוא הסיכוי הצפוי לפני התשובה.
  - בונוס מקצוע חלש: +2.
  - בונוס super: +1.
  - עם רמז: חצי מהסכום, ולפחות 1.
  - דוגמה פתורה: 1.
- תשובה שגויה: 0.
- **מקצוע חלש:** מקצוע פעיל ששיעור השליטה שלו קרוב למינימום (עד 0.02 מעליו). חל רק כשהפער בין המקצועות הוא 0.05 לפחות.

**רצף:**
- `streak`: "קומבו" של תשובות נכונות **בתוך הסשן בלבד**, למד הידע בקרב.
- נשמר במנוע ולא בפרופיל. שגיאה או "לא יודע/ת" מאפסים אותו.
- אין רצף יומי במנוע. יעדים שבועיים שייכים למודול המשפחה.

**טעות אופיינית:**
- נרשמת ביומן ובמונה לכל מיומנות.
- `AnswerOutcome.explanation_he` = רמז הטעות מהקטלוג + ההסבר של השאלה.
- המונה מגביר את משקל המיומנות בבחירה (תרגול ממוקד).

## 8. מצב הלומד (`learner.py`)

**`LearnerState`:**
- `learner_id`, `name`, `grade`, `age`, `settings`;
- `skills: {skill_id: SkillStats(theta, n, correct, last, recent[≤20], misconceptions{tag: n})}`;
- `items: {item_id: ItemStats(b_offset, n, last)}`;
- `srs: LeitnerDeck`;
- `mastered: {skill_id: ts}`;
- `stars: {subject: n}`;
- `log: deque(maxlen=5000)`;
- `words: {word: first_ts}`;
- מונים: `coins_total`, `answers_total`, `correct_total`, `time_total_s`;
- `worked_examples`: המיומנויות שכבר הוצגה בהן דוגמה פתורה.

**`settings` מוכרים:**
- `subjects` (מקצועות פעילים);
- `focus` (מוקדי הורה);
- `timer`;
- `target_frontier` ו־`target_review`;
- `worked_examples`;
- `recent_n`.

## 9. ContentLibrary (`content.py`)

**טעינה:** `ContentLibrary.load(path, registry=None)` טוען את `skills/*.yaml` לפי SDD_CONTENT §2, ואת המאגרים שמוזכרים ב־`params.bank` לפי §3. מאגר יכול להיות `{skill, items}`, או רשימת קטעי קריאה עם `questions` (§5).

**אימות.** כל שגיאה נאספת, ובסוף נזרקת `ContentError` עם הרשימה המלאה:
- `id` כפול;
- מחולל לא רשום;
- דרישת קדם חסרה;
- מעגל בגרף;
- כיתה מחוץ ל־0..9;
- תחילית `id` שלא מתאימה ל־`subject`;
- `threshold` מחוץ ל־(0,1);
- פריטי מאגר: `id` כפול, `answer` מחוץ לטווח, בחירות כפולות, `true_false` בלי `answer: true/false`, אורכים (שאלה עד 140, בחירה עד 40, הסבר עד 200), ניקוד.

**מחולל `bank`:**
- בוחר פריט לפי ה־rng, עם סינון לפי `tags` אם הוגדרו.
- `true_false` מקבל את הבחירות `נכון`/`לא נכון` אוטומטית.
- `order` מערבב את הבחירות. התשובה היא רצף המזהים.

## 10. סריאליזציה ומיגרציה

- `to_dict()` מחזיר dict שאפשר לשמור כ־JSON, עם `schema_version = 1`.
- `from_dict()` קורא ל־`migrate()` לפני הטעינה:
  - **v0** (פורמט GAME_PLAN: בלי `schema_version`):
    - `ratings` בסולם 1200 → `θ = (r − 1200) · ln10 / 400`;
    - `leitner: {item: box}` → כרטיסים שזמנם הגיע;
    - `log` עם `ok` → `correct`;
    - `stars` נשמר.
  - **גרסה עתידית** (גדולה מ־1): נזרקת `ValueError`, כדי לא להרוס נתונים.

## 11. דשבורד (`dashboard.py`)

- כל מספר הוא `Stat(value, explanation_he)`.
- **לכל מקצוע:**
  - דיוק ב־7 וב־30 הימים האחרונים ("75% הצלחה = 30 נכונות מתוך 40 ב־7 הימים האחרונים");
  - מספר תשובות;
  - זמן מענה;
  - מיומנויות שנשלטו;
  - כוכבים.
- **כללי:**
  - זמן מענה ב־7 וב־30 יום;
  - מיומנויות שנשלטו (עם תאריך);
  - מיומנויות שבהן יש קושי: לפחות 6 ניסיונות ב־30 יום ודיוק מתחת ל־60%, עם עד 3 תגי טעות ותיאור להורה;
  - מילים חדשות באנגלית מ־7 הימים האחרונים.

## 12. קטלוג המחוללים

כל מחולל הוא `(rng, params, ctx) -> Question` ודטרמיניסטי לפי ה־rng. הפריט נקבע לפני שבוחרים סוג תשובה, ולכן `item_id` יציב.

**סוג התשובה:**
- `params.kind`: `auto` / `choice` / `number`.
- ב־`auto`:
  - בחירה אם `max_choices` הוגדר, או שהגיל עד 7;
  - אחרת, בחירה ב־60% מהמקרים.
- **מספר האפשרויות:** 3 עד גיל 6 (או בגן), אחרת 4, ולא יותר מ־`max_choices`.

| מחולל | params עיקריים | טעויות אופייניות |
|---|---|---|
| `arithmetic.count` | `max` | off_by_one |
| `arithmetic.recognize` | `max` | number_neighbor |
| `arithmetic.compare` | `max` | compare_first_digit, compare_reversed |
| `arithmetic.neighbors` | `max` | off_by_one, before_after |
| `arithmetic.add` | `max_sum`, `carry: none/allowed/required`, `min_sum` | forgot_carry, sub_instead_of_add, off_by_one |
| `arithmetic.sub` | `max`, `borrow` | smaller_from_larger, add_instead_of_sub, borrow_not_reduced |
| `arithmetic.missing_addend` | `max_sum` | added_instead, off_by_one |
| `arithmetic.even_odd` | `max` | even_odd_first_digit |
| `arithmetic.place_value` | `max` | place_value_confusion |
| `arithmetic.rounding` | `to`, `max` | rounding_down_always, rounding_wrong_place |
| `arithmetic.mul_facts` | `tables`, `max_factor` | table_neighbor, add_instead_of_mul |
| `arithmetic.div_facts` | `tables` | div_mul_confusion, table_neighbor |
| `arithmetic.mul_multi` | `a_digits`, `b_digits` | forgot_carry, partial_product_shift |
| `arithmetic.div_remainder` | `max_divisor`, `max_quotient` | remainder_ignored, remainder_too_big |
| `arithmetic.div_long` | `dividend_digits` | quotient_zero_dropped |
| `arithmetic.order_ops` | `level` | order_left_to_right, parens_ignored |
| `arithmetic.money_count` | `max` | count_coins_not_value |
| `arithmetic.money_change` | `max`, `agorot` | change_added, off_by_one |
| `arithmetic.clock` | `step` | clock_hands_swapped, clock_hour_off |
| `arithmetic.pattern` | `kind: skip/back` | sequence_off_step |
| `arithmetic.divisibility` | `divisors` | divisibility_last_digit |
| `arithmetic.average` | `count`, `max` | avg_forgot_divide |
| `fractions.identify` | `max_den`, `figure` | fraction_complement, fraction_part_over_rest |
| `fractions.compare` | `mode` | fraction_bigger_den_bigger |
| `fractions.equivalent` | `max_den` | fraction_add_same |
| `fractions.of_quantity` | `max_den` | fraction_divide_only |
| `fractions.addsub` | `same_den`, `op` | fraction_add_across, fraction_den_kept_wrong |
| `fractions.mul_whole` | — | fraction_mul_den |
| `decimals.compare` | `places` | decimal_longer_bigger |
| `decimals.addsub` | `places` | decimal_misalign |
| `decimals.mul_pow10` | — | decimal_shift_wrong_way |
| `decimals.muldiv` | — | decimal_places_count |
| `percent.of` / `percent.discount` / `percent.change` | — | percent_as_number, discount_not_subtracted, percent_change_base |
| `ratio.share` | — | ratio_reversed, ratio_parts_total |
| `algebra.negative` | `op` | negative_sign_error, neg_times_neg |
| `algebra.powers` | `kind: power/sqrt/laws/scientific` | power_as_multiply, sqrt_half, exponent_multiply |
| `algebra.equation` | `kind: one_step/two_step/both_sides` | equation_inverse_op, equation_divide_first |
| `algebra.substitute` | — | substitute_concat |
| `algebra.linear` | `kind: value/slope` | slope_intercept_swap |
| `algebra.root_estimate` | — | sqrt_half |
| `word.problem` | `ops`, `max` | wrong_operation |
| `geometry.size_compare` | — | — |
| `geometry.shape_identify` | `shapes` | shape_confusion |
| `geometry.polygon_count` | `what: sides/vertices` | vertices_sides_confusion |
| `geometry.triangle_classify` | `by: sides/angles` | triangle_type_confusion |
| `geometry.quad_classify` | — | quad_hierarchy |
| `geometry.angle_type` | `include_straight` | angle_type_confusion |
| `geometry.angle_pair` | `kind: right/supplementary/vertical/complementary` | used_90_not_180 |
| `geometry.triangle_sum` | — | used_360 |
| `geometry.polygon_angle_sum` | — | polygon_n_times_180 |
| `geometry.grid_perimeter` / `geometry.grid_area` | `max` | area_perimeter_confusion |
| `geometry.perimeter` | `shape` | half_perimeter |
| `geometry.area` | `shape: rectangle/triangle/parallelogram/trapezoid/circle` | triangle_area_no_half, circle_radius_diameter, area_perimeter_confusion |
| `geometry.circumference` | — | circle_area_circumference |
| `geometry.volume` | `shape: box/cube` | volume_add_dims |
| `geometry.symmetry` | — | symmetry_count |
| `geometry.solid_identify` / `geometry.solid_count` / `geometry.euler` | — | faces_edges_confusion |
| `geometry.coordinates` | `kind: read/quadrant/distance` | coordinate_swap, quadrant_confusion |
| `geometry.pythagoras` | `find: hyp/leg` | pythagoras_no_root, pythagoras_add_sides |
| `geometry.units` | `kind` | units_factor |
| `geometry.similarity` | `find: side/area` | similarity_add, area_ratio_linear |
| `logic.pattern_repeat` | `kinds` | pattern_wrong_unit |
| `logic.odd_one_out` | `mode: emoji/numbers` | — |
| `logic.sequence` | `kinds` | sequence_off_step, sequence_add_vs_mul |
| `logic.sudoku` | `mode: row/grid` | sudoku_row_only |
| `logic.analogy` | — | analogy_add_vs_mul |
| `logic.balance` | — | balance_total |
| `logic.robot_end` / `logic.robot_program` / `logic.robot_loop` | `size`, `steps` | robot_left_right, robot_skip_last |
| `logic.statements` | — | converse_error |
| `bank` | `bank`, `tags` | לפי המאגר |

## 13. מפרטי Figure

```
objects      {emoji, count}
clock        {hour, minute}
pie|bar_model {parts, shaded}
number_line  {min, max, marks, point}
polygon      {points:[[x,y]], labels:{side_i|angle_i: text}, grid: bool, name}
circle       {r, show: radius|diameter, label}
angle        {degrees, rotation, label}
grid_area    {width, height, cells:[[x,y]]}
solid        {name, dims}
coordinate   {range, points:[{x, y, label}]}
grid_path    {width, height, start:[x,y], moves:[R|L|U|D], repeat, marks:{label:[x,y]}}
pattern      {items:[emoji|"?"]}
grid_numbers {grid:[[n|null]], target:[r,c]}
symmetry     {shape}
```

**מערכת הצירים:** y עולה כלפי מעלה, ו־R היא ימינה על המסך.

## 14. טבלת בדיקות

| id | תרחיש | צפוי |
|---|---|---|
| M1 | `check_answer` במספר: `"07"`, `" 7 "`, `"+7"` | נכון, normalized=`"7"` |
| M2 | `"3.50"`, `"3,5"`, `"1,000"`, `"−3"`, `".5"` | שווים ל־`3.5`, `3.5`, `1000`, `-3`, `0.5` |
| M3 | שבר במדיניות value: `"2/4"`, `"0.5"` מול `"1/2"` | נכון |
| M4 | מדיניות simplest: `"2/4"` מול `"1/2"` | שגוי, `misconception=not_simplified` |
| M5 | מספר מעורב `"1 1/2"` מול `"3/2"` | נכון |
| M6 | בחירה לפי מזהה, טקסט עברי או אנגלי. תשובה שגויה ממופה | נכון/שגוי, ותג הטעות מוחזר |
| M7 | נכון/לא נכון: `"נכון"`, `"true"`, `"כן"` | נכון |
| M8 | טקסט עם ניקוד, סימני RTL ורווחים | מנורמל ונכון |
| M9 | `order`: רצף מזהים | נכון רק בסדר המדויק |
| M10 | קלט לא מספרי בשאלת מספר | שגוי, normalized=None |
| R1 | `p_correct` עם g=0.25 ו־θ=b | 0.625 |
| R2 | `k_factor` | יורד מונוטונית ונשאר ≥ k_min |
| R3 | עדכון בינארי | נכון מעלה θ ומוריד b. שגוי הפוך |
| R4 | מהירות (טיימר פעיל) | נכון מהיר מזיז יותר מנכון איטי. שגוי מהיר = שגוי איטי. בלי טיימר הזמן לא משפיע |
| R5 | חצי משקל: "לא יודע/ת" ונכון עם רמז | השינוי בדירוג הוא חצי מהשינוי הרגיל |
| R6 | התכנסות: לומד מדומה עם θ* ∈ {−1, 0, 1.5}, 300 תשובות | ממוצע של 5 זרעים, `|θ̂ − θ*| < 0.6` |
| R7 | `initial_theta` | לפי פער כיתות, חסום ב־±2.4 |
| S1 | פריט חדש: נכון / שגוי | קופסה 2 (+3 ימים) / קופסה 1 (+1 יום) |
| S2 | נכון ברצף | 2→3→4→5. נשאר ב־5, המרווח 30 יום |
| S3 | שגוי בקופסה 4 | קופסה 1, lapses=1 |
| S4 | `due()` עם שעון מוזרק | רק פריטים שזמנם הגיע, הכי באיחור קודם |
| S5 | סריאליזציה של החפיסה | הלוך ושוב זהה |
| SEL1 | התפלגות דליים ב־3,000 בחירות | חזית ≈70%, חזרה ≈20%, מתיחה ≈10% (±5%) |
| SEL2 | סינון מקצוע ו־`settings.subjects` | רק המקצוע המבוקש |
| SEL3 | מוקד הורה | לפחות 55% מהשאלות במוקד |
| SEL4 | חזרה על פריט | אין חזרה בתוך N=8 האחרונים (במיומנות עם הרבה פריטים) |
| SEL5 | יעדי הצלחה לפי גיל | ברירת המחדל: 0.80 (גיל 8 ומעלה), 0.875 (גיל 5–7), חזרה 0.90. ממוצע הסיכוי הצפוי בחזית קרוב ליעד (±0.07). `settings` דורסים |
| SEL6 | מיומנות נעולה (קדם לא נשלט, כיתה גבוהה) | לא נבחרת בחזית |
| SEL7 | לומד מדומה, 600 שאלות | אחוז הצלחה ב־300 האחרונות בין 0.70 ל־0.90 |
| SEL8 | שילוב בקרב | בהקשר battle, חלק מהשאלות ממיומנויות שכבר נפגשו ולא מהחזית |
| SEL9 | בוס | `skill_ids` בלבד, התפלגות מאוזנת (הפרש של שאלה אחת לכל היותר) |
| SEL10 | דוגמה פתורה | מיומנות חדשה: השאלה הראשונה מסומנת `worked_example`, פעם אחת בלבד |
| E1 | גיל 10 עם טיימר: נכון מהר / נכון לאט / שגוי | super ×2.0 / correct ×1.5 / wrong ×1.0 ו־0 מטבעות |
| E1b | גיל 6 (בלי טיימר): נכון מהר | correct ×1.5, אף פעם לא super |
| E2 | סף super לפי גיל | הסף בגיל 9 גבוה יותר מבגיל 11 |
| E3 | רמז | `hint()` פוסל בחירה שגויה. נכון עם רמז: correct, לא super, מטבעות מופחתים, הרצף לא מתאפס |
| E3b | "לא יודע/ת" (`given=None`) | wrong, בלי תג טעות, הסבר מלא, `correct_answer` מוחזר |
| E4 | מטבעות | פריט קשה > פריט קל. מקצוע חלש מקבל +2 |
| E5 | רצף בסשן | עולה עם תשובות נכונות ומתאפס בשגיאה. לא נשמר ב־LearnerState |
| E6 | שליטה | לא לפני min_attempts. אחריה `newly_mastered` ו־⭐+1, פעם אחת בלבד |
| E7 | טעות אופיינית | נרשמת. ההסבר כולל את הרמז |
| E8 | יומן | לא עובר 5,000 רשומות |
| E9 | `subject_progress` | mastery, כוכבים וחזית עקביים |
| E10 | ביצועים | `next_question` בממוצע מתחת ל־5ms (תוכן אמיתי) |
| E11 | Leitner במיומנות srs | נוצר כרטיס, ושאלת החזרה זהה (seed) |
| L1 | סריאליזציה הלוך ושוב | זהה, ו־JSON תקין |
| L2 | מיגרציה מ־fixture של v0 | θ מומר, הכרטיסים והיומן נשמרים, `schema_version=1` |
| L3 | גרסה עתידית | ValueError |
| C1 | טעינת התוכן האמיתי | עובר אימות. לפחות 55 מיומנויות חשבון, 28 גאומטריה ו־12 היגיון. כל כיתה מ־0 עד 9 מכוסה |
| C2 | id כפול | ContentError |
| C3 | מחולל לא ידוע | ContentError |
| C4 | דרישת קדם חסרה | ContentError |
| C5 | מעגל בגרף | ContentError |
| C6 | מאגר: true_false אוטומטי, answer מחוץ לטווח, בחירות כפולות | אוטומטי עובד. השגיאות נתפסות |
| C7 | כל מיומנות × 40 זרעים | שאלה תקינה |
| G1 | כל מחולל × 200 זרעים | התשובה בין הבחירות, בחירות ייחודיות, הסבר לא ריק, אורכים, בלי ניקוד |
| G2 | חישוב בלתי תלוי מ־`meta.calc` | התשובה זהה |
| G3 | דטרמיניזם | אותו זרע = אותה שאלה |
| G4 | מסיחים | חיסור עם פריטה כולל את מסיח "קטן מגדול" עם התג |
| D1 | דשבורד | דיוק, זמן ומספרים נכונים, עם הסבר לכל מספר |
| D2 | מתקשה | המיומנות מופיעה עם תגי הטעות |
| D3 | מילים באנגלית | מילה ב־`meta.word` שנענתה נכון מופיעה |

## 15. החלטות פתוחות

- מאגר b משפחתי משותף: לא בשלב הזה. offset לכל ילד מספיק.
- WP5 ירשום את `english.vocab` ב־`GeneratorRegistry` לפני `load`. בלי זה, טעינת `english.yaml` תיכשל באימות, וזה מכוון.
