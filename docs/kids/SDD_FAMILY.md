# SDD: משפחה (`nagmon/family/`)

> רכיב WP8a. Python טהור: בלי pygame ובלי tuxemon. כל פונקציה שתלויה בזמן מקבלת `now` או `clock` מוזרק.
> החוזה הכללי נמצא ב־`SDD_ARCHITECTURE.md` §5. המסמך הזה מפרט ומרחיב אותו. בדיקות: `tests/nagmon/test_family_*.py`.

## 1. מבנה

```
nagmon/family/
  __init__.py
  _jsonio.py      # כתיבה אטומית, טעינה עמידה לקבצים פגומים, גיבוי
  profiles.py     # Profile, ProfileStore, TrashEntry
  parent.py       # ParentSettings, ParentStore (PIN, נעילה), SecretStore, GateChallenge, redact
  screentime.py   # ScreenLimits, TimeWindow, ScreenTimePolicy, SessionTracker, Decision
  calendar.py     # Location, ShabbatCalendar, Holiday, Restriction
  rewards.py      # Reward, RewardsBoard, Redemption, FamilyGoal
  values.py       # FamilyValues
```

קבצים על הדיסק (`root` הוא תיקיית נתוני המשתמש של נגמון):

```
root/
  parent.json                 # ParentSettings (בלי סודות)
  secrets.json                # מפתח API בלבד. הרשאות 0600 איפה שאפשר
  usage.json                  # שניות משחק לכל יום ולכל פרופיל
  rewards.json                # פרסים, בקשות מימוש, יומן כוכבים שבועי
  profiles/<id>/profile.json
  profiles/<id>/learning.json # dict אטום. מבנה LearnerState מוגדר ב־nagmon.learning
  profiles/<id>/saves/
  trash/<id>-<stamp>/         # פרופיל שנמחק. אפשר לשחזר
```

## 2. עקרונות משותפים

1. **כל קובץ הוא JSON עם `schema_version`.** קוד הטעינה משדרג גרסה ישנה (`_migrate`) ושומר שדות לא מוכרים (`extra`) כדי שגרסה חדשה לא תאבד נתונים כשגרסה ישנה פותחת את הקובץ.
2. **כתיבה אטומית:** כותבים ל־`<name>.tmp`, `fsync`, ואז `os.replace`. לפני ההחלפה הקובץ הקודם מועתק ל־`<name>.bak`.
3. **קובץ פגום לא מפיל את המשחק:** הקובץ הפגום עובר ל־`<name>.corrupt-<stamp>`. אם יש `<name>.bak` תקין, טוענים ממנו. אחרת חוזרים לברירות מחדל. הילד ממשיך לשחק, וההורה רואה סימון `recovered`.
4. **זמן:** `datetime` עם אזור זמן (aware). משכים מחושבים תמיד דרך `timestamp()`, אף פעם לא בחיסור ישיר של שני זמנים מקומיים (חיסור כזה מתעלם ממעבר שעון קיץ).

## 3. פרופילים (`profiles.py`)

```python
@dataclass
class Profile:
    id: str; name: str; avatar: str
    birth_year: int | None = None; grade: int = 0
    language_level: int = 0; language_locked: bool = False
    interests: list[str]; settings: dict[str, Any]
    created_at: float = 0.0; order: int = 0
    extra: dict[str, Any]              # שדות לא מוכרים מגרסה חדשה יותר
    def to_dict() -> dict; @classmethod from_dict(d) -> Profile

class ProfileStore:
    def __init__(self, root: Path, *, avatars: Collection[str] | Callable[[str], bool] | None = None,
                 learner_from_dict: Callable[[dict], Any] | None = None,
                 learner_new: Callable[[], Any] | None = None,
                 clock: Callable[[], float] = time.time,
                 id_factory: Callable[[], str] | None = None)
    def list() -> list[Profile]                  # לפי order, ואז created_at
    def get(pid) -> Profile                      # KeyError אם אין
    def create(**fields) -> Profile              # name ו־avatar חובה
    def save(p) -> None
    def delete(pid) -> TrashEntry                # מעביר ל־trash, לא מוחק
    def list_trash() -> list[TrashEntry]; def restore(entry_name) -> Profile
    def reorder(pids: Sequence[str]) -> None
    def save_dir(pid) -> Path
    def load_learner_dict(pid) -> dict           # {} אם אין או פגום
    def save_learner_dict(pid, d: dict) -> None
    def load_learner(pid) -> LearnerState        # דרך learner_from_dict / learner_new
    def save_learner(pid, s) -> None             # s.to_dict()
```

