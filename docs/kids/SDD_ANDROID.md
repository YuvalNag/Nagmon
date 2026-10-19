# SDD: נגמון באנדרואיד (WP13)

> המטרה: קובץ APK שמתקינים על הטלפון של הילדים (Poco F3) ומשחקים בו בלי מחשב, בלי מקלדת ובלי חנות.
> המקורות: `SDD_ARCHITECTURE.md`, `SDD_TTS.md`, `SDD_PROFILES_UI.md`, `SDD_FAMILY.md`.

## 1. מה קיים ומה חסר

**מכשיר היעד:** Poco F3.
- מעבד Snapdragon 870 (ARM 64 ביט, `arm64-v8a`).
- Android 11–13 (MIUI או HyperOS).
- מסך 2400×1080 (יחס 20:9).

### 1.1 מה כבר עובד בקוד
- **אחסון:** Tuxemon מזהה אנדרואיד דרך המודול `android` ושומר ב־`getExternalFilesDir`, תיקייה פרטית לאפליקציה שלא דורשת הרשאות. `nagmon/` (פרופילים, PIN, למידה) יושב מתחת לתיקייה הזו כמו במחשב.
- **מסך מלא:** `prepare.py` כבר מבקש מסך מלא באנדרואיד.
- **חיצים על המסך:** יש שכבת מגע עם חיצים ו־A/B (`PygameTouchOverlayInput`), כבויה כברירת מחדל (`controller.overlay`).
- **מקלדת על המסך:** `InputMenu` היא מקלדת אותיות בתוך המשחק, ולכן הזנת שם לא צריכה את המקלדת של אנדרואיד.
- **מקלדת מספרים:** בשאלות היא כפתורים על המסך.

### 1.2 מה חסר (נמצא בבדיקת הקוד)
1. **תפריטי pygame_menu לא מגיבים לעכבר או למגע.** אלה מסכי השאלות, בחירת השחקן, אזור ההורים והינשוף. `PygameMenuInputHandler` ממיר רק חיצים, A ו־B (`tuxemon/menu/events.py`), ולחיצה נבלעת. זו בעיה גם במחשב: ילד בן 5 רוצה ללחוץ עם העכבר.
2. **העכבר כבוי כברירת מחדל** (`hide_mouse: True`). באנדרואיד SDL הופך נגיעה לאירוע עכבר, ובלי `PygameMouseInput` הנגיעה לא מגיעה לתפריטים.
3. **רזולוציה:** `set_mode(1280×720, FULLSCREEN)` במסך 20:9 נמתח או נחתך. צריך משטח לוגי ביחס של המסך עם `pygame.SCALED`, ו־SDL ממיר את מיקום הנגיעה בעצמו.
4. **הקראה:**
   - `pyttsx3` לא קיים באנדרואיד.
   - `edge-tts` צריך את `aiohttp` עם הרחבות C, ולא שווה לבנות אותו.
   - לאנדרואיד יש מנוע דיבור מובנה עם קול עברי (Google), שעובד גם בלי אינטרנט.
5. **ספריות עם קוד מקומפל:**
   - **`pygame-ce`:** ל־python-for-android אין מתכון. מקור 2.5.7 כולל `buildconfig/Setup.Android.SDL2.in` ותמיכה ב־`PYGAME_ANDROID` ב־`setup.py`, ולכן אפשר להשתמש בדרך של המתכון `pygame` הקיים (שבונה את 2.1.0).
   - **`python-bidi` 0.6:** מקומפל ב־Rust, אבל `bidi/algorithm.py` טהור, וזה החלק היחיד שאנחנו משתמשים בו (`tuxemon/ui/bidi.py`). המתכון יתקין רק את הקבצים הטהורים.
   - **`pydantic-core`:** יש מתכון (2.41.4), ולכן מצמידים את `pydantic` לגרסה 2.12, שתואמת לו.
