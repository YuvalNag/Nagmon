# SDD: ‏AI — ספקים, ניתוב, סטודיו תוכן וינשוף (WP9)

> הרכיב `nagmon/ai/`. ‏Python טהור: לא מייבא pygame ולא tuxemon. בדיקות ב־`tests/nagmon/test_ai_*.py`, **בלי שום קריאת רשת אמיתית** (transport מזויף מוזרק).
> רקע ונימוקים: `RESEARCH_AI_PROVIDERS.md`, ‏`GAME_PLAN.md` §0 ו־§11. פורמט התוכן: `SDD_CONTENT.md` §3–§5.

## 1. החלטות

| נושא | החלטה |
|---|---|
| ספק | מרוחק, חינמי. כל הספקים דרך ממשק OpenAI-compatible אחד (`/chat/completions`, ‏`/models`) |
| סטודיו להורה (מבוגר) | Gemini → ‏Groq → ‏Cerebras → ‏OpenRouter (מודלי `:free`) → ‏Mistral |
| ינשוף והסבר נוסף (ילד) | Groq (להדליק **Zero Data Retention** ב־Groq console) → ‏Cloudflare Workers AI → תשובות מוכנות בלי רשת |
| Gemini לילדים | **כבוי.** מותר רק אם ההורה מדליק במפורש `allow_gemini_for_kids`, אחרי שהוצג לו `GEMINI_KID_WARNING_HE`. אז הוא נכנס **אחרון** בשרשרת של הילד |
| מזהי מודלים | לא מאומתים. מגלים בזמן ריצה ב־`GET {base}/models`, בוחרים לפי רשימת העדפות, שומרים 24 שעות, ויש fallback מובנה |
| HTTP | `urllib` מהספרייה הסטנדרטית, מאחורי `Transport` שאפשר להחליף |
| מה נשלח | סטודיו: מיומנות, כיתה, נושא, תחומי עניין. ינשוף: השאלה וטווח גיל. **אף פעם לא שם, לא מזהה ילד, לא היסטוריה** |
| אישור | כל פריט שנוצר בסטודיו עובר validator בקוד **ואישור ידני** של ההורה. רק מה שאושר נכנס ל־`ai_bank` |

## 2. מבנה

```
nagmon/ai/
  __init__.py
  providers.py   # ProviderConfig, Transport, UrllibTransport, OpenAICompatClient, ProviderError
  router.py      # Router, StateStore (JsonStateStore, MemoryStateStore), Budget, ProviderStatus
  config.py      # PRESETS, AISettings, load_keys, build_studio_router, build_kid_router, טקסטי אזהרה
  validate.py    # extract_json, clean_text, validate_items, validate_vocab, validate_story, validate_quest
  safety.py      # Safety: סינון קלט ופלט לילדים
  canned.py      # CannedAnswers: owl_faq.yaml, התאמה לפי מילות מפתח
  owl.py         # Owl, OwlAnswer, OwlLogAdapter, OWL_NOTICE_HE
  explain.py     # Explainer.explain_again
  studio.py      # Studio + CLI ‏(python -m nagmon.ai.studio)
  text.py        # clean_text, ניקוד, tokens/variants (הסרת אותיות שימוש)
  fakes.py       # FakeTransport, FakeClock, FakeRouter — לבדיקות ולמסכי UI בלי רשת
mods/nagmon/learning/owl_faq.yaml   # כ־60 שאלות ותשובות מוכנות
```

קבצים בתיקיית הנתונים (`data_root`, ברירת מחדל `~/.nagmon` או `$NAGMON_DATA`):

```
data_root/
  ai_state_studio.json       # מצב נתב הסטודיו: מנוחות, סטטוס ספקים, מטמון מודלים, שימוש יומי
  ai_state_kid.json          # מצב נתב הילדים (קובץ נפרד, כדי ששני נתבים לא ידרסו זה את זה)
  ai_pending/<stamp>.yaml    # פריטים שמחכים לאישור ההורה
  ai_pending/rejected.jsonl  # רישום של מה שנדחה
  ai_bank/<subject>.yaml     # {items: [...]} — פריטי §3 שאושרו (מאגר נוסף למנוע הלמידה)
  ai_bank/reading.yaml       # רשימת קטעי קריאה לפי §5
  ai_bank/vocab.yaml         # רשימת מילים לפי §4
  ai_bank/quests.yaml        # משימות NPC קצרות
  ai_bank/provenance.yaml    # {id: {provider, model, created, request}} — מי ייצר כל פריט
  ai_explain_cache.json      # מטמון "תסביר לי אחרת"
  secrets.json               # (של WP8) — מפתחות AI תחת "ai_keys", הרשאות 0600
```

