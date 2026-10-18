# SDD: הקראה בקול (TTS, WP12)

> ילדים שעוד לא קוראים צריכים לשמוע כל שאלה וכל דיאלוג בעברית. מילים באנגלית נשמעות בהגייה אנגלית.
> המקורות: `GAME_PLAN.md` §8.2 סעיף 8, `RESEARCH_LEARNING.md` (טבלת ההתאמה לגיל, "כל טקסט באנגלית מגיע עם הקראה"), `SDD_ARCHITECTURE.md`.

## 1. מה קיים

- **אין הקראה במשחק.** Tuxemon משמיע רק מוזיקה ואפקטים דרך `pygame.mixer`.
- **החוזה של שאלה** (`SDD_ARCHITECTURE.md` §3) כבר כולל `speak: {"he": ..., "en": ...}`. הטקסט להקראה מגיע מהמחולל, ואם אין, משתמשים ב־`prompt_he` / `prompt_en`.
- **המחשב המשפחתי:** Windows או Linux.
  - ב־Windows יש SAPI5. קול עברי ("Asaf") קיים רק אם הותקנה חבילת שפה עברית.
  - ב־Linux יש espeak-ng (עברית בסיסית, לא נעימה לאוזן).
  - הקולות הטובים ביותר בעברית הם קולות נוירוניים מקוונים (Microsoft Edge: `he-IL-HilaNeural`), ודורשים אינטרנט.

## 2. העיצוב

### 2.1 עקרונות
1. **לא חוסמים את לולאת המשחק.** `speak()` רק מכניס לתור. הסינתזה וההמתנה לסוף ההשמעה רצות ב־thread נפרד.
2. **אינטרנט רק באישור הורה.** `allow_online=False` כברירת מחדל. האכיפה היא ב־`TTSService` ולא בממשק, ולכן גם קוד שגוי לא ישלח טקסט החוצה.
3. **שום תקלה בהקראה לא מפילה את המשחק.** כל קריאה למנוע עטופה. בתקלה עוברים למנוע הבא, ואם אין, ממשיכים בלי קול. ההודעה נשמרת ב־`last_error` למסך האבחון של ההורים.
4. **חבילה טהורה:** `nagmon/tts/` לא מייבאת tuxemon. רק `pygame_player.py` מייבא pygame, וגם הוא לא חובה.

### 2.2 מבנה

```
nagmon/tts/
  __init__.py        # ייצוא ה־API
  settings.py        # TTSSettings
  text.py            # clean_for_speech, split_by_language, Segment
  backends.py        # Backend, EdgeTTSBackend, Pyttsx3Backend, NullBackend
  cache.py           # AudioCache: מפתח sha256, LRU לפי mtime, תקרת גודל
  player.py          # Player (Protocol), FakePlayer, NullPlayer
  pygame_player.py   # PygamePlayer: ערוץ שמור ב־pygame.mixer
  service.py         # TTSService, TTSIssue, הודעות שגיאה בעברית
  factory.py         # build_backends, create_service, default_cache_dir
  cli.py             # python -m nagmon.tts.cli "טקסט" --lang he [--online]
```

### 2.3 החוזה