6. **אישורי TLS:** ל־Python באנדרואיד אין קובץ CA, ולכן הינשוף (Groq) לא יתחבר. הפתרון: `certifi` ו־`SSL_CERT_FILE`.
7. **קבצי הבנייה הישנים** ב־`buildconfig/buildozer` נכתבו ל־pygame 2.0-dev, API 27 ו־NDK 19, ולא עובדים.

## 2. העיצוב

### 2.1 עקרונות
1. **אותו קוד בדיוק במחשב ובטלפון.** הבדלים בין הפלטפורמות נשארים בפונקציות טהורות ב־`nagmon/android/`, ונבדקים במחשב.
2. **כל מה שנוגע ב־Java (pyjnius) נמצא בקובץ אחד** (`nagmon/android/jnius_tts.py`), דק ככל האפשר, ונטען רק באנדרואיד.
3. **שום דבר באנדרואיד לא מפיל את המשחק.** בלי קול עברי ממשיכים בשקט, וההודעה מופיעה באבחון ההורים.
4. **בונים ב־GitHub Actions.** כלי האנדרואיד לא זמינים בסביבת הפיתוח, ו־APK מוכן מורידים מ־Actions.

### 2.2 מבנה

```
tuxemon/platform/mobile.py        # is_android(env), logical_resolution, touch_defaults,
                                  # wants_touch_arrows, on_app_switch / app_switched
nagmon/android/
  __init__.py      # is_android (מ־mobile)
  setup.py         # prepare_environment(env): HOME, SSL_CERT_FILE
  tts.py           # AndroidTTSBackend(engine) (Backend מ־SDD_TTS)
  jnius_tts.py     # JniusSpeechEngine: android.speech.tts.TextToSpeech (לא נבדק במחשב)
buildconfig/android/
  main.py                         # נקודת הכניסה של p4a
  buildozer.spec                  # arm64-v8a, API 35, min 24, landscape
  recipes/pygame_ce/__init__.py
  recipes/python_bidi_pure/__init__.py
tools/android/stage.py            # בונה תיקיית app נקייה לבנייה
.github/workflows/android.yml     # בונה APK ומעלה כ־artifact
```

### 2.3 החוזים

```python
def is_android(env: Mapping[str, str] = os.environ) -> bool
    # p4a מגדיר ANDROID_ARGUMENT / ANDROID_PRIVATE / ANDROID_APP_PATH

def logical_resolution(screen_w: int, screen_h: int, *, min_height: int = 720,
                       max_height: int = 1080, min_width: int = 1280) -> tuple[int, int]
    # תמיד לרוחב, ביחס של המסך.
    # הפיקסלים של המסך עצמו, עד גובה 1080, כדי ששום דבר לא יימתח.
    #   מתיחה של פי 1.5 (מ־1600×720) טשטשה טקסט ותמונות בטלפון.
    # מסך חד יותר (1440p) מצויר בגובה 1080 ומוגדל מעט, כדי לא להאט.
    # מסך קטן או ריבועי שומר על המינימום של 1280×720.
    # מספרים זוגיים. Poco F3: 2400×1080 → 2400×1080, וקנה מידה 7.

def touch_defaults(config: dict) -> None
    # controller.overlay=True, hide_mouse=False, transparency=150, display.fullscreen=True
    # מוחל על ברירות המחדל לפני tuxemon.yaml של השחקן, ולכן הבחירה שלו נשמרת

def wants_touch_arrows(state_name) -> bool    # רק "WorldState"

def prepare_environment(env) -> None
    # HOME=ANDROID_PRIVATE (תיקייה פרטית; ל־p4a אין HOME), SSL_CERT_FILE=certifi.
    # ערכים קיימים נשמרים. בלי certifi לא עושים כלום.

class SpeechEngine(Protocol):
    def ready(self, timeout: float) -> bool
    def has_language(self, tag: str) -> bool          # "he-IL" / "en-US"
    def synthesize_to_file(self, text: str, tag: str, rate: float,
                           path: Path, timeout: float) -> bool

class AndroidTTSBackend:   # id="android", online=False, extension=".wav"
    # available(lang): המנוע מוכן ויש לו השפה
    # rate: "-10%" → 0.9 (parse_rate מ־backends.py)
    # synthesize: מוחק קובץ ריק או חלקי בכישלון, וזורק TTSBackendError
```