## 3. ספקים (`providers.py`)

```python
@dataclass
class ProviderConfig:
    name: str                       # "groq"
    base_url: str
    api_key: str | None
    models_pref: list[str]          # העדפות, לפי סדר. תומך ב־"*" (fnmatch)
    extra_headers: dict[str, str] = {}
    kid_safe: bool = False          # מותר בשימוש מול ילד
    fallback_models: list[str] = [] # אם הגילוי נכשל
    supports_json_schema: bool = False
    daily_reset_tz: str = "UTC"     # מתי מתאפסת מכסה יומית (Gemini: America/Los_Angeles)
    label_he: str = ""

class Transport(Protocol):
    def __call__(self, method, url, headers, body: bytes | None, timeout: float) -> HttpResponse
    # זורק TransportTimeout או TransportError

class OpenAICompatClient:
    def __init__(self, config, transport=None, clock=time.time)
    def discover_models(self, *, force=False) -> list[str]     # GET /models, מטמון 24h
    def resolve_models(self, exclude=()) -> list[str]          # מועמדים לפי העדפה
    def chat(self, messages, *, json_schema=None, temperature=0.7,
             max_tokens=1024, timeout=45.0, model=None) -> str
    def chat_result(...same...) -> ChatResult(text, model, provider, usage)
```

- **בקשה:** ‏`POST {base}/chat/completions` עם `Authorization: Bearer`, ‏`model`, ‏`messages`, ‏`temperature`, ‏`max_tokens`.
- **JSON:** אם יש `json_schema`:
  - ספק עם `supports_json_schema` → `response_format={"type": "json_schema", "json_schema": {"name", "schema"}}`.
  - אחרת → `{"type": "json_object"}`, והסכמה נכנסת להודעת המערכת ("החזר רק JSON לפי הסכמה").
  - אם הספק מחזיר 400 על `json_schema` → הלקוח זוכר שאין תמיכה וחוזר מיד על הבקשה עם `json_object`.
- **גילוי מודלים:** `{"data": [{"id": ...}]}`. תחילית `models/` (של Gemini) מוסרת. נשמר 24 שעות. כישלון (רשת, 404) → fallback, ושמירה של שעה כדי לא להציף.
- **התאמת העדפות:** לכל העדפה לפי הסדר: התאמה מדויקת; אחר כך `fnmatch` אם יש `*`; אחר כך תחילית; אחר כך "מכיל". בין כמה התאמות: הקצר קודם. מודלים של תמונה, קול, embedding ו־guard (`tts`, `image`, `embed`, `audio`, `whisper`, `guard`...) לא נבחרים בהתאמה חלקית.
- **שגיאות:** כל כישלון הוא `ProviderError(kind, status, message, retry_after, per_day)`:

| מצב | `kind` |
|---|---|
| 429 | `rate_limit` (‏`per_day=True` אם בגוף או בכותרות מופיע per day / PerDay / RPD / TPD / daily, או `Retry-After` > שעה) |
| 5xx | `server` |
| 401, 403 | `auth` |
| 404 (או 400 עם model not found) | `model_not_found` |
| 400 אחר | `bad_request` |
| timeout | `timeout` |
| כשל רשת | `network` |
| גוף לא תקין / ריק | `bad_response` |

## 4. נתב (`router.py`)

```python
class Router:
    def __init__(self, providers: Sequence[OpenAICompatClient], state_store, clock=time.time,
                 *, budget=Budget(), budget_tz="Asia/Jerusalem",
                 request_timeout=45.0, overall_deadline=120.0)
    def chat(self, messages, *, purpose: "studio" | "kid", budget_key: str | None = None,
             json_schema=None, temperature=0.7, max_tokens=1024,
             timeout=None, deadline=None) -> RouterResult(text, provider, model)
    def status_report(self) -> list[ProviderStatus]     # למסך ההגדרות של ההורה
    def usage_today(self, purpose, budget_key=None) -> int
    def reset_provider(self, name) -> None               # אחרי שההורה החליף מפתח
```

