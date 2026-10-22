# SDD: ארכיטקטורה וחוזים בין רכיבים

> המסמך מגדיר את הגבולות בין הרכיבים ואת החוזים (interfaces) ביניהם, כדי שאפשר יהיה לבנות אותם במקביל.
> לכל רכיב יש SDD משלו (`SDD_<NAME>.md`) עם טבלת בדיקות. שינוי בחוזה מתעדכן כאן קודם.

## 1. החלטות שהתקבלו (מההורה)

| נושא | החלטה |
|---|---|
| ילדים | פסי גיל לעיצוב: A 5–7, B 8–10, C 11–14. התוכן מגיע עד כיתה ט'. פרטי המשפחה בריפו הפרטי `nagmon-data` |
| פלטפורמה | **מחשב** (Windows ו־Linux). אנדרואיד בהמשך, אם בכלל |
| ערכים | זמן מסך, מצב שבת וחג, לוח חגים, ערכים במשימות, ניסוח עדין לקרבות, **צניעות** (דמויות ותלבושות) |
| AI | מודל מרוחק, כי אין GPU. כל ספק חינמי. גם Gemini מותר (החלטת ההורה, אחרי שהובהרה מגבלת התנאים) |
| פרסים אמיתיים | כן |
| היקף | הכול, ב־SDD ו־TDD |

## 2. מבנה

```
nagmon/                      # חבילת Python שלנו. learning, family ו־ai בלי pygame
  learning/                  # מנוע למידה (SDD_LEARNING.md)
  family/                    # פרופילים, הורים, זמן מסך, שבת וחגים, פרסים (SDD_FAMILY.md)
  ai/                        # ספקי LLM, אימות, סטודיו, ינשוף (SDD_AI.md)
  runtime.py                 # "מי משחק עכשיו": מחבר את הפרופיל הפעיל למשחק
mods/nagmon/                 # mod שנטען מעל mods/tuxemon (SDD_MOD_LOADING.md)
  mod.yaml
  learning/                  # תוכן: skills/*.yaml, english/*.yaml, science/*.yaml
  states/ effects/ event/actions/ event/conditions/   # תוספים למשחק
  db/ maps/ gfx/ sprites/ l18n/<loc>/LC_MESSAGES/nagmon.po
tuxemon/                     # מנוע. שינויים קטנים ומבודדים בלבד:
  ui/bidi.py, locale/bilingual.py                      # RTL ושפה כפולה (SDD_HEBREW_RTL.md)
tests/nagmon/                # בדיקות שלנו
docs/kids/                   # תוכנית, SDDs, מחקר
```

**כללים:**
1. `nagmon.learning`, `nagmon.family` ו־`nagmon.ai` **לא מייבאים pygame ולא tuxemon**. Python טהור, נבדק מהר.
2. קוד שמחבר למשחק (states, effects, actions) יושב ב־`mods/nagmon/...` ומייבא מ־`nagmon.*` ומ־`tuxemon.*`.
3. כל שינוי במנוע עצמו (`tuxemon/`) קטן, מכוסה בבדיקה, ומתועד ב־SDD של הרכיב.
4. כל קובץ שמור (פרופיל, התקדמות) הוא JSON עם `schema_version`, וקוד טעינה שיודע לשדרג גרסה ישנה.

## 3. חוזה: שאלה (`nagmon/learning/model.py`)