- **מזהה:** `p` + 5 ספרות הקסה אקראיות (`secrets`), עם בדיקת התנגשות מול פרופילים ומול האשפה.
- **שם:** אחרי `strip`, באורך 1–16. אותיות עבריות (א–ת כולל סופיות) ואנגליות. הרחבה: מותרים רווח יחיד, מקף וגרש **בין** אותיות (למשל "בת-אל", "Mary Ann"). אסורים ספרות, ניקוד, אימוג'י ותווי כיווניות. שם כפול (בלי הבדל אותיות גדולות) נדחה, כדי שלא יהיו שני כרטיסים זהים.
- **דמות:** חייבת להיות ברשימה המותרת (רשימת הדמויות הצנועות, WP11). `avatars` יכול להיות קבוצה או פונקציה. `None` = עדיין אין רשימה, וכל מחרוזת לא ריקה מתקבלת (ה־runtime חייב להעביר רשימה).
- **מקסימום 8 פרופילים** (5 ילדים ומקום לאורחים). `create` מעבר לזה זורק `ProfileLimitError`.
- **מחיקה** מעבירה את כל התיקייה (כולל שמירות ו־learning) ל־`trash/`. `restore` מחזיר אותה אם המזהה פנוי ויש מקום.
- **גרסאות:** `schema_version` נוכחי = 2. גרסה 1 (החוזה הראשון) לא כללה `order`. השדרוג נותן `order` לפי סדר היצירה.
- **learning.json** נשמר כ־dict. המודול לא מכיר את `LearnerState`. השמות מהחוזה (`load_learner`, `save_learner`) הם עטיפות דקות סביב factory שמוזרק.

## 4. הורים (`parent.py`)

```python
@dataclass
class ParentSettings:
    pin_hash: str | None; pin_salt: str | None; pin_iterations: int
    failed_attempts: int; locked_until: float      # נשמר בקובץ, כך שהפעלה מחדש לא מאפסת נעילה
    location: Location                             # ברירת מחדל: ירושלים, הדלקה 40 דק'
    shabbat_mode: bool = True; holiday_mode: bool = True
    shabbat_stop_before_minutes: int = 10          # המשחק נסגר כמה דקות לפני הדלקת נרות
    ai: AIConfig                                   # provider, base_url, model, enabled (בלי מפתח)
    default_limits: ScreenLimits
    profile_limits: dict[str, ScreenLimits]
    values: FamilyValues
    def limits_for(pid) -> ScreenLimits

class ParentStore:
    def __init__(self, root: Path, *, clock=time.time, iterations=PBKDF2_ITERATIONS)
    settings: ParentSettings
    def save() -> None
    def has_pin() -> bool
    def set_pin(pin: str, *, current: str | None = None) -> None
    def verify_pin(pin: str) -> PinCheck            # ok, locked, attempts_left, retry_after_s
    def secrets -> SecretStore

class SecretStore:                                 # root/secrets.json, 0600
    def get_api_key() -> str | None; def set_api_key(k: str) -> None; def clear() -> None
    __repr__ לא מציג את המפתח

def redact(value: str | None) -> str              # "***" או "***abcd" (4 תווים אחרונים למפתח ארוך)
def scrub(text: str, *secrets: str) -> str        # מחליף כל מופע של סוד בטקסט ב־redact
def make_gate_challenge(rng: random.Random) -> GateChallenge   # a*b, שני מספרים דו־ספרתיים
```