- **סדר:** הספקים לפי הסדר שניתן. ב־`purpose="kid"` נכנסים רק ספקים עם `kid_safe=True` (הגנה כפולה, גם אם השרשרת נבנתה לא נכון).
- **בכל ספק** מנסים את המודלים מ־`resolve_models`, חוץ ממודלים שבמנוחה או שסומנו כחסרים.

| שגיאה | מה הנתב עושה |
|---|---|
| 429 לדקה | מנוחה למודל לפי `Retry-After`, או 60 שניות. ממשיכים למודל הבא |
| 429 ליום | מנוחה למודל עד חצות הבאה ב־`daily_reset_tz` של הספק (Gemini: ‏America/Los_Angeles) |
| 5xx | ניסיון חוזר אחד לאותו מודל, ואז הספק הבא |
| 401 / 403 | הספק מסומן "בעיית מפתח" עם הסבר בעברית, ומדלגים עליו עד שהמפתח משתנה (טביעת SHA-256 קצרה) או `reset_provider` |
| 404 מודל | המודל נפסל עד הגילוי הבא, ממשיכים למודל הבא |
| timeout / רשת | הספק הבא |
| `bad_request` / `bad_response` | המודל הבא |

- **זמנים:** timeout לבקשה 45 שניות; דדליין כולל 120 שניות (בנתב הילדים: 15 ו־30). ה־timeout של כל ניסיון הוא `min(timeout, הזמן שנשאר)`.
- **תקציב יומי** (`Budget(studio_per_day=300, kid_per_child_per_day=60)`): נספרת כל בקשה **שהצליחה**. ‏`kid` נספר לפי `budget_key` (מזהה ילד, נשמר מקומית בלבד). אם נגמר → `BudgetExceeded(message_he)` לפני כל קריאה. היום נקבע לפי `budget_tz`.
- **מצב שמור** ב־`ai_state_studio.json` / `ai_state_kid.json` עם `schema_version: 1`. קובץ פגום → מתחילים ממצב ריק. כתיבה אטומית.
- **הודעות סטטוס בעברית פשוטה** (אף פעם לא "429" גולמי): `ProviderStatus(name, label_he, state, message_he)`, ‏`state` ∈ `ok | no_key | key_problem | resting | daily_quota | unavailable | unknown`.
- **כשכולם נכשלו:** `AllProvidersFailed(message_he, errors)`.

## 5. אימות פלט (`validate.py`)

פלט המודל הוא **קלט לא אמין**.

