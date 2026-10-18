# SDD: עברית, RTL ושפה כפולה (WP3)

> רכיב: `tuxemon/ui/bidi.py`, `tuxemon/locale/bilingual.py`, `tuxemon/menu/rtl.py` ושינויים קטנים במנוע.
> מקור: GAME_PLAN.md סעיף 8, SDD_ARCHITECTURE.md סעיף 8.
> כלל: אנגלית (`en_US`) נראית **בדיוק** כמו קודם. כל ענף RTL נכנס לפעולה רק כשהשפה הפעילה RTL או כשבטקסט יש אותיות RTL.

## 1. פונט

| החלטה | פירוט |
|---|---|
| פונט | `Rubik-Medium.ttf` (רישיון OFL 1.1, הקובץ `Rubik-OFL.txt` לידו). עגול, ברור וקריא בגודל קטן. כולל עברית, אותיות סופיות, לטינית, ספרות ו־`₪` |
| מקור | Google Fonts (מופע סטטי במשקל 500) |
| פונט פיקסלים | נבדקו: Galmuri (OFL, אין עברית), Press Start 2P, Pixelify Sans, Silkscreen (אין עברית), GNU Unifont (יש עברית, רישיון כפול GPL/OFL, אבל לא נגיש דרך ה־proxy ולא מתאים לסגנון). **לא נכלל** פונט פיקסלים |
| מפה | `LOCALE_FONT_MAP` עובר לשלשה `(font_file, thin_font_file, minimal_font_file)`. נוסף `he_IL`: Rubik בשלושת המקומות. גם `zh_CN` ו־`ja` מקבלים פונט minimal שיש בו את הגליפים שלהם |
| זמן ריצה | `Menu.font_filename` היה מחושב בזמן import. עכשיו `None` כברירת מחדל ונפתר ב־`setup_resources()` מתוך `CONFIG.locale.font_file` |
| ערכת נושא | `menu.theme.reset_theme_cache()` מאפס את `_theme`. נרשם ב־`T.language_changed_callbacks`. `SetLanguage.change_language` מעדכן קודם את הפונטים ב־config ורק אחר כך מחליף שפה, כדי שה־callbacks יראו את הפונט החדש |

## 2. API שפה (`tuxemon/locale/locale.py`)

```python
RTL_LOCALES = {"he_IL"}
T.is_rtl() -> bool                                   # השפה הפעילה RTL?
T.translate_in(msgid, locale_name, domain=None) -> str
T.format_in(msgid, locale_name, parameters=None, domain=None) -> str
T.lookup_in(msgid, locale_name, domain=None) -> str | None   # בלי fallback; None אם חסר
```

- `TranslatorPo` נשמר במטמון לכל `(locale, domain)`. **השפה הפעילה לא משתנה אף פעם.**
- `lookup_in` קורא את הקטלוג של השפה עצמה בלבד (בלי fallback לאנגלית). כך `bilingual` יודע אם באמת יש עברית.
- שלד `he_IL/LC_MESSAGES/base.po`: כותרת (`Language: he`, `Plural-Forms: nplurals=2; plural=(n != 1);`), `language_he_il`, `menu_alphabet` עברי (א–ת, ךםןףץ, ספרות, רווח, `.-!?`), ו־msgids חדשים בלבד. התרגום המלא שייך ל־WP4.
- `language_he_il` = "עברית" נוסף גם ל־`en_US`.
- `npc_names.yaml`: מפתח `he_il` עם כ־30 שמות.

## 3. bidi (`tuxemon/ui/bidi.py`)

```python
class VisualStr(str)                 # סימון: הטקסט כבר בסדר חזותי
def is_rtl_text(s) -> bool           # יש בו אות עברית/ערבית?
def paragraph_is_rtl(text) -> bool   # כיוון בסיס לפסקה
def reorder(line, base_rtl) -> tuple[VisualStr, tuple[int, ...]]   # + מפת visual→logical
def to_visual(line, base_rtl) -> VisualStr
def ensure_visual(text) -> str       # no-op ל־VisualStr או לטקסט LTR טהור
def needs_bidi(line, base_rtl) -> bool
def start_alignment() -> HorizontalAlignment   # RIGHT ב־RTL, אחרת LEFT
```