```python
Subject = Literal["math", "geometry", "english", "science", "logic", "hebrew", "family"]
QuestionKind = Literal["choice", "number", "true_false", "order", "tap_figure", "letters"]

@dataclass(frozen=True)
class Choice:
    id: str                      # "a", "b"... או מזהה יציב
    text_he: str
    text_en: str | None = None
    image: str | None = None     # "emoji:1f436" או נתיב נכס של המשחק

@dataclass(frozen=True)
class Figure:                    # מפרט ציור לגאומטריה. הממשק מצייר, המנוע רק מתאר
    kind: str                    # "polygon" | "angle" | "grid_area" | "circle" | "solid" | "number_line" | "clock" | "bar_model"
    data: Mapping[str, Any]      # למשל {"points": [[0,0],[4,0],[4,3]], "labels": {...}, "grid": True}

@dataclass(frozen=True)
class Question:
    item_id: str                 # מזהה יציב לפריט, למשל "math.mul.facts:7x8". משמש ל־Elo ול־Leitner
    skill_id: str
    subject: Subject
    kind: QuestionKind
    prompt_he: str
    prompt_en: str | None
    answer: str | tuple[str, ...]   # מזהה בחירה, מספר כמחרוזת נורמלית, או סדר מזהים
    choices: tuple[Choice, ...] = ()
    figure: Figure | None = None
    speak: Mapping[str, str] = {}   # {"he": "...", "en": "..."} טקסט להקראה
    explanation_he: str = ""
    explanation_en: str | None = None
    difficulty: float = 0.0         # b התחלתי (סולם Elo, 0 = ממוצע לכיתה של המיומנות)
    misconceptions: Mapping[str, str] = {}  # תשובה שגויה ← תג טעות אופיינית
    source: str = "generator"       # "generator" | "bank" | "ai" | "parent"

def check_answer(q: Question, given: str | Sequence[str]) -> CheckResult  # correct, normalized, misconception|None
```

## 4. חוזה: מנוע הלמידה (`nagmon/learning/engine.py`)

```python
class LearningEngine:
    def __init__(self, content: ContentLibrary, learner: LearnerState,
                 rng: random.Random | None = None, clock: Callable[[], float] = time.time): ...

    def next_question(self, *, subject: Subject | None = None, skill_id: str | None = None,
                      context: str = "battle", max_choices: int | None = None,
                      difficulty_bias: float = 0.0) -> Question
    def submit(self, q: Question, given, *, elapsed_s: float, context: str = "battle",
               hint_used: bool = False) -> AnswerOutcome
    def subject_progress(self, subject: Subject) -> SubjectProgress   # mastery 0..1, stars, frontier skills
    def dashboard(self) -> DashboardData                               # לאזור ההורים

@dataclass(frozen=True)
class AnswerOutcome:
    correct: bool
    quality: Literal["super", "correct", "wrong"]   # super = נכון ומהיר
    misconception: str | None
    explanation_he: str
    coins: int                                      # מטבעות שהרוויח
    newly_mastered: tuple[str, ...]                 # מיומנויות שנשלטו עכשיו (כל אחת = ⭐)
    streak: int
    power_multiplier: float                         # לקרב: 2.0 / 1.5 / 1.0
```

- `LearnerState` עובר סריאליזציה ל־JSON דרך `to_dict()` ו־`from_dict()`, עם `schema_version`. הוא כולל דירוגים, Leitner, יומן, כוכבים, רצף ו־settings.
- `ContentLibrary.load(path)` טוען את `mods/nagmon/learning/**.yaml` ורושם מחוללים.

## 5. חוזה: פרופילים ומשפחה (`nagmon/family/`)

```python
@dataclass
class Profile:
    id: str                      # slug יציב, למשל "p1a2b3"
    name: str
    avatar: str                  # שם sprite של דמות (מתוך הרשימה הצנועה)
    birth_year: int | None
    grade: int                   # 0 = גן ... 9
    language_level: int          # 0..5 (סולם השפה)
    language_locked: bool
    interests: list[str]
    settings: dict[str, Any]     # text_speed, font_scale, timer, questions_per_battle, element_subjects...
    created_at: float

class ProfileStore:
    def __init__(self, root: Path): ...          # root/profiles/<id>/{profile.json, learning.json, saves/}
    def list(self) -> list[Profile]
    def create(self, **fields) -> Profile
    def save(self, p: Profile) -> None
    def delete(self, pid: str) -> None
    def save_dir(self, pid: str) -> Path
    def load_learner(self, pid: str) -> LearnerState
    def save_learner(self, pid: str, s: LearnerState) -> None
```