```python
Lang = Literal["he", "en"]

@dataclass
class TTSSettings:
    enabled: bool = True
    allow_online: bool = False            # הסכמת הורה לקול מהאינטרנט
    rate_he: str = "-10%"                 # קצב איטי מעט לקטנים
    rate_en: str = "-10%"
    voice_he: str = "he-IL-HilaNeural"    # קול מקוון
    voice_en: str = "en-US-AnaNeural"     # קול ילדה באנגלית
    offline_voice_he: str | None = None   # חלק משם קול במחשב, למשל "Asaf"
    offline_voice_en: str | None = None
    auto_read_questions: bool = True      # for_age(age): True מתחת לגיל 8
    read_english_with_english_voice: bool = True
    volume: float = 1.0
    cache_max_mb: int = 200
    @classmethod
    def for_age(cls, age: int | None, **overrides) -> TTSSettings
    def to_dict(self) -> dict;  @classmethod from_dict(cls, d) -> TTSSettings

class Backend(Protocol):
    id: str                  # "edge" | "pyttsx3" | "null"
    online: bool
    extension: str           # ".mp3" | ".wav"
    def configure(self, settings: TTSSettings) -> None
    def available(self, lang: Lang) -> bool          # זול, לא זורק לעולם
    def voice_for(self, lang: Lang) -> str
    def rate_for(self, lang: Lang) -> str
    def synthesize(self, text: str, lang: Lang, out_path: Path) -> bool  # False = שקט

class Player(Protocol):
    def play(self, path: Path) -> None
    def stop(self) -> None
    def busy(self) -> bool

class TTSService:
    def __init__(self, backends: list[Backend], cache_dir: Path, player: Player,
                 *, settings: TTSSettings | None = None,
                 clock: Callable[[], float] = time.monotonic, retry_after_s: float = 60.0)
    def speak(self, text: str, lang: Lang, *, interrupt: bool = True) -> bool
    def speak_bilingual(self, he: str | None, en: str | None, *, interrupt: bool = True) -> bool
    def prefetch(self, texts: Iterable[str], lang: Lang = "he") -> int
    def stop(self) -> None
    def is_speaking(self) -> bool
    def wait_idle(self, timeout: float = 5.0) -> bool
    def apply_settings(self, settings: TTSSettings) -> None
    def voice_status(self) -> dict[Lang, str | None]   # איזה מנוע ישמש לכל שפה
    last_error: TTSIssue | None
    def shutdown(self, timeout: float = 1.0) -> None
```

### 2.4 הכנת הטקסט (`text.py`)

**`clean_for_speech(text, lang)`**, לפי הסדר:
1. **מחיקת משתנים ותגיות:** `${{name}}`, `{count}`, `<b>`, `**`.
2. **מחיקת אימוג'י** וסימנים דקורטיביים (⭐, ⏩, ✓). חץ (←) ונקודה אמצעית (·) הופכים לפסיק.
3. **כסף:** `5₪` ← "5 שקלים", `1₪` ← "שקל אחד". באנגלית: "5 shekels".
4. **חשבון:**

| סימן | עברית | English | מתי |
|---|---|---|---|
| `+` | ועוד | plus | תמיד |
| `−` / `-` | פחות | minus | `−` תמיד. `-` רק בין מספרים (לא "מכת-על") |
| `-5` (בהתחלה) | מינוס 5 | minus 5 | מינוס לפני מספר, בלי מספר לפניו |
| `×` `*` `x` | כפול | times | `x` ו־`*` רק בין מספרים |
| `÷` / ` : ` | חלקי | divided by | `:` רק עם רווחים (לא שעה 10:30) |
| `3/4` | 3 חלקי 4 | 3 over 4 | בין מספרים |
| `=` | שווה | equals | תמיד |
| `%` | אחוז | percent | |
| `<` `>` | קטן מ־ / גדול מ־ | is less than / is greater than | בין מספרים, עם רווחים |
| `½` `¼` `¾` `²` | חצי, רבע, שלושה רבעים, בריבוע | one half ... squared | |
| `?` `__` `□` כנעלם | כמה | what | ליד סימן חשבון |

5. **פיסוק חוזר:** `!!!` ← `!`, `???` ← `?`, `...` ← `…`.
6. **רווחים:** שורות חדשות ורווחים כפולים הופכים לרווח אחד.

**`split_by_language(text, base_lang) -> list[Segment]`:**
- מילה עם אותיות עבריות היא `he`. מילה עם אותיות לטיניות היא `en`.
- **ניטרליים** (מספרים, פיסוק, רווחים):
  - בין שתי מילים מאותה שפה, הם מצטרפים אליה;
  - בין שפות שונות, הם הולכים לשפת הבסיס ("קיבלת 3 potions" ← "קיבלת 3" בעברית, "potions" באנגלית);
  - בקצה הטקסט, הם מצטרפים למילה הסמוכה.