**מימוש האלגוריתם:** `python-bidi==0.6.11` ב־requirements. משתמשים במסלול הטהור `bidi.algorithm` (לא בהרחבת Rust), ומפעילים את שלביו אחד־אחד. לפני שלב L2 מוסיפים לכל תו את האינדקס הלוגי שלו, וכך מקבלים גם את מפת הסדר (צריך אותה לאפקט ההקלדה). אם הייבוא נכשל (פלטפורמה בלי wheel), יש fallback פנימי מינימלי: היפוך רצפי RTL, שמירה על רצפי LTR וספרות, ושיקוף סוגריים.

**כיוון בסיס:** פסקה היא RTL אם יש בה אות RTL והשפה הפעילה RTL. בשפה LTR, הכיוון נקבע לפי התו החזק הראשון (P2/P3). טקסט בלי אותיות RTL לא עובר דרך האלגוריתם בכלל, ולכן אנגלית לא משתנה.

**שכבה אחת בדיוק (חוזה "לוגי נכנס, חזותי יוצא פעם אחת"):**

| מקום | מה קורה |
|---|---|
| `iter_render_text` | חלוקה לשורות לפי פסקאות (`_prepare_text_lines_with_direction`), ואז `reorder` לכל שורה. הפלט `VisualStr` |
| `MultilineTextRenderer.render_lines` | אחרי `break_text_into_lines`, כל שורה עוברת `to_visual` לפי כיוון הפסקה שלה |
| `TextRenderer.shadow_text` | `ensure_visual(text)`: לא נוגע ב־`VisualStr` (אין המרה כפולה), וממיר תווית של שורה אחת |
| `TextRenderer.get_glyph` | אף פעם לא ממיר (תו בודד) |
| pygame_menu | `menu.rtl.install_pygame_menu_bidi()` עוטף את `Widget._font_render_string`. זו נקודת המעבר היחידה לכל כותרת, תווית, כפתור ו־`set_title`. `TextInput` לא מומר (הסמן שלו לוגי) |

**שבירת שורה רכה:** `BILINGUAL_LINE_BREAK = " "`. ה־`TextPaginator` מפצל רק לפי `\n`, ולכן שתי שורות שמחוברות ב־U+2028 נשארות באותו עמוד. `iterate_paragraphs` מתייחס ל־U+2028 כמו לשורה חדשה.

## 4. פריסת RTL

| רכיב | ב־RTL |
|---|---|
| `TextArea`, `draw_text`, `DialogState`, `translated_dialog`, `cipher_dialog` | `h_alignment=None`, ונפתר ל־`start_alignment()` |
| `draw_text` עם RIGHT | כל שורה מיושרת לימין בנפרד (קודם הבלוק כולו יושר לפי השורה הרחבה ביותר) |
| אפקט הקלדה | **סדר החשיפה = סדר הקריאה הלוגי.** כל תו מצויר במיקום החזותי שלו (`x` מחושב על השורה החזותית), אבל נחשף לפי האינדקס הלוגי. בעברית זה מימין לשמאל, ומילה באנגלית בתוך המשפט נחשפת משמאל לימין |
| גלישה | ב־RTL החיתוך בצד שמאל, וה־`…` מצויר ב־`rect.left` |
| `TextArea` סטטי | מיושר לימין כש־`h_alignment` הוא RIGHT |
| pygame_menu | `widget_alignment = start_menu_alignment()` (ALIGN_RIGHT). בחץ הבחירה הצדדים מוחלפים (`margin_right`) והתמונה משוקפת |
| `Menu` (sprites) | `calc_menu_items_rect` משאיר שוליים לחץ בצד ימין. `MenuCursorController` מצייר חץ משוקף מימין לפריט. `VisualSpriteList.arrange_menu_items` מיישר לימין ומסדר עמודות בסדר הפוך. מקשי ימין ושמאל מתהפכים בתפריט עם כמה עמודות |
| `InputDisplay` | ההנחיה ושדה הטקסט עוגנים לימין, המונה עובר לשמאל |
| `DialogState` avatar | `bottomright` במקום `bottomleft` |