- `extract_json(text)`: מסיר גדרות ```` ``` ````, מוצא את האובייקט או המערך המאוזן **הראשון** שעובר `json.loads` (מתחשב במחרוזות ובתווי escape), ומתקן פסיקים מיותרים לפני `}`/`]`. אחרת `ValidationError`.
- `clean_text(s)`: מסיר ניקוד וטעמים (U+0591–U+05C7, חוץ ממקף עברי ופיסוק), תווי בקרה ותווי כיווניות (Cf), ומכווץ רווחים.
- `validate_items(raw, *, skill_id, grade, subject, id_factory) -> ValidationResult(valid, rejected)`:
  - **מזהה:** תמיד `"ai." + uuid8` (מתעלמים מהמזהה של המודל). ב־story: `"<id>.q<n>"`.
  - **מפתחות פלט** בדיוק לפי §3: `id, skill, kind, grade, difficulty, prompt_he, prompt_en, choices, answer, explanation_he, explanation_en, tags`. בבחירה: `he, en, emoji`.
  - **kind:** ‏`choice | true_false | order` (תיקון: `multiple_choice`→`choice`, ‏`truefalse`/`boolean`→`true_false`).
  - **choice:** 2–4 בחירות, ייחודיות (אחרי נרמול), `answer` שלם בטווח. תיקון: בחירה כמחרוזת → `{he: ...}`; ‏`answer` כמחרוזת ספרה או כטקסט של בחירה → אינדקס.
  - **order:** 3–5 בחירות ייחודיות, ‏`answer` תמורה של האינדקסים.
  - **true_false:** ‏`answer` בוליאני (תיקון: `"true"`, ‏`"נכון"`...). הבחירות נמחקות (המנוע מוסיף).
  - **אורכים:** ‏`prompt_he` ≤ 140, בחירה ≤ 40, ‏`explanation_he` ≤ 200 (חובה), ‏`prompt_en` ≤ 200, ‏`explanation_en` ≤ 300. **לא מקצרים** טקסט ארוך — דוחים.
  - **עברית:** ב־`prompt_he` וב־`explanation_he` חייבות להיות אותיות עבריות. אין ניקוד (מוסר בתיקון).
  - **בטיחות:** אין URL, אין מילים מרשימת החסימה של `Safety`.
  - `grade` שלם 0..9 (חסר → הכיתה שביקשו), ‏`difficulty` נחתך ל־[-2, 2], ‏`skill` נכפה למיומנות שביקשו, ‏`tags` רשימת slugs + `ai`. ‏`emoji` רק קוד hex תקין, אחרת נמחק.
- `validate_vocab(raw)` לפי §4: `word` (אותיות לטיניות, ≤ 40), ‏`he` (עברית, ≤ 40), ‏`pos`, ‏`topic` (slug), ‏`level` ∈ preA1/A1/A2/B1, ‏`grade`, ‏`emoji` או null, ‏`example_en` (מכיל את המילה, ≤ 120), ‏`example_he` (≤ 120).
- `validate_story(raw, ...)` לפי §5: `title` ≤ 60, ‏`text_en` ≤ 1200, ‏`text_he` ≤ 1500, ‏1–5 שאלות (פריטי §3).
- `validate_quest(raw, ...)`: `title_he` ≤ 40, ‏`npc_name_he` ≤ 20, ‏`intro_he` ≤ 200, ‏`task_he` ≤ 200, ‏`success_he` ≤ 140, ‏`skill`, ‏`grade`.

## 6. סטודיו (`studio.py`)

```python
class Studio:
    def __init__(self, router, data_root, *, content_root=None, clock=time.time, id_factory=None)
    def generate_questions(self, skill_id, grade, subject, n=5, interests=(), language="he") -> PendingBatch
    def generate_story(self, grade, level, interests=()) -> PendingBatch
    def generate_quest(self, grade, skill_id, subject, interests=()) -> PendingBatch
    def generate_vocab(self, topic, level, grade, n=8) -> PendingBatch
    def pending(self) -> list[PendingEntry]
    def approve(self, ids) -> list[str]       # מעביר ל־ai_bank, מוחק מ־pending
    def reject(self, ids) -> list[str]
    def edit(self, item_id, new_item) -> PendingEntry   # מאמת מחדש
