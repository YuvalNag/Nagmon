# SDD: פורמט התוכן הלימודי

> כל התוכן יושב ב־`mods/nagmon/learning/`. המנוע (`nagmon.learning.content`) טוען אותו, ובדיקות ב־`tests/nagmon/test_content_*.py` מאמתות אותו.

## 1. מבנה

```
mods/nagmon/learning/
  skills/math.yaml, geometry.yaml, logic.yaml      # בעלות: WP2 (מחוללים)
  skills/english.yaml, science.yaml, hebrew.yaml   # בעלות: WP5 (מאגרים)
  english/words.yaml                               # אוצר מילים
  english/sentences.yaml                           # השלמת משפטים ודקדוק (כיתות ד–ט)
  english/reading.yaml                             # קטעי קריאה קצרים + שאלות
  science/<topic>.yaml                             # מאגרי שאלות מדעים
  hebrew/{letters,words,reading}.yaml              # עברית כיתות ג'־ב' (אותיות, מילים, משפטים)
  hebrew/{grammar,vocab,spelling,text}.yaml        # עברית כיתות ג'־ט': דקדוק, אוצר מילים, כתיב, טקסט (מיומנות לכל תג)
  hebrew/passages_<כיתה>.yaml                      # קטעי קריאה בעברית (text_he בלבד), כיתות ג'־ט'
  subjects.yaml                                    # שיוך סוג מפלצת ← מקצוע, צבעים, שמות
```

## 2. מיומנות

```yaml
subject: science
skills:
  - id: science.living.basic          # <subject>.<topic>.<name>, ייחודי
    grade: 1                          # 0 = גן ... 9
    title_he: חי, צומח ודומם
    title_en: Living and non-living things
    prereq: []                        # מזהי מיומנויות
    generator: bank                   # "bank" או שם מחולל רשום (arithmetic.add, geometry.polygon_sides...)
    params: {bank: science/living.yaml}   # למחולל bank: איזה קובץ (ואופציונלית tags)
    mastery: {min_attempts: 12, threshold: 0.8}   # אופציונלי, יש ברירת מחדל
```

## 3. פריט במאגר (bank)

```yaml
skill: science.living.basic           # ברירת מחדל לכל הפריטים בקובץ
items:
  - id: sci.living.001                # ייחודי בכל המאגרים
    kind: choice                      # choice | true_false | order
    grade: 1
    difficulty: 0.0                   # יחסי לכיתה: -2 (קל) .. +2 (קשה)
    prompt_he: מה מהבאים הוא יצור חי?
    prompt_en: Which of these is a living thing?
    choices:
      - {he: חתול, en: cat, emoji: 1f408}
      - {he: אבן, en: stone, emoji: 1faa8}
      - {he: כיסא, en: chair, emoji: 1fa91}
    answer: 0                          # אינדקס הבחירה הנכונה (ב־order: רשימת אינדקסים בסדר הנכון)
    explanation_he: חתול נושם, אוכל, גדל ומתרבה. אבן וכיסא לא.
    explanation_en: A cat breathes, eats, grows and reproduces.
    tags: [living]
```

**כללים** (נבדקים אוטומטית):
- `id` ייחודי. `answer` בטווח. אין בחירות כפולות.
- ב־`true_false` הבחירות הן בדיוק `נכון` ו־`לא נכון`, והמנוע מוסיף אותן לבד: מספיק `answer: true|false`.
- אורך: `prompt_he` עד 140 תווים, בחירה עד 40, הסבר עד 200.
- **בלי ניקוד.** עברית תקינה, פשוטה, בגובה העיניים של הכיתה.
- **מדויק מדעית.** עדיף פשוט ונכון על מדויק ומבלבל.
- תוכן צנוע ומתאים למשפחה. בלי אלימות, בלי פחד ובלי נושאים רגישים.

## 4. מילה באנגלית

```yaml
- word: dog
  he: כלב
  pos: noun                    # noun | verb | adj | adv | prep | pron | num | phrase | other
  topic: animals               # animals, colors, numbers, food, family, body, clothes, home, school, nature, weather, time, places, actions, feelings, toys, transport, jobs, sports...
  level: preA1                 # preA1 | A1 | A2 | B1
  grade: 1                     # כיתה שבה מתאים להתחיל
  emoji: 1f436                 # קוד Twemoji אם יש תמונה חד־משמעית, אחרת null
  example_en: The dog is happy.
  example_he: הכלב שמח.
```