- מקטעים רצופים מאותה שפה מתאחדים. מקטע שיש בו רק פיסוק נזרק.
- כש־`read_english_with_english_voice=False` אין פיצול, והכול נקרא בקול של שפת הבסיס.
- מקטע ארוך מ־200 תווים מתחלק לפי סוף משפט, כדי שהמשפט הראשון יתחיל להישמע מהר.

### 2.5 מנועים ובחירה

- **`EdgeTTSBackend`** (`online=True`): ספריית `edge_tts`, קובץ mp3.
  - `available(lang)`: הספרייה מותקנת ויש קול לשפה. לא בודק רשת.
  - ניתן להזריק `communicate_factory` לבדיקות.
- **`Pyttsx3Backend`** (`online=False`): קולות מערכת (SAPI5 ב־Windows, espeak-ng ב־Linux), קובץ wav דרך `save_to_file`.
  - `available(lang)`: מחפש קול לפי `languages`, `id` ו־`name` (`he`, `he-IL`, `hebrew`, `Asaf`...). התוצאה נשמרת, ולכן הקריאה זולה. כל חריגה מחזירה `False`.
  - הקצב (`-10%`) מתורגם למילים בדקה ביחס לקצב ברירת המחדל של המנוע.
  - ניתן להזריק `engine_factory`.
- **`NullBackend`**: תמיד זמין ותמיד שקט. זה המנוע האחרון ברשימה.
- **בחירה לכל מקטע:**
  - עוברים על המנועים לפי הסדר ומדלגים על:
    - מנוע מקוון כש־`allow_online=False`;
    - מנוע ש־`available(lang)` שלו `False`;
    - מנוע שנכשל ב־`retry_after_s` השניות האחרונות.
  - לכל מנוע מתאים בודקים קודם את המטמון, ואז מנסים לסנתז.
  - בכישלון עוברים למנוע הבא. אם הגענו ל־`NullBackend`, נרשם `last_error` מסוג `no_voice`.

### 2.6 מטמון (`cache.py`)
- **מפתח:** `sha256(backend_id|voice|rate|text)`, וקובץ `<key><ext>` בתיקיית המטמון.
- **כתיבה:** לקובץ זמני ואז `os.replace`, כדי שלא יישאר קובץ חצי כתוב. קובץ ריק נחשב כישלון.
- **פגיעה:** מעדכנת את ה־mtime.
- **פינוי:** אחרי כל כתיבה, אם הגודל הכולל מעל התקרה, נמחקים הקבצים הישנים ביותר לפי mtime. הקובץ שמתנגן עכשיו לא נמחק.
- **נתיב ברירת מחדל:** `%LOCALAPPDATA%\Nagmon\tts_cache` ב־Windows, ו־`$XDG_CACHE_HOME/nagmon/tts` (או `~/.cache/nagmon/tts`) ב־Linux.
- **`prefetch(texts)`:** מכין מראש את השאלות הבאות (למשל 5 השאלות הבאות בקרב). זה תור בעדיפות נמוכה, ודיבור תמיד עוקף אותו. כך ההקראה מיידית גם עם קול מקוון.

### 2.7 תור, הפסקה ועצירה
- **thread אחד** (daemon) ו־`PriorityQueue`: דיבור בעדיפות 0, הכנה מראש בעדיפות 1. thread אחד, כי pyttsx3 לא בטוח לשימוש מכמה threads.
- **לכל בקשת דיבור יש "דור" (generation):**
  - `stop()` מעלה את הדור, מנקה את רשימת הבקשות הפעילות וקורא ל־`player.stop()`;
  - ה־worker בודק את הדור אחרי הסינתזה ואחרי ההשמעה, וזורק בקשה ישנה;
  - כך לחיצה על "הבא" עוצרת מיד את ההקראה הקודמת.
