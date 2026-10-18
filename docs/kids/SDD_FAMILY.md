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
  goals.py        # PracticeLog, WeeklyStatus, יעד שבועי עם מרווח, יעד משפחתי
  rewards.py      # Celebration, RewardsBoard, Suggestion (חגיגות הפתעה)
  dashboard.py    # WeekSummary, conversation_prompt (שאלה לשיחה עם הילד)
  owl_log.py      # OwlLog: יומן שיחות הינשוף, להורים
  values.py       # FamilyValues
```

קבצים על הדיסק (`root` הוא תיקיית נתוני המשתמש של נגמון):

```
root/
  parent.json                 # ParentSettings (בלי סודות)
  secrets.json                # מפתח API בלבד. הרשאות 0600 איפה שאפשר
  usage.json                  # שניות משחק לכל יום ולכל פרופיל
  practice.json               # באילו ימים כל ילד תרגל
  rewards.json                # חגיגות, הצעות להורה, מצב תצוגה, יעד משפחתי
  profiles/<id>/profile.json
  profiles/<id>/learning.json # dict אטום. מבנה LearnerState מוגדר ב־nagmon.learning
  profiles/<id>/saves/
  profiles/<id>/owl_log.jsonl # append-only, 500 רשומות אחרונות
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
    weekly_days: dict[str, int]                    # K לכל ילד (עקיפה של ברירת המחדל לפי גיל)
    def limits_for(pid) -> ScreenLimits
    def weekly_days_for(pid, age) -> int

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
    warn_minutes = 5; grace_minutes = 3

@dataclass(frozen=True)
class Decision:
    action: Action; reason: Reason | None; minutes_left: int | None
    message_he: str; grace_seconds: int = 0; resume_at: datetime | None = None

class ScreenTimePolicy:                             # טהור
    def __init__(self, limits, *, calendar=None, shabbat=True, holidays=True, stop_before_minutes=0)
    def evaluate(self, now: datetime, used_today_s: float, since_break_s: float = 0) -> Decision

class SessionTracker:
    def __init__(self, root, policy_for: Callable[[str], ScreenTimePolicy], *, tz, max_tick_gap_s=120)
    def start(pid, now) -> Decision; def tick(now, *, at_natural_break=False) -> Decision
    def stop(now) -> None
    def ack_break(now) -> None
    def used_seconds(pid, day: date) -> float; def week_minutes(pid, now) -> int
```

**סדר העדיפויות** ב־`evaluate`: MUST_STOP (שבת/חג > שעת שינה > מחוץ לחלון > מכסה יומית) > WARN_SOON > BREAK_SUGGESTED > ALLOW.

- `minutes_left` = המינימום בין: מה שנשאר מהמכסה, הזמן עד סוף החלון, עד שעת השינה, ועד תחילת שבת/חג (פחות `stop_before_minutes`). WARN_SOON כש־`minutes_left <= warn_minutes`.
- **שבת וחג:** ה־policy שואל את `calendar.restriction_at(now)`. עם `stop_before_minutes` ההגבלה מתחילה מוקדם יותר.
- **אזהרה:** WARN_SOON מתחיל 5 דקות לפני הגבול (`warn_minutes`).
- **grace ונקודת עצירה טבעית:** כש־MUST_STOP מופיע **באמצע** סשן, הילד לא נקטע באמצע קרב או שאלה. ה־tracker קובע מועד סגירה (`now + grace_minutes`, ברירת מחדל 3 דקות), ו־`grace_seconds` יורד בכל tick. המשחק מעביר `at_natural_break=True` כשהוא בנקודה טבעית (סוף קרב, מפה, דיאלוג). אז `grace_seconds=0`, כלומר לשמור ולסגור עכשיו. אם לא הגיעה נקודה טבעית, אחרי 3 דקות `grace_seconds=0` בכל מקרה. ניסיון `start` כשאסור מחזיר MUST_STOP עם `grace_seconds=0`.
- **זמן מסך הוא לא פרס ולא עונש.** אין שום API שמוסיף או מוריד דקות לפי ביצועים.
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

## 7. יעד שבועי עם מרווח (`goals.py`)

```python
def week_start(d: date) -> date                    # יום ראשון
def age_on(today, birth_year, grade) -> int | None # לפי שנת לידה, אחרת כיתה + 6 (גן = 5)
def default_weekly_days(age) -> int                # 3 לגילאי 5–7 (וכשלא ידוע), 4 למבוגרים יותר

@dataclass(frozen=True)
class WeeklyStatus: week_start; practised_days; target_days; available_days; met; message_he

class PracticeLog:                                 # root/practice.json
    def __init__(self, root, *, tz)
    def record(pid, now) -> bool                   # True אם זה יום חדש
    def practised_on(pid, d) -> bool; def total_days(pid) -> int
    def weekly_status(pid, now, *, target_days, is_rest_day=None) -> WeeklyStatus
    def weeks_met(pid, now, *, target_days, is_rest_day=None) -> int   # רק שבועות שהסתיימו