- מחולל `english.vocab` מייצר מכל מילה כמה סוגי שאלות:
  - תמונה ← מילה;
  - מילה ← תרגום;
  - האזנה ← תמונה;
  - איות באריחי אותיות;
  - השלמת משפט (מתוך `example_en`).
- המסיחים נבחרים מאותו נושא ואותה רמה.

## 5. משפט וקריאה

```yaml
# english/sentences.yaml: אותו פורמט פריט כמו במאגר (סעיף 3), עם skill מסוג english.grammar.*
# english/reading.yaml:
- id: read.001
  grade: 4
  level: A1
  title: My Cat
  text_en: "I have a cat. Her name is Mitzi. She is black and white..."
  text_he: "יש לי חתולה. קוראים לה מיצי..."
  questions:                   # פריטי bank רגילים (סעיף 3)
    - {id: read.001.q1, kind: choice, prompt_en: "What color is Mitzi?", prompt_he: "באיזה צבע מיצי?", choices: [...], answer: 0, explanation_he: ...}
```

- שדות נוספים בפריט: `speak_en` (טקסט להקראה באנגלית, למשל האות או המילה ששומעים), `emoji` (תמונה ליד השאלה). בחירה יכולה להיות עם `en` בלבד.
- קטעי קריאה בעברית (`hebrew/passages_<כיתה>.yaml`) הם אותה רשימת קטעים, עם `text_he` בלבד (בלי `text_en`) וכותרת. שיר נכתב כ־`text_he: |-` כדי ששורותיו יישמרו, והמסך מציג אותו בשורות (`white-space: pre-line`).
- שאלות של קטע קריאה יורשות `skill`, `tags`, `grade` ו־`level` מהקטע. הטקסט מגיע לממשק ב־`Question.meta["passage_en"/"passage_he"]` (SDD_LEARNING §16).
- `science/monster_facts.yaml`: בלוק `elements:` עם עובדות לקלפי המדע (`ContentLibrary.element_facts`), ו־`items:` רגילים.

## 6. שיוך סוגים למקצועות (`subjects.yaml`)

```yaml
subjects:
  math:      {title_he: חשבון, title_en: Math, color: "#ff8a5b", elements: [fire, lightning]}
  geometry:  {title_he: גאומטריה, title_en: Geometry, color: "#8fb3ff", elements: [earth, metal]}
  science:   {title_he: מדעים, title_en: Science, color: "#6cd4a1", elements: [water, wood, venom, sky, frost, cosmic]}
  english:   {title_he: אנגלית, title_en: English, color: "#ffd166", elements: [normal, heroic]}
  logic:     {title_he: חשיבה, title_en: Logic, color: "#c39bff", elements: [shadow]}
  hebrew:    {title_he: עברית, title_en: Hebrew, color: "#f4a6c6", elements: [], monsters: [scrollo, megillon]}
```

- **`monsters:`** (לא חובה): מפלצות שיש להן מקצוע משלהן, בלי קשר לסוג ההתקפה. אין סוג שממופה לעברית, ולכן המפלצות של עברית מוגדרות כאן (SDD_ART §2.10).
- ההורה יכול לדרוס את השיוך לכל ילד: `profile.settings.element_subjects`. המפתח הוא סוג או slug של מפלצת.
- **סדר העדיפות בקרב** (`SubjectMap.subject_for`):
  1. הבחירה של ההורה למפלצת הזו (`element_subjects[<slug>]`);
  2. המקצוע של המפלצת (`monsters:`);
  3. הסוג הראשון של ההתקפה שאנחנו מכירים, ובו הבחירה של ההורה לסוג קודמת ל־`elements:`.
- **מקצוע כבוי:** אם המקצוע שנבחר לא ב־`learner.enabled_subjects` של הילד (כשההורה בחר מקצועות), הקרב שואל "כל מקצוע פעיל" (`subject=None`), והמנוע בוחר מבין המקצועות הפעילים. זה חל על כל מקצוע, גם על עברית.