- **`speak(..., interrupt=True)`** = `stop()` ואז הכנסה לתור. **`interrupt=False`** מחכה בתור עד שהקודם מסתיים.
- **רצף מקטעים:** ה־worker מסנתז מקטע, מחכה ש־`player.busy()` יהיה `False`, ומשמיע. בזמן שמקטע אחד מתנגן, הבא כבר מסונתז.
- **`speak_bilingual(he, en)`:** בקשה אחת. קודם העברית, ואחריה האנגלית.
- **`is_speaking()`:** יש בקשת דיבור פעילה, או ש־`player.busy()`.

### 2.8 שגיאות (`TTSIssue(code, lang, message_he, detail)`)

| code | message_he |
|---|---|
| `no_voice` (he) | אין קול עברי במחשב — אפשר להתקין חבילת שפה עברית ב-Windows או להפעיל קול מהאינטרנט באזור ההורים |
| `no_voice` (en) | אין קול אנגלי במחשב — אפשר להתקין קול אנגלי ב-Windows או להפעיל קול מהאינטרנט באזור ההורים |
| `online_failed` | הקול מהאינטרנט לא זמין כרגע (אין חיבור?) — משתמשים בקול של המחשב |
| `backend_error` | מנוע ההקראה נכשל — משתמשים במנוע אחר |
| `player_error` | לא הצלחנו להשמיע את הקול — כדאי לבדוק שהרמקולים מחוברים |

כל שגיאה נרשמת ב־`logging` (warning), ושום חריגה לא יוצאת מ־`TTSService`.

### 2.9 חיבור למשחק (לביצוע ב־WP3/WP7)
- `nagmon.runtime` יוצר שירות אחד דרך `create_service(settings, player=PygamePlayer())`. ההגדרות לכל ילד נשמרות ב־`profile.settings["tts"]`.
- **`QuizState`:**
  - בפתיחה, אם `auto_read_questions`: `speak_bilingual(q.speak.get("he") or q.prompt_he, q.speak.get("en"))`;
  - כפתור רמקול: אותה קריאה;
  - בסגירה: `stop()`;
  - `prefetch` לשאלות הבאות.
- **דיאלוג:** כפתור רמקול שקורא ל־`speak(text, "he")`. ברמה 0 בסולם השפה: אוטומטית.
- **מילון־דקס:** `speak(word, "en")`.
- **אזור ההורים:** מתג "קול מהאינטרנט" (`allow_online`), `voice_status()` ו־`last_error.message_he`.

### 2.10 CLI להורה
```
python -m nagmon.tts.cli "שלום, מה שלומך?" --lang he
python -m nagmon.tts.cli "Hello" --lang en --online
python -m nagmon.tts.cli --list-voices
```
הפקודה מדפיסה איזה מנוע נבחר, את נתיב הקובץ ואת הודעת השגיאה בעברית אם יש.

### 2.11 תלויות
- `edge-tts` (קולות מקוונים) ו־`pyttsx3` (קולות מערכת) נוספות ל־`requirements.txt`.
- שתיהן מיובאות בעצלות (lazy). אם אחת חסרה, המנוע שלה פשוט "לא זמין".

## 3. בדיקות (`tests/nagmon/test_tts_*.py`)

כל הבדיקות רצות בלי רשת ובלי קול: המנועים והנגן מזויפים.