```

- **הנחיות (prompt) בעברית**, עם דרישות פדגוגיות מפורשות: מתאים לגיל (כיתה g ≈ גיל g+6), מדויק מדעית, הסבר **שמלמד** (למה, לא רק מה), מסיחים סבירים שנבנים מטעויות נפוצות, ערכי משפחה וצניעות, בלי ניקוד, פנייה ניטרלית מגדרית (רבים: "בחרו", "סדרו"), שילוב תחומי העניין רק כשזה טבעי.
- **few-shot:** עד 2 פריטים מאותה מיומנות (ואם אין, מאותו מקצוע) מתוך `mods/nagmon/learning/**/*.yaml`. אם אין מאגרים — דוגמה מובנית.
- **תיקון:** אם הפלט לא JSON → ניסיון "repair" אחד ("החזר רק JSON תקין").
- **כפילויות:** פריט ש־`prompt_he` שלו כבר קיים במאגרים, ב־`ai_bank` או ב־pending — נדחה.
- **pending:** `ai_pending/<YYYYmmdd-HHMMSS>.yaml` עם `schema_version`, ‏`request`, ‏`provenance` (ספק ומודל), ‏`entries` (‏`type`, ‏`subject`, ‏`item`) ו־`rejected_by_validator` (שההורה יראה מה נזרק ולמה).
- **CLI:** `python -m nagmon.ai.studio [--data-root D] <cmd>`:
  - `questions --skill S --grade G --subject X [-n N] [--interests a,b] [--language he|en]`, ‏`story`, ‏`quest`, ‏`vocab`;
  - `review` — מציג כל פריט ושואל `y/n/e/s/q` (אשר / דחה / ערוך שדה / דלג / צא);
  - `review --auto-validate-only` — מריץ את ה־validator על pending ומדווח, בלי לאשר;
  - `list`, ‏`approve ID...`, ‏`reject ID...`, ‏`status`.
  - מפתחות: משתני סביבה (`GEMINI_API_KEY`, ‏`GROQ_API_KEY`, ‏`CEREBRAS_API_KEY`, ‏`OPENROUTER_API_KEY`, ‏`MISTRAL_API_KEY`, ‏`CLOUDFLARE_API_TOKEN`, ‏`CLOUDFLARE_ACCOUNT_ID`), ואז `secrets.json["ai_keys"]`.

## 7. בטיחות מול ילדים (`safety.py`)

- **קלט** (`check_input(text) -> SafetyVerdict(ok, category, message_he, alert)`), מקומית, לפני כל שליחה:
  - אורך עד 120 תווים.
  - **פרטים אישיים:** אימייל, URL, רצף של 7 ספרות ומעלה (טלפון, ת"ז), כתובת ("רחוב", "גר ב"...), שם ("קוראים לי", "my name is"). → "אסור לספר לינשוף פרטים אישיים." **הערך לא נרשם ביומן.**
  - **מצוקה** ("מרביצים לי", "לפגוע בעצמי"...) → "כדאי לספר למבוגר שסומכים עליו. זה חשוב." + `alert=True` ביומן.
  - **נושאים חסומים** בעברית ובאנגלית: אלימות, רומנטיקה, מפחיד, למבוגרים, סמים, דת ומחלוקת → "זו שאלה טובה לשאול את ההורים."
  - התאמה לפי מילים, אחרי הסרת אותיות שימוש (ו, ה, ב, ל, מ, ש, כ) — כדי ש"להרוג" ייתפס אבל "מתמטיקה" לא ייתפס בגלל "מת". ההורה יכול להוסיף מילים (`extra_banned`).
- **פלט** (`check_output(text, *, question_is_hebrew) -> OutputVerdict(ok, text, reason)`):
  - מסיר URL ו־markdown, ניקוד ותווי בקרה.
  - עד 3 משפטים (חותך משפטים מיותרים), עד 60 מילים ו־300 תווים.
  - לפחות 70% אותיות עבריות כשהשאלה בעברית.
  - בלי מילים חסומות ובלי שאלות אישיות ("איך קוראים לך", "איפה אתה גר").
  - נכשל → התשובה המוכנה (canned).

## 8. הינשוף (`owl.py`)

```python
OWL_NOTICE_HE = "ההורים יכולים לקרוא את השיחות עם הינשוף"
@dataclass(frozen=True)
class OwlAnswer:
    text_he: str
    source: Literal["ai", "canned", "blocked"]
    reason: str | None = None   # faq, pii, distress, topic, too_long, empty, model_refusal, output_filter, offline, budget, disabled, error
    alert: bool = False
class Owl:
    def __init__(self, router, safety, log_store, canned, *, clock=time.time)
    def ask(self, profile_age: int, question_he: str, *, profile_id: str | None = None) -> OwlAnswer
    def menu(self, profile_age: int) -> list[str]   # שאלות מוכנות לגיל 5–7 (בלי מקלדת)