- **PIN:** 4–8 ספרות. PBKDF2-HMAC-SHA256, salt אקראי של 16 בתים, `PBKDF2_ITERATIONS = 240_000` (מינימום 200,000). השוואה ב־`hmac.compare_digest`. אם ה־PIN נשמר עם פחות איטרציות מהנוכחי, אימות מוצלח מגבב אותו מחדש.
- **החלפת PIN** כשכבר יש PIN דורשת את הנוכחי.
- **נעילה:** אחרי 5 ניסיונות שגויים ברצף, נעילה ל־60 שניות. בזמן נעילה גם PIN נכון נדחה (אחרת אפשר לנחש בלי הגבלה). כשהנעילה נגמרת, המונה מתאפס. אם השעון זז אחורה, הנעילה לא תימשך יותר מ־60 שניות מעכשיו.
- **שער מהיר:** שאלת כפל של שני מספרים דו־ספרתיים (12–99, בלי כפולות של 10 ובלי 11). ילד בן 5–8 לא יפתור אותה בראש. זה לא מנגנון אבטחה אלא "שער" נוח. הגדרות רגישות (PIN, מחיקת פרופיל) דורשות PIN.
- **מיקום:** `Location(lat, lon, tz, city_he, candle_minutes, tzeit_degrees=8.5, tzeit_fixed_minutes=None)`. יש presets: ירושלים 40 דק', חיפה 30, פתח תקווה 20, ושאר הערים 18. ההורה יכול לשנות.
- **סודות:** המפתח לא נכנס ל־`parent.json`, לא ל־`repr` ולא ללוגים. הקובץ נכתב עם `os.open(..., 0o600)` ו־`chmod` (ב־Windows זה לא נאכף, וזה מתועד).

## 5. זמן מסך (`screentime.py`)

```python
class Action(StrEnum): ALLOW, WARN_SOON, BREAK_SUGGESTED, MUST_STOP
class Reason(StrEnum): DAILY_LIMIT, OUTSIDE_WINDOW, SHABBAT, HOLIDAY, BEDTIME

@dataclass(frozen=True)
class TimeWindow: start: time; end: time            # "16:00-19:30"
@dataclass
class ScreenLimits:
    daily_max_minutes: int | None = 60
    weekday_windows = ("16:00-19:30",); weekend_windows = ("08:00-12:00", "16:00-19:30")
    weekend_days = (4, 5)                            # שישי ושבת (Python weekday)
    bedtime: time | None = 20:00; wake_time: time = 06:00
    break_every_minutes = 20; break_minutes = 5
    warn_minutes = 5; grace_minutes = 2

@dataclass(frozen=True)
class Decision:
    action: Action; reason: Reason | None; minutes_left: int | None
    message_he: str; grace_seconds: int = 0; resume_at: datetime | None = None

class ScreenTimePolicy:                             # טהור
    def __init__(self, limits, *, calendar=None, shabbat=True, holidays=True, stop_before_minutes=0)
    def evaluate(self, now: datetime, used_today_s: float, since_break_s: float = 0) -> Decision

class SessionTracker:
    def __init__(self, root, policy_for: Callable[[str], ScreenTimePolicy], *, tz, max_tick_gap_s=120)
    def start(pid, now) -> Decision; def tick(now) -> Decision; def stop(now) -> None
    def ack_break(now) -> None
    def used_seconds(pid, day: date) -> float; def week_minutes(pid, now) -> int
```

**סדר העדיפויות** ב־`evaluate`: MUST_STOP (שבת/חג > שעת שינה > מחוץ לחלון > מכסה יומית) > WARN_SOON > BREAK_SUGGESTED > ALLOW.

- `minutes_left` = המינימום בין: מה שנשאר מהמכסה, הזמן עד סוף החלון, עד שעת השינה, ועד תחילת שבת/חג (פחות `stop_before_minutes`). WARN_SOON כש־`minutes_left <= warn_minutes`.
- **שבת וחג:** ה־policy שואל את `calendar.restriction_at(now)`. עם `stop_before_minutes` ההגבלה מתחילה מוקדם יותר.
- **grace:** כש־MUST_STOP מופיע **באמצע** סשן, ה־tracker קובע מועד סגירה (`now + grace_minutes`), ו־`grace_seconds` יורד בכל tick עד 0 (סגירה מחייבת). ניסיון `start` כשאסור מחזיר MUST_STOP עם `grace_seconds=0`.
- **הפסקה:** BREAK_SUGGESTED מוחזר פעם אחת כשעוברים `break_every_minutes` של משחק רצוף. אחר כך המונה מתאפס. גם `ack_break` או הפסקה (stop→start) של `break_minutes` לפחות מאפסים אותו.
- **שימוש יומי** נשמר ב־`usage.json` לפי תאריך מקומי. tick שחוצה חצות מתחלק בין שני הימים. נשמרים 35 יום אחרונים.
- **שינויי שעון:** tick עם הפרש שלילי (השעון זז אחורה) נספר כ־0. הפרש גדול מ־`max_tick_gap_s` (המחשב נרדם או השעון קפץ קדימה) נחתך ל־`max_tick_gap_s`.
- **הודעות** בעברית, בניסוח עדין ("המפלצות הולכות לנוח"), בלי פנייה מגדרית.

