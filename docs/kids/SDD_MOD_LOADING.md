# SDD: טעינת ה־mod של נגמון מעל Tuxemon (WP1)

## 1. מה קיים

- `TuxemonConfig.mods` קבוע ל־`["tuxemon"]` (`tuxemon/config.py:178`). אותה רשימה משמשת גם לבחירת קמפיין (`states/start.py:111`, `startup_state_machine.py:96`).
- `fetch_mod_asset_roots` (`tuxemon/constants/asset_loader.py:22`) בונה את שורשי הנכסים מ־`config.mods` בלבד, בסדר הפוך. נקרא פעם אחת ב־import של `tuxemon/locale/locale.py`.
- מסד הנתונים נטען לפי `mods/db_config.yaml`: `active_mods`, `mod_tables` ו־`mod_dependencies`. מיזוג לפי slug, ו־mod מאוחר דורס מוקדם (`database/loader.py`).
- תרגום: כל ה־`.po` מקומפלים לנתיב לפי `locale/category/domain`. `T.translate` משתמש רק בתרגום של domain `base`. אם לשני mods יש `base.po` לאותה שפה, הם דורסים זה את זה בקומפילציה.
- **לולאה ראשית** (`tuxemon/client.py:118`): מציירת בלי הפסקה, בלי `sleep` ובלי `tick`. במחשב נייד זה 100% מעבד, מאוורר וסוללה.

## 2. העיצוב

1. **תלויות mod:**
   - שדה חדש `dependencies: list[str]` ב־`mod.yaml` (`ModMetadata`, ברירת מחדל `[]`).
   - `fetch_mod_asset_roots` מרחיב כל mod ב־`config.mods` לתלויות שלו, בצורה רקורסיבית, בלי כפילויות ומוגן ממעגלים.
   - הסדר הוא קודם ה־mod ואחר כך התלויות שלו, ולכן **נכס של nagmon גובר על נכס באותו שם ב־tuxemon**.
2. **ברירת מחדל:** `config.mods = ["nagmon"]`, ו־`mods/nagmon/mod.yaml` מגדיר `dependencies: [tuxemon]`.
   - ב־`db_config.yaml`: nagmon ב־`active_mods` וב־`mod_activation`, `mod_dependencies: {nagmon: [tuxemon]}`, ו־`mod_tables.nagmon` שמתחיל ריק ויתמלא בהמשך.
3. **domain תרגום לכל mod:**
   - המחרוזות של nagmon יושבות ב־`mods/nagmon/l18n/<loc>/LC_MESSAGES/nagmon.po`, כ־domain נפרד, כך שאין דריסה בקומפילציה.
   - ה־translator של `base` נבנה כשרשרת: `[nagmon@loc, base@loc, nagmon@en_US, base@en_US]`.
   - כך `T.translate("quiz_correct")` מוצא מחרוזות nagmon. בשפה הפעילה nagmon גובר על base. אם אין תרגום, נופלים לאנגלית.
4. **מגביל פריימים:**
   - `FrameLimiter(target_fps, clock, sleep)` ישן את יתרת הזמן של כל פריים.
   - ב־`client.main()` הוא מופעל אחרי `flip()`, אלא אם `vsync` פעיל.
   - פונקציה טהורה עם שעון מוזרק, כדי שאפשר לבדוק אותה בלי pygame.

## 3. טבלת בדיקות (`tests/nagmon/test_mod_loading.py`)

| # | תרחיש | צפוי |
|---|---|---|
| 1 | mods=[a], a תלוי ב־b | שורשים = [a, b] |
| 2 | תלות מעגלית a↔b | אין לולאה, כל אחד פעם אחת |
| 3 | נכס קיים רק ב־b | נמצא ב־b |
| 4 | נכס קיים ב־a וב־b | נמצא ב־a |
| 5 | `ModMetadata` בלי `dependencies` | `[]`. עם השדה: נטען |
| 6 | שרשרת תרגום: מחרוזת רק ב־nagmon he | מוחזר תרגום nagmon בעברית |
| 7 | מחרוזת ב־base he וגם ב־nagmon he | nagmon גובר |
| 8 | מחרוזת חסרה ב־he, קיימת ב־en של nagmon | אנגלית |
| 9 | `FrameLimiter`: הפריים לקח 5ms מתוך 16.6ms | ישן כ־11.6ms. פריים איטי: לא ישן |
| 10 | הגדרות ברירת מחדל | `CONFIG.mods == ["nagmon"]`, ו־nagmon פעיל ותלוי ב־tuxemon ב־db_config |
| 11 | אינטגרציה | `ModData` נטען, ו־lookup של מפלצת מ־tuxemon עובד |