**עכבר ומגע בתפריטים** (`tuxemon/menu/input_handler.py`):
- `PlayerInput(MOUSELEFT)` בלחיצה (`value=pos`) הופך ל־`MOUSEBUTTONDOWN(pos, button=1)`.
- בשחרור (`value=0`, `previous_value=pos`) הוא הופך ל־`MOUSEBUTTONUP`.
- pygame_menu מפעיל כפתור כשהלחיצה והשחרור נופלים על אותו כפתור.
- נגיעה מחוץ לתפריט עוברת הלאה (למשל לשכבת החיצים).

**דברים שנמצאו בסיור המגע (`tools/dev/touch_tour.py`) ותוקנו:**
- **קריסה בשחרור:** שחרור לחיצה בתפריט קלאסי (המקלדת על המסך) זרק `ValueError`.
- **תו ראשון נבלע:** האות הראשונה שנלחצה במקלדת על המסך נבלעה, כי ההגנה מ־Enter שפתח את התפריט חלה גם על לחיצה.
- **לחיצה מתמשכת:** לחיצה ארוכה הקלידה אות בכל פריים. עכשיו פועלים רק בלחיצה עצמה.
- **מקש END:** הוא מחוץ ל־rect של קבוצת הפריטים. עכשיו בודקים פגיעה בכל פריט בנפרד.
- **החיצים מכסים כפתורים:** החיצים ו־A/B כיסו מקשים ותשובות. עכשיו הם מוצגים ופעילים רק במפה (`WorldState`), ובכל מקום אחר לוחצים ישר על הכפתור.
- **לחיצה כפולה:** נגיעה בחץ שלחה גם לחיצת עכבר. העכבר מתעלם מאזור החיצים (`ignore_at`).
- **דיאלוגים:** מתקדמים בנגיעה בכל מקום, ודף מידע על מפלצת נסגר בנגיעה.
- **כפתור חזרה:** כפתור החזרה של הטלפון (`K_AC_BACK`) פותח וסוגר תפריטים כמו Escape.
- **קנה מידה:** `make_default_scaling` חישב לפי הרוחב בלבד. במסך רחב זה נתן ×6, והתפריטים גלשו מהגובה. עכשיו לוקחים את המינימום מבין הרוחב והגובה.
- **כפתורים גדולים יותר בטלפון:** `widget_padding` גדל פי 2 לגובה, כדי שאצבע של ילד בן 5 תמצא את הכפתור.
- **שקיפות החיצים:** 45 כמעט שקוף בטלפון, ולכן 150.

**ברירות מחדל של נגמון** (`tuxemon/config.py`):
- `hide_mouse=False` גם במחשב: ילדים לוחצים עם העכבר.
- `overlay` דולק רק באנדרואיד.

**תצוגה** (`tuxemon/prepare.py`): באנדרואיד:
- `resolution = logical_resolution(*desktop_size)`.
- `flags = FULLSCREEN | SCALED`.
- כל השאר כמו במחשב. `Scaling` הוא המספר השלם הגדול ביותר שנכנס ב־256×144: ב־Poco F3 זה 7.

**הקראה** (`nagmon/tts/factory.py`):
- `build_backends(settings, android=None)`.
- באנדרואיד: `[AndroidTTSBackend(JniusSpeechEngine()), NullBackend()]`.
- במחשב: כמו היום.

### 2.4 הבנייה

**מתכונים:**
- **`pygame_ce`:** המתכון `pygame` של p4a עם מקור ה־sdist של pygame-ce 2.5.7. `site_packages_name="pygame"`, ו־Cython מקמפל את `_sdl2`.
- **`python_bidi_pure`:**
  - מוריד את ה־sdist של python-bidi 0.6.11.
  - מעתיק את `algorithm.py` ו־`mirror.py`.
  - כותב `__init__.py` ריק, בלי ייבוא של ה־Rust.