## 6. שבת וחגים (`calendar.py`)

```python
@dataclass(frozen=True)
class Location: lat; lon; tz: str; city_he: str; candle_minutes: int = 18
               tzeit_degrees: float = 8.5; tzeit_fixed_minutes: int | None = None
    @classmethod preset(key) -> Location; zone -> ZoneInfo

@dataclass(frozen=True)
class Holiday:
    date: date; key: str; name_he: str; name_en: str; day: int | None
    category: Literal["yom_tov", "chol_hamoed", "minor", "fast", "modern"]
    is_yom_tov: bool; is_fast: bool; is_tisha_bav: bool; solemn: bool

@dataclass(frozen=True)
class Restriction: start: datetime; end: datetime; days: tuple[date, ...]; kind: "shabbat" | "holiday"; name_he: str
    def contains(now) -> bool

class ShabbatCalendar:
    def __init__(self, location: Location, *, israel: bool = True)
    def sunset(d) -> datetime; def candle_lighting(d) -> datetime; def tzeit(d) -> datetime
    def is_yom_tov(d) -> bool; def is_restricted_day(d, *, shabbat=True, yom_tov=True) -> bool
    def restriction_at(now, *, shabbat=True, yom_tov=True) -> Restriction | None
    def is_restricted(now, ...) -> bool
    def next_restriction(now, ...) -> Restriction   # הנוכחית אם יש, אחרת הבאה
    def holidays_on(d) -> list[Holiday]
    def upcoming_holidays(start: date, days: int = 60) -> list[Holiday]
```

- ספריות: `pyluach` (תאריך עברי, חגים, צומות כולל דחיות) ו־`astral` (שקיעה וזווית שמש). שתיהן Python טהור ועובדות בלי רשת. `tzdata` נדרש ב־Windows בשביל `zoneinfo`.
- **הדלקת נרות** = שקיעה בגובה פני הים פחות `candle_minutes`. **צאת** = שמש 8.5° מתחת לאופק, או `tzeit_fixed_minutes` אחרי השקיעה.
- **ימים אסורים:** שבת וימי יום טוב בישראל: ראש השנה (יומיים), יום כיפור, סוכות א', שמיני עצרת/שמחת תורה, פסח א' וז', שבועות. בחו"ל (`israel=False`) pyluach מוסיף יום טוב שני.
- **חלון הגבלה:** רצף ימים אסורים (למשל חג שנכנס ביום שישי ומתחבר לשבת) הוא חלון אחד: מהדלקת נרות בערב היום הראשון עד צאת היום האחרון. `kind` נקבע לפי היום שבו `now` נמצא (`holiday` אם הוא יום טוב, אחרת `shabbat`).
- **חגים למשחק:** כל החגים מ־pyluach שרלוונטיים (ראש השנה, יום כיפור, סוכות וחול המועד, שמחת תורה, חנוכה 8 ימים, ט"ו בשבט, פורים ושושן פורים, פסח, ל"ג בעומר, שבועות, ט"ו באב) + צומות (צום גדליה, י' בטבת, תענית אסתר, י"ז בתמוז, ט' באב). מחושבים בנפרד, כי pyluach לא כולל אותם: יום השואה, יום הזיכרון, יום העצמאות ויום ירושלים, עם כללי ההקדמה והדחייה (יום העצמאות: ה' באייר. ביום שישי או בשבת הוא מוקדם ליום חמישי, ובשני נדחה לשלישי). `solemn=True` לצומות, ליום השואה וליום הזיכרון: המשחק לא יציג בהם אירוע חגיגי.

## 7. פרסים (`rewards.py`)