@dataclass(frozen=True)
class FamilyWeekStatus: week_start; met; children_met: tuple[str, ...]; children_total
def family_week_status(statuses: Mapping[str, WeeklyStatus]) -> FamilyWeekStatus
```

- **במקום רצף יומי:** יעד של K ימי תרגול בשבוע (ראשון עד שבת). אין שום שדה `streak` ואין הודעה על "רצף שנשבר". שבוע שלא עמד ביעד פשוט נגמר, ושבוע חדש מתחיל.
- **שבת ויום טוב לא נספרים** במכנה: `available_days` = ימי השבוע שאינם `is_rest_day` (מגיע מ־`ShabbatCalendar.is_restricted_day`). היעד בפועל = `min(K, available_days)`.
- **ההורה יכול לשנות את K** לכל ילד (`ParentSettings.weekly_days`).
- **יעד משפחתי שיתופי:** מתקיים כש**כל** ילד עומד ביעד האישי שלו. לא סכום כוכבים, שמעדיף את הגדול.

## 8. חגיגות (`rewards.py`)

```python
class RewardsMode(StrEnum): SURPRISE = "surprise"; VISIBLE_GOALS = "visible_goals"
VISIBLE_GOALS_WARNING_HE: str                      # הסבר המחקר, מוצג להורה לפני שמפעיל
class MilestoneKind(StrEnum):                      # רק אבני דרך של מאמץ. אין "דקות מסך"
    PRACTICE_DAYS, SKILLS_MASTERED, SKILL, ACADEMY, WEEKLY_GOALS, STARS

@dataclass
class Celebration: id; title_he; milestone: MilestoneKind; threshold: int = 1
                   target_id: str | None = None   # חובה ל־SKILL ול־ACADEMY
                   profile_id: str | None = None  # None = לכל ילד
                   repeatable: bool = False; secret: bool = False; active: bool = True
@dataclass(frozen=True)
class ProgressStats: practice_days; skills_mastered: frozenset; academies: frozenset
                     weekly_goals_met; stars; titles: Mapping[str, str]
@dataclass
class Suggestion: id; profile_id | None; celebration_id | None; level
                  status: "pending" | "celebrated" | "dismissed"
                  source: "milestone" | "kid_request" | "family_goal"
                  message_he; created_at; decided_at; week_start

class RewardsBoard:                                # root/rewards.json
    def __init__(self, root, *, clock=time.time)
    mode; def set_mode(mode)
    def add_celebration(**f) -> Celebration; def update_celebration(c); def remove_celebration(cid)
    def celebrations(profile_id=None, *, include_inactive=False) -> list[Celebration]
    def evaluate(pid, stats) -> list[Suggestion]   # אבני דרך חדשות → הצעות להורה
    def pending() -> list[Suggestion]; def history(pid) -> list[Suggestion]
    def mark_celebrated(sid) -> Suggestion; def dismiss(sid) -> Suggestion
    def kid_view(pid, stats) -> list[GoalView]     # [] במצב הפתעה
    def request(pid, cid, stats) -> Suggestion     # רק במצב יעדים גלויים, ורק כשהיעד הושג
    family_goal; def set_family_goal(title_he | None)
    def evaluate_family(status: FamilyWeekStatus) -> Suggestion | None   # פעם אחת בשבוע
```

**רציונל (מחקר מוטיבציה):** פרס מוחשי שמובטח מראש ותלוי בביצוע מחליש מוטיבציה פנימית (Deci, Koestner & Ryan, 1999). פרס לא צפוי, ומשוב מידעי, כמעט לא פוגעים בה. לכן:

1. **ברירת המחדל היא "חגיגות הפתעה".** ההורה מגדיר חגיגות בפרטיות. כשילד מגיע לאבן דרך של מאמץ (ימי תרגול, מיומנות שנשלטה, אקדמיה שהסתיימה, יעדים שבועיים), המערכת **מציעה להורה** שהגיע זמן לחגוג. הילד לא רואה מחירון.
2. **ההודעה לילד היא מידע**, לא תשלום: "עבדת קשה על שברים והצלחת!". שם הפרס לא מופיע בה.
3. **שום דבר לא נשלל.** אין "מחיר" שיורד מהכוכבים. ירידה בנתונים לא מבטלת חגיגה. דחייה (`dismiss`) רק מסירה את ההצעה, ואותה רמה לא תוצע שוב.
4. **זמן מסך לא משמש פרס ולא עונש.** אין סוג אבן דרך כזה.
5. **מצב "יעדים גלויים"** אופציונלי, וההורה מפעיל אותו אחרי שהוא רואה את `VISIBLE_GOALS_WARNING_HE`. במצב הזה הילד רואה את היעדים וההתקדמות (חוץ מ־`secret`), ויכול לבקש מימוש כשהגיע. כל מימוש דורש אישור הורה.
6. **אבן דרך שחוזרת** (`repeatable`) מוצעת פעם אחת לכל רמה (`value // threshold`). קפיצה של כמה רמות יוצרת הצעה אחת, לא מבול.
7. **יעד משפחתי** (`set_family_goal("ערב פיצה")`) מוצע להורה פעם אחת בשבוע שבו כל הילדים עמדו ביעד האישי.