**`stage.py`:**
- **מעתיק:** `tuxemon/`, `nagmon/`, `mods/` ו־`main.py`.
- **לא מעתיק:**
  - `tests`, `docs`, `.git` ו־`__pycache__`;
  - מקורות `*.tmx~` ו־`*.xcf`;
  - כלי מחשב (`tools/`, `buildconfig/` מלבד android).
- **מוזיקה:** נשארת. 147MB, ובטלפון של 128GB זה לא משנה.

**חתימה:**
- לעדכון גרסה בלי למחוק את המשחק צריך תמיד את אותו מפתח, כי מחיקה מוחקת את תיקיית הנתונים, כולל פרופילים והתקדמות.
- **עם המפתח:** ב־Actions מגדירים `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` ו־`ANDROID_KEY_ALIAS`, והבנייה חותמת release.
- **בלי המפתח:** נבנה debug APK. מפתח ה־debug נשמר ב־cache של Actions (`~/.android/debug.keystore`), ולכן כל בנייה מתעדכנת מעל הקודמת. GitHub מוחק cache שלא היה בשימוש 7 ימים, ואז המפתח מתחלף פעם אחת. הסודות הם הפתרון הקבוע.
- **אף פעם לא שומרים מפתח בריפו** (PLAYBOOK: סודות).

**פרטיות:**
- `android.allow_backup = False`. אחרת אנדרואיד מגבה את תיקיית האפליקציה ל־Google Drive, כלומר את הפרופילים, ה־PIN ושיחות הינשוף, בלי הסכמה מפורשת (PLAYBOOK).
- הנתונים יושבים ב־`ANDROID_PRIVATE`, ואפליקציות אחרות לא קוראות אותם.

**הרשאות:**
- `INTERNET` (הינשוף והקולות המקוונים, רק בהסכמת הורה כמו היום).
- `WAKE_LOCK` לא נדרש: SDL משאיר את המסך דולק בזמן משחק.

### 2.5 זמן מסך ושבת בטלפון
- **השעון:** אותו `SessionTracker`, עם שעון ואזור זמן מהגדרות ההורים.
- **מעבר לאפליקציה אחרת:**
  - SDL שולח `APP_WILLENTERBACKGROUND`.
  - `mobile.app_switched(True)` קורא ל־`NagmonRuntime.pause()`: שומר ועוצר את שעון זמן המסך, והילד נשאר בחור.
  - `APP_DIDENTERFOREGROUND` קורא ל־`resume()`, והספירה ממשיכה מעכשיו.
  - שלוש שעות ב־YouTube לא נספרות. (בלי זה, `max_tick_gap_s` היה מגביל את הנזק ל־2 דקות.)
- **סגירה בכוח:** הנתונים נשמרים אחרי כל תשובה (`on_answer` → `persist`), ולכן אין אובדן.

### 2.6 דוח קריסה בטלפון
בטלפון אין מסוף ואין logcat בלי מחשב. כשהמשחק קורס, הדוח צריך להגיע אליי בלי כלים ובלי מפתחות.
- **מה נתפס:**
  - שגיאת Python, גם לפני שהמשחק עלה: `main.py` עוטף את `launch_game`.
  - שגיאה בתוך המשחק: `handle_fatal_error` קורא ל־`run_tuxemon.on_fatal_error`.
  - קריסה של קוד מקומפל (SIGSEGV וכדומה): `faulthandler` כותב את מחסנית ה־Python לקובץ. הדוח מוצג בפתיחה הבאה.
- **מה בדוח:** גרסה ומספר בנייה (`build_info.json` מ־`stage.py`), דגם הטלפון וגרסת אנדרואיד, גרסת Python, זמן ב־UTC וה־traceback.
- **מה לא בדוח:**
  - מפתחות: `redact_secrets` מסתיר מפתחות Groq, Gemini, GitHub, OpenAI ו־`Bearer`, וגם כל מפתח שנשמר ב־`secrets.json`.
  - תוכן שיחות, תשובות ונתוני ילדים, שלא נכנסים אליו בכלל.