```python
class RewardKind(StrEnum): MILESTONE_SURPRISE, GOAL
@dataclass
class Reward: id; title_he; cost: int; currency: "stars" | "coins"; kind: RewardKind
              profile_id: str | None = None   # None = כל ילד יכול
              repeatable: bool = True; active: bool = True; emoji: str = ""
@dataclass
class Redemption: id; profile_id; reward_id; status: "pending" | "approved" | "declined"
                  source: "request" | "milestone"; created_at; decided_at; note_he
@dataclass
class FamilyGoal: title_he: str; target_stars: int; week_starts_on: int = 6   # יום ראשון

class RewardsBoard:
    def __init__(self, root: Path, *, tz, clock=time.time)
    def add_reward(**fields) -> Reward; def update_reward(r); def remove_reward(rid)   # remove = active=False
    def record_earned(pid, *, stars=0, coins=0, now) -> list[Redemption]   # מחזיר הפתעות שנפתחו
    def totals(pid) -> Totals                      # lifetime stars/coins. אף פעם לא יורד
    def status(pid) -> list[RewardStatus]          # התקדמות, זמינות, title מוסתר להפתעה
    def request(pid, reward_id, now) -> Redemption
    def approve(redemption_id, now) -> Redemption; def decline(redemption_id, now, note_he="")
    def pending() -> list[Redemption]
    def set_family_goal(goal | None); def family_progress(now) -> FamilyGoalStatus
```

**רציונל (מחקר מוטיבציה):** פרסים חיצוניים צפויים ותלויי ביצוע עלולים להחליש מוטיבציה פנימית (Deci, Koestner & Ryan, 1999). לכן:

1. **כוכבים ומטבעות לא יורדים לעולם.** הם סימן להתקדמות, לא מטבע שמוציאים. המימוש נקבע לפי סף מצטבר: הפרס ה־n זמין כשהסך המצטבר ≥ n × מחיר. הילד לא "מפסיד" כוכבים כשהוא מקבל גלידה.
2. **פרס הוא חגיגה ומידע** ("הגעת ל־100 כוכבים!"), לא תשלום על משימה. הכוכבים באים משליטה במיומנות (מנוע הלמידה), לא מכמות זמן מסך.
3. **הפתעת אבן דרך:** פרס לא צפוי פוגע פחות במוטיבציה. הכותרת מוסתרת עד שהסף מגיע ("🎁 הפתעה!"), ואז נוצרת בקשה שממתינה להורה.
4. **מטרה משפחתית שבועית:** סכום הכוכבים של כל הילדים בשבוע מול יעד. שיתוף פעולה, לא תחרות בין אחים בגילאים שונים. אין טבלת דירוג בין ילדים.
5. **כל מימוש דורש אישור הורה.** סירוב לא מוריד דבר.

## 8. ערכים (`values.py`)

```python
@dataclass
class FamilyValues:
    kindness_quests: bool = True; gentle_battle_wording: bool = True; modesty_filter: bool = True
    emphasis: list[str] = ["giving", "respect", "honesty", "responsibility", "helping"]
```

## 9. טבלת בדיקות