- `ParentSettings` מכיל PIN (hash עם salt), מיקום (לשבת), כללי זמן מסך, ספק AI ופרסים.
- `ScreenTimePolicy`, `ShabbatCalendar` ו־`RewardsBoard` הם פונקציות טהורות עם `now` מוזרק.

## 6. חוזה: runtime (`nagmon/runtime.py`)

```python
class NagmonRuntime:            # singleton: נוצר ב־startup rule של ה־mod
    store: ProfileStore
    parent: ParentSettings
    active: Profile | None
    engine: LearningEngine | None
    def activate(self, pid: str) -> None      # טוען פרופיל, מגדיר נתיב שמירה, יוצר מנוע
    def persist(self) -> None                 # שומר את learner ואת הפרופיל
runtime = NagmonRuntime(...)
```

- המשחק ניגש ל־`nagmon.runtime.runtime` מתוך states, effects ו־actions.
- כשאין פרופיל פעיל (בבדיקות), השאלות לא מופעלות והמשחק מתנהג כמו Tuxemon הרגיל.

## 7. חוזה: שאלה בתוך המשחק

- **מצב UI:** `QuizState(client, question=None, subject=None, context="battle", on_result=Callable[[AnswerOutcome], None])`.
- **פעולת סקריפט:** `ask_quiz <subject_or_skill>,<result_var>[,context]` ← משתנה = `super|correct|wrong`.
- **תנאים:** `skill_at_least`, `stars_at_least <subject>,<n>`, `language_level_at_least <n>`.
- **קרב:** משתנה קרב `quiz_mult_<monster_instance_id>`, שאפקט `damage` של ה־mod קורא ומעביר כ־`additional_factors={"quiz": m}`.

## 8. שפה

- `T.translate_in(msgid, locale)` מחזיר תרגום בשפה מסוימת בלי לשנות את השפה הפעילה.
- `tuxemon/locale/bilingual.py`: `compose(msgid, params, level, known_words) -> str` לפי סולם השפה (SDD_HEBREW_RTL.md).
- תוכן הלמידה עצמו נושא `*_he` ו־`*_en` ולא עובר דרך po.

## 9. תוכנית עבודה ובעלות

| WP | רכיב | SDD | תלוי ב־ |
|---|---|---|---|
| 1 | טעינת mod מעל הבסיס, תרגום בכמה domains, `translate_in`, הגבלת FPS, שלד ה־mod, CI | SDD_MOD_LOADING | — |
| 2 | מנוע למידה + מחוללי חשבון, גאומטריה והיגיון | SDD_LEARNING | — |
| 3 | עברית: פונט, bidi, RTL, שפה כפולה | SDD_HEBREW_RTL | 1 (קל) |
| 4 | תרגום `he_IL` לכל 5,373 המחרוזות | SDD_TRANSLATION | מילון מונחים |
| 5 | תוכן: גרף מיומנויות K–9, מאגר אנגלית, מאגר מדעים | SDD_CONTENT | 2 (סכמה) |
| 6 | פרופילים, שער הורים, מסך "מי משחק", אשף | SDD_FAMILY / SDD_PROFILES_UI | 1, 2 |
| 7 | QuizState, ask_quiz, קרב, לכידה, חנות, מטבעות וכוכבים | SDD_QUIZ_GAMEPLAY | 2, 3, 6 |
| 8 | זמן מסך, שבת וחגים, פרסים, דשבורד | SDD_FAMILY | 6 |
| 9 | AI: ספקים, סטודיו, ינשוף | SDD_AI | 2 |
| 10 | עולם: סיפור, עיר הבית, אקדמיה ראשונה, צבע חוזר, אתגר יומי, מילון־דקס | SDD_WORLD | 7 |
| 11 | צניעות: החלפת דמויות | SDD_MODESTY | סקירה |
| 12 | הקראה (TTS) | SDD_TTS | 3 |