- **איך הוא יוצא מהטלפון:**
  - חלון אנדרואיד שואל "המשחק נעצר. לשלוח את הפרטים?". "שליחה" פותחת את חלון השיתוף של אנדרואיד (WhatsApp, Gmail וכו').
  - ההורה רואה את הטקסט לפני השליחה. בלי לחיצה שום דבר לא יוצא (PLAYBOOK: פרטיות).
- **איפה הוא נשמר:** `ANDROID_PRIVATE/crash/last_crash.txt`, אחרון בלבד. זה הבסיס ל"שליחת לוג" מאזור ההורים (`GAME_PLAN.md` §12.5).
- **הקבצים:**
  - `nagmon/crash_report.py`: בניית הדוח, הסתרה ושמירה. בלי אנדרואיד, ונבדק במחשב.
  - `nagmon/android/crash_dialog.py`: החלון והשיתוף דרך pyjnius.

## 3. בדיקות (TDD)

| בדיקה | קובץ |
|---|---|
| `is_android` לפי משתני p4a | `tests/nagmon/test_android_platform.py` |
| `logical_resolution`: Poco F3, 16:9, 4:3, מסך לאורך, מספרים זוגיים | אותו קובץ |
| `android_defaults` מדליק overlay ועכבר; `prepare_environment` לא דורס `SSL_CERT_FILE` קיים | אותו קובץ |
| `AndroidTTSBackend` עם מנוע מזויף: זמינות, קצב, קובץ חלקי נמחק, timeout | `tests/nagmon/test_tts_android.py` |
| `build_backends(android=True)` לא כולל pyttsx3 ו־edge | אותו קובץ |
| לחיצת עכבר על כפתור pygame_menu אמיתי מפעילה אותו, ולחיצה מחוץ לתפריט עוברת הלאה | `tests/nagmon/test_touch_menus.py` |
| רקע וחזרה: `pause`/`resume`, ואירועי SDL מגיעים ל־runtime | `test_runtime.py`, `test_game_states.py` |
| החיצים: פעילים רק במפה, משחררים חץ לחוץ, לא מצוירים כשהם כבויים, ולא שולחים גם לחיצת עכבר | `test_touch_menus.py` |
| `stage.py`: מה נכנס ומה לא, ו־`main.py` במקום | `tests/nagmon/test_android_stage.py` |
| המתכונים נטענים כמודולים, ושמות הגרסאות תואמים ל־`requirements` | `tests/nagmon/test_android_build_config.py` |
| דוח קריסה: שגיאה לפני עליית המשחק ובתוכו, קריסה מקומפלת מהפעם הקודמת, מפתחות מוסתרים, בלי לחיצה אין שיתוף | `tests/nagmon/test_crash_report.py` |
| האמולטור: כל APK נפתח באנדרואיד 11 (x86_64) ונשאר פתוח 6 דקות | `.github/workflows/android-smoke.yml` |
| סיור מגע: מסך 2400×1080, ובלי מקלדת בכלל. PIN, אשף שחקן בעברית, בחירת ילד, שאלה, משחק חדש, בחירת מפלצת והליכה עם החיצים | `tools/dev/touch_tour.py` |

**בדיקת קבלה אמיתית (בטלפון):**
1. התקנה.
2. "מי משחק?" בנגיעה.
3. אשף שחקן חדש עם המקלדת שעל המסך.
4. הליכה עם החיצים.
5. קרב: שאלה, תשובה בנגיעה, ושמיעת ההקראה בעברית.
6. יציאה וחזרה: ההתקדמות נשמרה.
7. אזור הורים עם PIN.

## 4. מה לא בתוכנית הזו
- חנות Google Play, שדורשת חשבון מפתח ומדיניות ילדים.
- iOS.
- פריסה לאורך, שתדרוש עיצוב מחדש של כל המסכים.