```

סדר `ask`:
1. ניקוי הקלט, ואז `safety.check_input` → חסום: `source="blocked"`.
2. שאלה שזהה לשאלה ב־FAQ → התשובה המאושרת, בלי רשת (`reason="faq"`).
3. `router` הוא `None` → canned (`disabled`).
4. `router.chat(purpose="kid", budget_key=profile_id, json_schema=OWL_SCHEMA, temperature=0.3, timeout=15, deadline=30)`.
   הנחיית המערכת: ינשוף חביב, עברית פשוטה לגיל N, עד 3 משפטים קצרים, מדויק מדעית, בלי קישורים, בלי שאלות אישיות, "אם לא בטוח — אמור", ערכים צנועים, לא מעמיד פנים שהוא אדם. **לא נשלחים שם או מזהה** (רק טווח גיל).
5. `{"answer", "refusal", "needs_parent"}`: ‏refusal / needs_parent → נוסח קבוע להורים (`blocked`, ‏`model_refusal`).
6. `safety.check_output` נכשל → canned (`output_filter`). ‏`BudgetExceeded` → canned (`budget`, "הינשוף נח קצת"). ‏`AllProvidersFailed` → canned (`offline`).
7. **כל** שאלה ותשובה נרשמות: `log_store.append({ts, profile_id, age, question, answer, source, reason, alert, provider, model, latency_ms})`. ב־PII השאלה נרשמת כ־"[הוסר: פרטים אישיים]".

- `OwlLogAdapter(owl_log, pid)` מתאים ל־`OwlLog.append(pid, role, text, meta=)` של WP8 (רשומת child ורשומת owl).
- **canned** (`canned.py`): `mods/nagmon/learning/owl_faq.yaml` — 67 שאלות מדע נפוצות, `{id, q_he, keywords, a_he, min_age, topic}`. התאמה: לפחות מילת מפתח אחת, **וגם** לפחות 60% ממילות התוכן של השאלה (בלי "למה", "איך"...) נמצאות במילות המפתח או בשאלה של הפריט. כך "למה הים כחול?" לא יקבל את התשובה על מלח. אין התאמה → `fallback_he`.

## 9. הסבר נוסף (`explain.py`)

```python
class Explainer:
    def __init__(self, router, safety, cache_path=None, *, log_store=None)
    def explain_again(self, question_dict, given_answer, age, *, profile_id=None) -> OwlAnswer
