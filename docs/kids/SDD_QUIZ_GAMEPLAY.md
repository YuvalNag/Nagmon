# SDD: שאלות בתוך המשחק (WP7)

## 1. מה קיים

- **בחירת התקפה:** `MainCombatMenuState.open_technique_menu`, ובתוכה `enqueue_technique` (`states/combat_menus.py:593`), שקוראת ל־`combat_session.enqueue_action`. פריטים עוברים דרך `enqueue_item` (`combat_menus.py:320`).
- **נזק:** אפקט `damage` (`core/effects/damage.py`) קורא ל־`formula.simple_damage_calculate(tech, user, monster)`. הנוסחה כבר מקבלת `additional_factors` ומכפילה בו, ואף אחד לא מעביר אותו.
- **פגיעה:** `combat_session.get_tech_hit(user)` מגריל פעם אחת לכל מפלצת בכל תור. `set_tech_hit(user, 0.0)` מבטיח פגיעה.
- **לכידה:** אפקט `capture` (`core/effects/capture.py`) מחשב `tuxeball_modifier` ואחריו `shake_check`.
- **משתני קרב:** `combat_session.set_variable` ו־`get_variable`.
- **הודעות:** `TechEffectResult.extras` ו־`ItemEffectResult.extras` הם msgids שמתורגמים ומוצגים בהודעת הקרב (`combat_state.py:667`, `813`).
- **דריסת אפקטים:** `mods/<mod>/effects/*.py` דורס אפקט ליבה בעל אותו `name`.
- **ממשק:** `MinigameState` (PygameMenuState) הוא תבנית לשאלה רב־ברירה עם תמונה.

## 2. העיצוב

### 2.1 וו קטן במנוע (שינוי יחיד ב־`combat_menus.py`)
- שתי מתודות חדשות ב־`MainCombatMenuState`. ברירת המחדל קוראת ל־`proceed()` מיד, ולכן Tuxemon הרגיל לא משתנה:
  - `before_enqueue_technique(technique, target, proceed)`;
  - `before_enqueue_item(item, target, proceed)`.
- `enqueue_technique` ו־`enqueue_item` מעבירים את ההמשך (`enqueue_action`, סגירת תפריטים) כ־`proceed`.

### 2.2 `MainCombatMenuState` של nagmon (דריסה ב־mod)
- **`before_enqueue_technique`:**
  - אם אין פרופיל פעיל, נגמרה מכסת השאלות לקרב, או שזו התקפה שלא גורמת נזק: `proceed()`.
  - אחרת: המקצוע נקבע לפי סוג ההתקפה (`subjects.yaml` או `profile.settings.element_subjects`), ונדחף `QuizState(context="battle", subject=..., on_result=...)`.
  - **`on_result(outcome)`:**
    1. `set_variable(f"quiz_mult_{monster.instance_id}", outcome.power_multiplier + combo_bonus)`;
    2. אם התשובה נכונה: `set_tech_hit(monster, 0.0)`;
    3. מטבעות לשחקן (`modify_money`), הודעת ⭐ אם נשלטה מיומנות, `runtime.persist()`;
    4. `proceed()`.
  - **"התקפה רגילה ⏩"** (דילוג) מחזיר outcome של דילוג: מכפיל 1.0, בלי עונש. זו האפשרות "מהירה" מהתוכנית, בלי לחיצה נוספת בכל תור.
  - **רצף:** כל 3 תשובות נכונות ברצף (`outcome.streak % 3 == 0`) מוסיפות `+0.5` למכפיל, עם ההודעה "מכת-על!".
- **`before_enqueue_item`:**
  - **כדור לכידה:** `QuizState(context="capture")`. נכון = מכפיל לכידה 1.6.
  - **מפלצת נדירה** (`catch_rate` < 50): שרשרת של 3 שאלות. המכפיל הוא `1 + 0.4 × מספר התשובות הנכונות`.

### 2.3 אפקטים של nagmon
- **`mods/nagmon/effects/damage.py`** (`name="damage"`): זהה לליבה, עם שלושה שינויים:
  - קורא את `quiz_mult_<id>` ומוחק אותו אחרי השימוש;
  - מעביר `additional_factors={"quiz": m}`;
  - מוסיף ל־extras את `quiz_super`, `quiz_critical` או `quiz_combo`.