| # | תרחיש | צפוי |
|---|---|---|
| T1 | `clean_for_speech("7 × 8 = ?", "he")` | "7 כפול 8 שווה כמה?" |
| T2 | חיבור, חיסור, חילוק, אחוז, שבר `3/4` בעברית | ועוד / פחות / חלקי / אחוז / "3 חלקי 4" |
| T3 | אותם סימנים באנגלית | plus / minus / divided by / percent / equals / times |
| T4 | `7x8` ו־`7 * 8` | כפול / times. המילה "box" לא משתנה |
| T5 | מקף בתוך מילה ("מכת-על"), שעה `10:30` | לא משתנים |
| T6 | `-5` בהתחלה | "מינוס 5" / "minus 5" |
| T7 | `5₪`, `₪ 12`, `1₪` | "5 שקלים", "12 שקלים", "שקל אחד" |
| T8 | `${{name}}`, `{count}`, `<b>`, אימוג'י ⭐🎉, `!!!`, שורות חדשות | נמחקים או מצטמצמים |
| T9 | `split_by_language("קיבלת 3 potions!", "he")` | [he "קיבלת 3", en "potions!"] |
| T10 | עברית עם כמה מילים באנגלית ברצף ("Fire Ball") | מקטע אנגלי אחד |
| T11 | טקסט אנגלי עם מילה עברית, בסיס `en` | שלושה מקטעים |
| T12 | עברית בלבד / מספרים בלבד / ריק | מקטע אחד / מקטע אחד בשפת הבסיס / [] |
| T13 | `split_by_language` עם `"שיקוי · Potion"` | he, en, בלי מקטע של פיסוק בלבד |
| T14 | מפתח מטמון | יציב, ושונה כשמשתנה backend, voice, rate או text |
| T15 | פגיעה / החטאה במטמון | פגיעה לא מסנתזת שוב ומעדכנת mtime |
| T16 | פינוי מעל התקרה | הישנים נמחקים, הקובץ המוגן נשאר |
| T17 | `allow_online=False` | המנוע המקוון לא נקרא בכלל. עם `True` הוא נקרא |
| T18 | סדר המנועים | הראשון הזמין לשפה. עברית ב־pyttsx3 בלי קול עברי ← edge (אם מותר) או שקט ו־`no_voice` |
| T19 | מנוע שזורק ב־`synthesize` | עוברים למנוע הבא, `last_error` מתמלא, ואין חריגה |
| T20 | מנוע שזורק ב־`available` | נחשב לא זמין, ואין חריגה |
| T21 | מנוע שנכשל מושהה ל־`retry_after_s` | לא נקרא שוב עד שהשעון מתקדם |
| T22 | `speak` לא חוסם | חוזר מיד גם כשהמנוע "תקוע" |
| T23 | `speak_bilingual(he, en)` | הנגן מקבל עברית ואז אנגלית, לפי הסדר |
| T24 | `interrupt=True` | `player.stop()` נקרא, והבקשה החדשה מתנגנת |
| T25 | `interrupt=False` | הבקשה מחכה לסוף ההשמעה הקודמת |
| T26 | `stop()` | הנגן נעצר, בקשות בתור לא מתנגנות, `is_speaking()` = False |
| T27 | `prefetch` | הקבצים נוצרים במטמון ושום דבר לא מתנגן. `speak` אחריו לא מסנתז שוב |
| T28 | דיבור עוקף prefetch | בקשת דיבור מטופלת לפני שאר רשימת ההכנה |
| T29 | `enabled=False` / טקסט ריק | `speak` מחזיר False, בלי סינתזה |
| T30 | נגן שזורק | `last_error.code == "player_error"`, ואין חריגה |
| T31 | `TTSSettings.for_age(6)` / `(10)`, `to_dict`/`from_dict` עם ערכים שגויים | auto_read True/False. ערכים שגויים חוזרים לברירת מחדל |
| T32 | `EdgeTTSBackend` עם `communicate_factory` מזויף | voice ו־rate עוברים, קובץ נכתב |
| T33 | `Pyttsx3Backend` עם מנוע מזויף | זיהוי קול עברי לפי languages/id/name, `save_to_file` ו־`runAndWait`, וחריגה ב־init ← לא זמין |
| T34 | CLI עם מנועים מוזרקים | יוצא עם 0, מדפיס מנוע ונתיב. בלי `--online` המנוע המקוון לא נקרא |
| T35 | `split` כבוי בהגדרות | מקטע אחד בשפת הבסיס |
| T36 | `PygamePlayer` עם `SDL_AUDIODRIVER=dummy` | משמיע ועוצר בלי חריגה. קובץ פגום זורק חריגה, והשירות תופס אותה (T30) |