**מעבר על אתרי ALIGN_LEFT:** כל `align=ALIGN_LEFT` בווידג'ט שאינו `float` הוחלף ב־`start_menu_alignment()` (party, mission, character, monster_moves, journal_state, journal_choice). ווידג'טים עם `float=True` ו־`translate(...)` (monster_info, journal_info וחלק מ־character) קשורים לציור הרקע ונשארו במקום. הטקסט שלהם עובר bidi, אבל הפריסה לא משוקפת (צריך ציור רקע משוקף. פער מתועד).

## 5. מחרוזות קשיחות → msgids

| קוד | msgid | en_US | he_IL |
|---|---|---|---|
| `Lv.{level}` | `level_short` | `Lv.{level}` | `רמה {level}` |
| `Lv. {level}` (monster_info) | `level_short_spaced` | `Lv. {level}` | `רמה {level}` |
| `Lv.{a} → Lv.{b}` | `level_up_range` | `Lv.{start} → Lv.{end}` | `רמה {start} ← רמה {end}` |
| `Unknown Location` | `unknown_location` | `Unknown Location` | `מקום לא ידוע` |
| `$` | `currency_symbol` | `$` | `₪` |
| `x` (כמות) | `quantity_symbol` | `x` | `×` |
| יחידות | `unit_km` … `unit_ft` | `km` … `ft` | `ק״מ` … `רגל` |
| ערך+יחידה | `measure_value` | `{value}{unit}` | `{value} {unit}` |
| `Option {key}` | `menu_option_default`, `menu_option_unnamed` | `Option {key}`, `Unnamed` | `אפשרות {key}`, `ללא שם` |

עזרים: `tuxemon/locale/units.py`: `unit_label(unit)`, `format_measure(value, unit)`. `CurrencyFormatter(symbol=None)` ו־`QuantityFormatter(symbol=None)` קוראים את הסמל בזמן `format()`.

## 6. סולם השפה (`tuxemon/locale/bilingual.py`)

```python
HEBREW, ENGLISH = "he_IL", "en_US"
class Term(str)                        # term(he, en): שם/פריט עם שתי צורות
def term(he, en) -> Term
def term_msgid(msgid) -> Term          # שתי הצורות מתוך ה־po
class Bilingual(str)                   # .primary / .secondary; str() = primary + HINT_MARKER
def compose(msgid, params=None, level=0, known_words=None) -> str
def set_ladder_provider(fn: Callable[[], tuple[int, Mapping[str, str]] | None] | None)
def ladder_settings() -> tuple[int, Mapping[str, str]] | None
def menu_label(msgid, level, max_chars=None) -> str
```

| רמה | פלט `compose` |
|---|---|
| 0 | עברית בלבד. `Term` מוצג בעברית |
| 1 | עברית. `Term` בפרמטרים מוצג כ־`שיקוי · Potion` (אם שתי הצורות שוות, רק השם) |
| 2 | עברית. ההופעה **הראשונה** של כל מילה מ־`known_words` (עברית→אנגלית) מקבלת `שיקוי (potion)`. נתמכות אותיות שימוש (`והבכלמש`) לפני המילה |
| 3 | אנגלית, ` `, עברית. אם לשתיהן אותו מספר עמודים (`\n`), כל עמוד מזווג לחוד |
| 4 | `Bilingual(primary=en, secondary=he)`, ו־`str()` = אנגלית + ` [?]`. ה־UI יכול להציג את `.secondary` בלחיצה |
| 5 | אנגלית בלבד |

- **Fallback:** חסרה עברית → אנגלית. חסרה אנגלית → עברית. חסרות שתיהן → msgid. ברמות 3–4, כששפה אחת חסרה, מחזירים רק את השנייה (בלי סמן).
- **Provider:** ברירת המחדל מחזירה `(0, {})` כשהשפה RTL, ו־`None` אחרת (ואז `T.format` רגיל). WP6 יחבר את הפרופיל הפעיל דרך `set_ladder_provider`.
- **חיבור לדיאלוג:** `TextFormatter.paginate_translation` קורא ל־`compose` כשה־provider מחזיר רמה ≥ 1. ברמה 0 או `None` המסלול הקיים לא משתנה. כך `translated_dialog`, `char_talk` ו־`cipher_dialog` מכבדים את הסולם.
- **תפריטים:** ברמות 0–2 עברית בלבד (`T.translate`). `menu_label` מחזיר `עברית · English` ברמות 3–4 רק כשהאורך הכולל ≤ `max_chars`, ואנגלית ברמה 5. בשלב זה הוא לא מחובר לתפריטים הקיימים (צריך מקום).