| # | קובץ | בדיקה |
|---|---|---|
| J1 | test_family_jsonio | כתיבה אטומית: אין `.tmp` שנשאר, `.bak` מכיל את הגרסה הקודמת |
| J2 | | JSON פגום → `.corrupt-*` נוצר, טעינה מ־`.bak` |
| J3 | | JSON פגום בלי גיבוי → ברירת מחדל (`None`) |
| P1 | test_family_profiles | create/list/get, מזהה בפורמט `p[0-9a-f]{5}`, תיקיות נוצרות |
| P2 | | שם: עברית, אנגלית, "בת-אל" תקינים. ריק, 17 תווים, ספרות, אימוג'י, ניקוד, תו RTL נדחים. כפול נדחה |
| P3 | | דמות מחוץ לרשימה (set או callable) נדחית |
| P4 | | פרופיל תשיעי נדחה |
| P5 | | סדר: לפי order. `reorder` דורש פרמוטציה |
| P6 | | delete → trash, `list_trash`, restore. restore כשהמזהה תפוס נכשל |
| P7 | | learning dict: round-trip, פגום → {} עם גיבוי. load/save_learner עם factory |
| P8 | | שדרוג v1 → v2 (order). שדות לא מוכרים נשמרים ב־round-trip |
| P9 | | profile.json פגום בלי גיבוי → פרופיל משוחזר עם `settings["recovered"]` |
| A1 | test_family_parent | ברירות מחדל: ירושלים 40 דק', שבת וחג פועלים, ערכים פועלים |
| A2 | | PIN: set/verify, salt אקראי, איטרציות ≥ 200k, ה־hash לא מכיל את ה־PIN |
| A3 | | PIN לא תקין (אותיות, 3 ספרות, 9 ספרות) נדחה. החלפה דורשת PIN נוכחי |
| A4 | | 5 שגיאות → נעילה. PIN נכון בזמן נעילה נדחה. אחרי 60 שניות פתוח |
| A5 | | נעילה נשמרת בקובץ (ParentStore חדש עדיין נעול). שעון אחורה לא מאריך |
| A6 | | gate: שני מספרים דו־ספרתיים, check נכון/שגוי, דטרמיניסטי עם seed |
| A7 | | secrets: לא ב־parent.json, הרשאות 0600 (POSIX), repr מוסתר, redact/scrub |
| A8 | | limits_for: ברירת מחדל ועקיפה לפי פרופיל. round-trip מלא |
| A9 | | parent.json פגום → ברירות מחדל עם גיבוי |
| C1 | test_family_calendar | חנוכה 2026: 5–12 בדצמבר (8 ימים) |
| C2 | | פסח 2027: 22 באפריל, יום טוב א' וז', חול המועד |
| C3 | | הדלקת נרות בירושלים מול זמנים שפורסמו (±3 דק'), צאת שבת |
| C4 | | Tel Aviv 18 דק', מצב צאת קבוע 40 דק' |
| C5 | | is_restricted: שישי לפני ההדלקה לא, אחרי כן, שבת בצהריים כן, אחרי צאת לא |
| C6 | | ראש השנה יומיים בחלון אחד. סוכות ב' (חול המועד) לא אסור. שמיני עצרת אסור |
| C7 | | חג שמתחבר לשבת = חלון אחד |
| C8 | | next_restriction מיום שלישי → שבת הקרובה |
| C9 | | יום העצמאות: 2022 (שישי → חמישי), 2024 (שני → שלישי), 2025 (שבת → חמישי), 2026. יום הזיכרון יום לפני. יום השואה 2025 (שישי → חמישי) |
| C10 | | upcoming_holidays: שמות בעברית, צומות מסומנים, ט' באב `is_tisha_bav` |
| C11 | | חו"ל: יום טוב שני |
| S1 | test_family_screentime | ALLOW בתוך חלון, WARN_SOON לפני סוף מכסה, MUST_STOP(daily_limit) |
| S2 | | מחוץ לחלון / שעת שינה / סוף שבוע |
| S3 | | שבת שמתחילה באמצע סשן → WARN_SOON ואז MUST_STOP(shabbat) עם grace שיורד ל־0 |
| S4 | | shabbat=False מתעלם משבת. חג → HOLIDAY עם שם החג |
| S5 | | הפסקה: BREAK_SUGGESTED פעם אחת, ack מאפס |
| S6 | | מעבר חצות: חלוקה בין ימים, איפוס מכסה |
| S7 | | DST (מרץ ואוקטובר באסיה/ירושלים): משך נספר לפי זמן אמיתי |
| S8 | | שעון אחורה → 0. קפיצה קדימה → חיתוך |
| S9 | | usage.json נשמר ונטען. פגום → ריק עם גיבוי. ימים ישנים נמחקים |
| S10 | | start כשאסור → MUST_STOP עם grace 0 |
| R1 | test_family_rewards | add/status, פרס לפרופיל אחר לא מוצג |
| R2 | | request → pending → approve. הכוכבים לא יורדים. ה־n דורש n×מחיר |
| R3 | | request בלי מספיק כוכבים נדחה. בקשה כפולה נדחית. decline לא משנה כלום |
| R4 | | הפתעה: כותרת מוסתרת, נפתחת ביצירת בקשה אוטומטית אחת |
| R5 | | מטרה משפחתית שבועית: סכום, נפתחת, מתאפסת בשבוע הבא (ראשון) |
| R6 | | round-trip לקובץ, פגום → ברירות מחדל |
| V1 | test_family_values | ברירות מחדל פועלות, round-trip, מפתחות לא מוכרים נשמרים |
| X1 | test_family_purity | אף מודול ב־`nagmon.family` לא מייבא pygame או tuxemon |