- **`mods/nagmon/effects/capture.py`** (`name="capture"`): זהה לליבה, ומכפיל את `tuxeball_modifier` ב־`quiz_capture_mult`.

### 2.4 `QuizState` (PygameMenuState)
- **פרמטרים:** `question=None, subject=None, skill_id=None, context="battle", on_result=None, allow_skip=True, chain=1`.
- **מבנה המסך:**
  - כותרת המקצוע וצבעו;
  - השאלה בעברית, והשורה באנגלית לפי סולם השפה;
  - איור (Figure) שמצויר ל־Surface ע"י `nagmon_ui/figures.py`: מצולע, זווית, גריד שטח, שעון, ציר מספרים, מודל פסים, עיגול;
  - תמונת אימוג'י (Twemoji) לבחירות;
  - כפתורי תשובה גדולים, 2–4 לפי גיל;
  - לשאלות מספר: מקלדת מספרים על המסך (0–9, נקודה, שבר, מחיקה, אישור);
  - כפתורים: "💡 רמז", "🤷 לא יודע/ת", "⏩ התקפה רגילה" (רק בקרב).
- **ניווט:** מקשים 1–4, חצים, Enter, עכבר.
- **דוגמה פתורה** (`worked_example`): ההסבר מוצג לפני השאלה ("הינשוף מראה איך").
- **אחרי תשובה:**
  - חלון משוב: נכון או לא, התשובה הנכונה, וצעד הפתרון (`explanation_he`).
  - מטבעות שהתקבלו, וכוכב אם נשלטה מיומנות.
  - לחיצה סוגרת את החלון וקוראת ל־`on_result`.
- **טיימר:** מוצג רק אם `settings.timer` דלוק (גיל 9 ומעלה). פס עדין, בלי עונש.

### 2.5 פעולות ותנאים בסקריפטים (`mods/nagmon/event/...`)
- `ask_quiz <subject_or_skill>,<var>[,context]` ← `var` = `super|correct|wrong|skip`. הפעולה חוסמת עד שהמסך נסגר.
- `award_coins <n>`, `show_stars`.
- **תנאים:**
  - `skill_at_least <skill>,<rating>`;
  - `stars_at_least <subject>,<n>`;
  - `language_level_at_least <n>`;
  - `profile_grade_at_least <n>`.

### 2.6 חנות: "קופה"
- `ask_quiz math.money.change,var,shop` לפני קנייה. נכון = הנחה של 10%.
- מימוש בשלב העולם (WP10) דרך סקריפט ה־NPC, בלי לשנות את מנגנון החנות.

## 3. טבלת בדיקות (`tests/nagmon/test_quiz_*.py`)

| # | תרחיש | צפוי |
|---|---|---|
| 1 | וו במנוע, ברירת מחדל | `enqueue_action` נקרא מיד, כמו קודם |
| 2 | דריסת nagmon בלי פרופיל פעיל | `proceed` מיד |
| 3 | עם פרופיל, התקפת נזק | `QuizState` נדחף עם המקצוע של סוג ההתקפה |
| 4 | `on_result` נכון (גיל 7) | `quiz_mult` = 1.5, `tech_hit` = 0, נוספו מטבעות |
| 5 | דילוג | `quiz_mult` = 1.0, אין שינוי בדירוג |
| 6 | רצף 3 | `quiz_mult` = 2.0 (1.5 + 0.5), extras כולל `quiz_combo` |
| 7 | אפקט damage עם `quiz_mult` = 1.5 | הנזק = נזק בסיס × 1.5 (±1 עיגול), והמשתנה נמחק |
| 8 | אפקט damage בלי משתנה | זהה לליבה |
| 9 | capture עם מכפיל 1.6 | `tuxeball_modifier` מוכפל |
| 10 | מכסת שאלות לקרב (3) | השאלה הרביעית לא נשאלת |
| 11 | `QuizState` headless: choice, number, figure | נבנה בלי חריגות. לחיצה על התשובה הנכונה קוראת ל־`on_result` עם `correct` |
| 12 | `ask_quiz` בסקריפט | המשתנה נקבע ל־`correct`/`wrong` |
| 13 | ציורי Figure: כל סוג | Surface לא ריק ובגודל מבוקש |