## 9. דשבורד: שאלה לשיחה (`dashboard.py`)

```python
@dataclass(frozen=True)
class WeekSummary: mastered: tuple[str, ...] = (); practised = (); struggles = (); days_practised: int = 0
    @classmethod from_dict(d) -> WeekSummary
def conversation_prompt(name: str, summary: WeekSummary, *, variant: int = 0) -> str
```

פונקציה טהורה שמחזירה משפט אחד בעברית להורה. העדיפות: מיומנות שנשלטה ("בקשו מנועה להסביר לכם את שטח המשולש") > קושי (ניסוח עדין: "מה היה מאתגר?", לנסות יחד) > נושא שתורגל > שבוע שקט (בלי אשמה: "מה הכי כיף במשחק?"). `variant` (למשל מספר השבוע) מחליף בין ניסוחים, באופן דטרמיניסטי.

## 10. יומן הינשוף (`owl_log.py`)

```python
MAX_ENTRIES = 500
@dataclass(frozen=True)
class OwlEntry: ts: float; role: "child" | "owl" | "system"; text: str; meta: dict
class OwlLog:
    def __init__(self, root, *, clock=time.time)
    def append(pid, role, text, *, meta=None) -> OwlEntry
    def read(pid, *, limit=None) -> list[OwlEntry]          # מהישן לחדש
```

- קובץ JSONL לכל פרופיל, `profiles/<id>/owl_log.jsonl`. כל שיחה עם הינשוף (WP9) נרשמת, וההורה קורא אותה בדשבורד.
- append-only: אין API לעריכה או למחיקה (המחיקה היחידה היא מחיקת הפרופיל כולו).
- שמירה: 500 הרשומות האחרונות. כשעוברים את הגבול, הקובץ נכתב מחדש באופן אטומי. שורה פגומה מדולגת.
- מזהה פרופיל נבדק (אין `..`), והפרופיל חייב להתקיים.

## 11. ערכים (`values.py`)

```python
@dataclass
class FamilyValues:
    kindness_quests: bool = True; gentle_battle_wording: bool = True; modesty_filter: bool = True
    emphasis: list[str] = ["giving", "respect", "honesty", "responsibility", "helping"]
```

## 12. טבלת בדיקות

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
| S11 | | `at_natural_break` מסיים את ה־grace מיד. לפני הגבול הוא לא משנה כלום |
| G1 | test_family_goals | שבוע מתחיל בראשון. K לפי גיל. גיל לפי שנת לידה או כיתה |
| G2 | | יום תרגול נרשם פעם אחת, לפי התאריך המקומי |
| G3 | | שבת ויום טוב יוצאים מהמכנה (שבוע פסח 2027: 5 ימים), היעד מוגבל ל־available |
| G4 | | אין `streak` בשום שדה או הודעה |
| G5 | | `weeks_met` סופר רק שבועות שהסתיימו |
| G6 | | יעד משפחתי: רק כשכל ילד עמד ביעד. ריק = לא |
| G7 | | שמירה, טעינה, קובץ פגום |
| R1 | test_family_rewards | ברירת מחדל: הפתעה. אזהרה בעברית ליעדים גלויים |
| R2 | | אימות חגיגה: כותרת, סף, target ל־skill, אין סוג "screen" |
| R3 | | אבן דרך → הצעה אחת להורה. הודעה מידעית בלי שם הפרס |
| R4 | | חוזרת: הצעה אחת לכל רמה, קפיצה של רמות = אחת |
| R5 | | לפי פרופיל. ירידה בנתונים לא שוללת. celebrate/dismiss, dismiss לא חוזר |
| R6 | | kid_view ריק במצב הפתעה. במצב גלוי: התקדמות, בלי secret |
| R7 | | request: רק במצב גלוי ורק כשהושג. כפול מחזיר את הקיים |
| R8 | | יעד משפחתי: פעם אחת בשבוע |
| R9 | | round-trip, קובץ פגום → ברירות מחדל |
| D1 | test_family_dashboard | עדיפויות: נשלט > קושי > תרגול > שבוע שקט. ניסוח עדין. variant דטרמיניסטי |
| O1 | test_family_owl_log | append/read, limit, שמירת 500, תפקיד לא חוקי, פרופיל לא קיים, שורה פגומה |
| V1 | test_family_values | ברירות מחדל פועלות, round-trip, מפתחות לא מוכרים נשמרים |
| X1 | test_family_purity | אף מודול ב־`nagmon.family` לא מייבא pygame או tuxemon |
