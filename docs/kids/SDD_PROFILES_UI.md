# SDD: מסך "מי משחק", אשף ילד חדש ושער הורים (WP6)

## 1. מה קיים

- **סדר העלייה** (`startup_state_machine.py`): Background → Intro (ממנו `replace_state("StartState")`) → Splash → כללי mod (`mod.yaml: startup_rules`).
- **`StartState`** (`tuxemon/states/start.py:55`) הוא תפריט הפתיחה: טעינה, משחק חדש, אפשרויות. mod יכול לדרוס state לפי שם המחלקה (`state/loader.py`).
- **נתיב השמירה** הוא `paths.USER_GAME_SAVE_DIR`, ונקרא בזמן ריצה (`save_system/save.py:251`). אפשר להחליף אותו בזמן ריצה.
- **מנוע המשפחה** (`nagmon.family`, WP8) נותן את `ProfileStore`, `ParentSettings` ומגבלות זמן.
- **מנוע הלמידה** (`nagmon.learning`, WP2) נותן את `LearnerState` ואת `LearningEngine`.

## 2. העיצוב

### 2.1 `nagmon/runtime.py`
- `NagmonRuntime` עם `store`, `parent`, `active`, `engine`, `session_tracker`.
- `activate(pid)`:
  1. טוען את הפרופיל ואת ה־learner;
  2. מגדיר `paths.USER_GAME_SAVE_DIR = store.save_dir(pid)`;
  3. מגדיר את ספק סולם השפה (`bilingual.set_ladder_provider`);
  4. מתחיל מעקב זמן מסך.
- `deactivate()`: שומר, עוצר מעקב ומחזיר את נתיב השמירה לברירת המחדל.
- `persist()` נקרא אחרי כל תשובה, בשמירת משחק וביציאה.
- שורש הנתונים הוא `USER_STORAGE_DIR / "nagmon"`, וניתן להזרקה לבדיקות.

### 2.2 `ProfileSelectState` (מסך "מי משחק?")
- כרטיס לכל ילד: דמות (sprite), שם, ⭐ ורמה. כרטיס "+ ילד חדש" (רק אחרי שער הורים, אם מוגדר PIN), וכפתור "🔒 הורים".
- **ניווט:** חצים, Enter, עכבר, ומקשים 1–9.
- **בחירת ילד:**
  1. בדיקת זמן מסך (`ScreenTimePolicy`). אם אסור, מוצגת הודעה בעברית עם הסיבה (שבת, מחוץ לשעות, נגמר הזמן להיום).
  2. אחרת `runtime.activate(pid)`, וממשיכים לתפריט הפתיחה הרגיל.
- **אין ילדים עדיין:** מסך ברוכים הבאים, ואחריו הגדרת PIN להורה, ואחריו האשף.

### 2.3 `NewChildWizardState` (אשף ילד חדש)
1. **שם:** מקלדת עברית קיימת (`InputMenu` עם `menu_alphabet` עברי).
2. **כיתה:** גן עד ט'. מזה נגזר הגיל המשוער, והוא קובע ברירות מחדל: סולם שפה, טיימר, יעד הצלחה, מספר אפשרויות בשאלה.
3. **דמות:** רשימת דמויות **צנועות** בלבד (allow-list מ־`content/modesty`).
4. **סיכום ושמירה.**

### 2.4 `ParentGateState` ו־`ParentMenuState` (שער ואזור הורים)
- **השער:** PIN, או שאלת כפל דו־ספרתית אם אין PIN. נעילה אחרי 5 טעויות.
- **אזור ההורים, תפריט ראשי:**
  - ילדים: עריכה, מחיקה (לסל, עם אפשרות שחזור), הגדרות לכל ילד;
  - דשבורד (WP8);
  - זמן מסך ושבת: מיקום, דקות לפני שבת, חלונות;
  - חגיגות (WP8);
  - AI: ספק ומפתח (WP9);
  - שינוי PIN.

### 2.5 `StartState` (דריסה ב־mod)
- יורש מהמקורי ומוסיף בראש את "שלום, <שם>!" ואת הכפתורים "החלפת שחקן" ו"הורים".
- אם אין פרופיל פעיל ב־`resume()`/`startup`, נדחף `ProfileSelectState`.

### 2.6 זמן מסך בזמן משחק
- `ScreenTimeWatcher` מופעל מעדכון ה־world, פעם בדקה. הוא מבקש החלטה מ־`SessionTracker`:
  - `WARN_SOON`: הודעה עדינה;
  - `BREAK_SUGGESTED`: הצעה להפסקה;
  - `MUST_STOP`: שמירה אוטומטית בנקודת עצירה טבעית (לא באמצע קרב או דיאלוג), הודעה, וחזרה למסך "מי משחק".

## 3. טבלת בדיקות (`tests/nagmon/test_runtime.py`, `test_profiles_ui.py`)

| # | תרחיש | צפוי |
|---|---|---|
| 1 | `activate(pid)` | נתיב השמירה = `profiles/<pid>/saves`, ה־engine נוצר, וספק הסולם מחזיר את רמת הילד |
| 2 | `deactivate()` | נתיב ברירת המחדל חוזר, וה־learner נשמר לדיסק |
| 3 | שני ילדים | שמירה של ילד א' לא מופיעה אצל ילד ב' |
| 4 | `persist()` אחרי תשובה | `learning.json` מתעדכן |
| 5 | ProfileSelect headless עם 2 פרופילים | יש 2 כרטיסים, "ילד חדש" ו"הורים". בחירה מפעילה פרופיל |
| 6 | ProfileSelect בשבת | הודעת "שבת שלום" ואין הפעלה |
| 7 | אשף: שם ריק או ארוך מדי | נדחה עם הודעה |
| 8 | אשף: כיתה ב' | ברירות מחדל: timer=off, language_level=0/1, יעד 0.85 |
| 9 | שער הורים: PIN שגוי 5 פעמים | נעילה |
| 10 | StartState בלי פרופיל פעיל | ProfileSelect נדחף |
| 11 | ScreenTimeWatcher, MUST_STOP באמצע קרב | ממתין לסוף הקרב, ואז שומר ומחזיר |