## 7. טבלת בדיקות

| קובץ | בדיקה |
|---|---|
| `tests/tuxemon/test_bidi.py` | עברית טהורה מתהפכת. LTR טהור לא משתנה (אותו אובייקט/ערך). מספרים בתוך עברית נשארים LTR (`יש לך 3 Potions!`). סוגריים משוקפים. פיסוק בסוף משפט עברי. מפת visual→logical היא פרמוטציה ותואמת את התווים. `ensure_visual` לא ממיר `VisualStr` פעמיים. `is_rtl_text`. fallback פנימי נותן אותו פלט במקרים הבסיסיים |
| `tests/tuxemon/test_rtl_render.py` | שבירת שורות ואז הפיכה: כל שורה מתהפכת בנפרד. סדר החשיפה בהקלדה הוא לוגי (ה־x של התו הראשון הוא הגדול ביותר בעברית). יישור לימין בשורות RTL. `…` משמאל. LTR ללא שינוי. U+2028 שובר שורה. `draw_text` RIGHT מיישר כל שורה. `shadow_text` של עברית שווה ל־render של המחרוזת החזותית |
| `tests/tuxemon/test_font_coverage.py` | ב־Rubik יש U+05D0–U+05EA (כולל סופיות), לטינית, ספרות, `₪`, `…`, `·`. יש קובץ רישיון OFL. ב־`LOCALE_FONT_MAP["he_IL"]` שלושה פונטים קיימים. `update_locale("he_IL")` מעדכן גם `minimal_font_file` |
| `tests/tuxemon/test_locale_rtl.py` | `translate_in`/`format_in` לא משנים את השפה הפעילה. `lookup_in` מחזיר None כשחסר. `is_rtl`. ה־po של he_IL תקין ומכיל רק את המפתחות המותרים. ל־`menu_alphabet` יש אותיות סופיות. `language_he_il` באנגלית. `npc_names` he_il |
| `tests/tuxemon/test_bilingual.py` | `compose` לכל רמה 0–5, `term`, הערת known word בהופעה ראשונה בלבד ועם תחילית, זיווג עמודים ברמה 3, `TextPaginator` משאיר את רמה 3 בעמוד אחד, `Bilingual`, fallbacks בשני הכיוונים, provider, ו־`paginate_translation` עם provider |
| `tests/tuxemon/test_hardcoded_strings.py` | ב־en_US הפלט זהה לקודם: `Lv.5`, `Lv. 5`, `Lv.3 → Lv.4`, `Unknown Location`, `$  10`, `x 3`, `12kg`, `Option a`, `Option Unnamed`. בעברית: `₪`, `רמה 5` |
| `tests/tuxemon/test_rtl_layout.py` | `start_alignment` לפי שפה. `VisualSpriteList` ב־RTL מיישר לימין והופך עמודות. החץ מימין לפריט. `InputDisplay` עוגן לימין. theme ב־RTL עם ALIGN_RIGHT. איפוס cache בהחלפת שפה. `Menu.font_filename` נפתר בזמן ריצה. עטיפת pygame_menu ממירה תווית עברית |
| `tests/tuxemon/test_rtl_smoke.py` | `DialogState` עם טקסט עברי (headless) מצויר בלי חריגות |

## 8. צילומי מסך

`docs/kids/img/rtl_dialog.png`, `rtl_menu.png`, `rtl_bilingual.png` נוצרים ב־`scripts/rtl_screenshots.py` (SDL dummy, שמירת משטח התצוגה).

## 9. פערים ידועים

- מסכים עם רקע מצויר וווידג'טים `float` (monster_info, journal_info, character) לא משוקפים.
- `AlertManager` עם `split_lines=True` משתמש ב־`splitlines()`, שמפצל גם ב־U+2028. לכן ברמה 3 השורות יוצגו בזו אחר זו.
- `TextPaginator` עם `max_line_length` (לא בשימוש במשחק) לא מכיר את U+2028.
- אין תמיכה בניקוד (רינדור אות־אות). מצב TOKEN חושף מילים מימין לשמאל ולא לפי סדר לוגי מלא.
- חשיפת `.secondary` ברמה 4 (כפתור "?") שייכת ל־UI עתידי.