```

- מקבל פריט §3 (`id`, ‏`choices[].he`, ‏`answer` אינדקס) או `Question` כ־dict (`item_id`, ‏`choices[].text_he`, ‏`answer` מזהה).
- מבקש **הסבר אחר** מהקיים, בצעדים, בלי האשמה, לגיל N, עד 3 משפטים. אותה שכבת בטיחות (פלט).
- מטמון לפי `item_id + given_answer` (קובץ JSON). בלי רשת / כשל → `explanation_he` של הפריט (`canned`).

## 10. מה ה־UI צריך לקרוא

- **מסך הגדרות ההורה:** `build_studio_router(...)`/`build_kid_router(...)` → `router.status_report()` (שורות עברית); ‏`GROQ_ZDR_NOTE_HE`; כפתור "אפשר Gemini לילדים" שמציג `GEMINI_KID_WARNING_HE` ומשנה `AISettings.allow_gemini_for_kids`; ‏`save_keys(data_root, {...})`; ‏`router.reset_provider(name)` אחרי החלפת מפתח; ‏`router.usage_today("kid", pid)`.
- **מסך הינשוף:** `Owl(build_kid_router(...) or None, Safety(), OwlLogAdapter(owl_log, pid), CannedAnswers.load(...))`; הצגת `OWL_NOTICE_HE` תמיד; לגיל 5–7 `owl.menu(age)` בלבד; `owl.ask(age, text, profile_id=pid)`. הקריאה חוסמת (עד 30 שניות) — להריץ ב־thread.
- **QuizState:** כפתור "תסביר לי אחרת" → `Explainer.explain_again(item, given, age)`.
- **מנוע הלמידה:** לטעון את `ai_bank/<subject>.yaml` כמאגר נוסף. מזהים מתחילים ב־`ai.` (לא בתחילית המקצוע).

## 11. טבלת בדיקות

| # | קובץ | מה נבדק |
|---|---|---|
| P1 | test_ai_providers | `chat` מחזיר את הטקסט; כותרות Authorization ו־extra_headers; גוף הבקשה |
| P2 | | `json_schema` נשלח כ־`json_schema` לספק שתומך, וכ־`json_object` + סכמה בהנחיה לספק שלא |
| P3 | | 400 על json_schema → ניסיון חוזר עם json_object, ונזכר |
| P4 | | 429 → `rate_limit` עם `retry_after`; ‏per_day מזוהה מגוף ההודעה |
| P5 | | 500 → `server`; ‏401/403 → `auth`; ‏404 → `model_not_found`; timeout → `timeout`; גוף ריק → `bad_response` |
| P6 | | גילוי `/models`: מסיר `models/`, מטמון 24 שעות, רענון אחרי 24 שעות |
| P7 | | התאמת העדפות: מדויק > fnmatch > תחילית > מכיל; קצר קודם; מודלי tts/image לא נבחרים |
| P8 | | כישלון גילוי → fallback |
| R1 | test_ai_router | הספק הראשון מצליח; נופלים לספק הבא בשגיאה |
| R2 | | 429 לדקה → מנוחה לפי Retry-After / 60 שניות, והמודל חוזר אחריה |
| R3 | | 429 ליום ב־Gemini → מנוחה עד חצות America/Los_Angeles |
| R4 | | 5xx → ניסיון חוזר אחד ואז הספק הבא |
| R5 | | 401 → "בעיית מפתח" בעברית, דילוג בקריאות הבאות, איפוס כשהמפתח משתנה |
| R6 | | 404 מודל → נפסל עד הגילוי הבא |
| R7 | | timeout → הספק הבא; דדליין כולל נאכף |
| R8 | | `purpose="kid"` מדלג על ספק שלא kid_safe |
| R9 | | תקציב: 60 לילד ביום, איפוס ביום חדש, ספירה רק על הצלחה |
| R10 | | מצב נשמר בקובץ ונטען מחדש; קובץ פגום → מצב ריק |
| R11 | | `status_report` בעברית, בלי מספרי HTTP |
| C1 | test_ai_config | שרשראות ברירת מחדל: סטודיו וילד; Gemini לילד רק כשההורה הדליק; Cloudflare עם account id; טעינת מפתחות |
| V1 | test_ai_validate | `extract_json` מטקסט מבולגן: גדרות, טקסט לפני ואחרי, סוגריים בתוך מחרוזות, פסיק מיותר |
| V2 | | פריט תקין עובר; מזהה `ai.` + 8 תווי hex; מפתחות לפי §3 בלבד |
| V3 | | תיקונים: ניקוד, תווי בקרה, answer כמחרוזת, בחירות כמחרוזות, true_false |
| V4 | | דחיות: בחירות כפולות, answer מחוץ לטווח, אורכים, בלי עברית, URL, מילה חסומה, kind לא מוכר, מספר בחירות |
| V5 | | order: תמורה תקינה |
| V6 | | אוצר מילים §4: תקין, pos/level לא חוקי, דוגמה בלי המילה |
| V7 | | story §5 ו־quest |
| S1 | test_ai_studio | `generate_questions` → קובץ pending עם פריטים תקינים ודחויים |
| S2 | | הנחיה בעברית עם few-shot מהמאגר, דרישות פדגוגיות, בלי שם ילד |
| S3 | | approve → `ai_bank/<subject>.yaml` + provenance; reject; ‏pending מתרוקן ונמחק |
| S4 | | repair אחד כשהפלט לא JSON |
| S5 | | כפילות נדחית |
| S6 | | story ו־quest ו־vocab → pending → approve |
| S7 | | CLI: ‏`review` אינטראקטיבי (y/n/e), ‏`--auto-validate-only`, ‏`list` |
| O1 | test_ai_owl | PII, מצוקה ונושא חסום → blocked, בלי קריאה לרשת |
| O2 | | לא נחסם בגלל מילה בתוך מילה ("מתמטיקה") |
| O3 | | תשובה תקינה → ai; הנחיית המערכת כוללת גיל, בלי שם |
| O4 | | פלט: URL מוסר, ארוך מדי נחתך, מילה חסומה → canned, אנגלית → canned |
| O5 | | refusal → נוסח קבוע |
| O6 | | offline / תקציב → canned |
| O7 | | כל שאלה נרשמת ביומן; PII לא נרשם |
| O8 | | FAQ: התאמה מדויקת בלי רשת, התאמה לפי מילות מפתח, 50+ פריטים תקינים בקובץ |
| E1 | test_ai_explain | הסבר חדש מ־AI, מטמון לפי פריט ותשובה, fallback ל־explanation_he |
