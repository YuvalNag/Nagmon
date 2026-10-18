# מחקר: ספקי LLM מרוחקים (חינמיים) לנגמון

> מסמך מחקר, נכתב ב־18 באוקטובר 2026. מטרתו לבחור ספק LLM מרוחק (אין GPU חזק בבית), רצוי חינמי, לשני שימושים:
> **(א)** "סטודיו תוכן" להורה: ייצור שאלות וסיפורים בעברית ובאנגלית כ־JSON קשיח, וההורה מאשר כל פריט.
> **(ב)** זמן משחק (אופציונלי): "שאל את הינשוף החכם" בעברית, הסבר נוסף על תשובה שגויה, ו־prefetch של שאלות ברקע.
>
> מונחים טכניים באנגלית. **זה לא ייעוץ משפטי.** פרשנות התנאים כאן היא שלי, וההחלטה של ההורה.

---

## 0. איך המחקר נעשה, ומה אמינותו

- **הגישה הישירה לאתרי הספקים נחסמה** בסביבת העבודה (ה־proxy חסם את `ai.google.dev`, `console.groq.com`, `openrouter.ai` ואחרים). לכן כל הממצאים הגיעו דרך **WebSearch**: קטעים מהדפים הרשמיים כפי שמנוע החיפוש הציג אותם, וגם אתרי צד שלישי.
- **סימונים במסמך:**
  - ✅ **מאומת ממקור רשמי:** הקטע הגיע מהדף הרשמי של הספק (דרך תוצאת חיפוש).
  - ⚠️ **צד שלישי:** בלוג, אגרגטור או ConductAtlas (אתר שעוקב אחרי סעיפים בתנאי שימוש). סביר, אבל לא נקרא במקור.
  - ❌ **לא מאומת:** מהידע הכללי שלי, או שהמקורות סותרים זה את זה.
- **ציטוטים:** הציטוטים באנגלית הם הנוסח שמנוע החיפוש החזיר מהדף. **לפני שמסתמכים על סעיף, צריך לפתוח את הקישור ולקרוא אותו.**
- **מגבלות חינמיות משתנות כל הזמן.** Google, ‏Groq ו־OpenRouter שינו מכסות כמה פעמים ב־2025–2026. הקוד חייב לקרוא את המגבלות מכותרות ה־HTTP ומשגיאות 429, ולא להניח מספרים קבועים.

---

## 1. השורה התחתונה

| שימוש | המלצה | למה |
|---|---|---|
| **(א) סטודיו תוכן להורה** | **Gemini (AI Studio, חינמי)** → Groq ‏`openai/gpt-oss-120b` → Cerebras ‏`gpt-oss-120b` → OpenRouter (מודלי `:free`) | ל־Gemini העברית הכי טובה מבין האפשרויות החינמיות, ויש לו structured output. המשתמש הוא ההורה (בגיר), והקלט לא כולל מידע על הילדים. |
| **(ב) ינשוף וזמן משחק** | **Groq** (ראשי) → **Cloudflare Workers AI** (גיבוי) → **תשובות מוכנות מראש, בלי רשת** | Groq הוא הספק החינמי היחיד שבדקתי שתנאיו **מתייחסים במפורש** לאפליקציה לקטינים ומעבירים את האחריות ללקוח, במקום לאסור. Groq ו־Cloudflare **לא מאמנים** על הנתונים. |
| **לא להשתמש בזמן משחק** | Gemini, ‏OpenRouter, ‏Mistral החינמי, ‏DeepSeek | Gemini **אוסר במפורש** אפליקציות לקטינים. ב־OpenRouter הגיל המינימלי עלה ל־18 (⚠️), ומודלים חינמיים רבים רצים אצל ספקים שמאמנים על הקלט. Mistral החינמי מחייב הסכמה לאימון. DeepSeek מאמן על נתונים ויש בו בעיות פרטיות. |
| **GitHub Models** | **לא רלוונטי** | ✅ השירות **נסגר לגמרי ב־30 ביולי 2026**. |
| **Dicta (DictaLM)** | אין API מתארח | ✅ המשקלים פתוחים ב־Hugging Face. יש רק צ'אט ווב (chat.dicta.org.il). |

**עיקרון מרכזי:** לפני שבוחרים ספק לשימוש (ב), כדאי לצמצם את (ב) עצמו.
- **הסברים לתשובות שגויות:** לייצר מראש בסטודיו (א), יחד עם כל שאלה, וההורה מאשר אותם.
- **prefetch של שאלות:** לייצר מראש בסטודיו. בזמן משחק שולפים מהמאגר המאושר.
- **מה נשאר "חי":** רק הינשוף. ולילדים בגיל 5–7 עדיף שהוא יעבוד עם **שאלות לבחירה מתפריט**, לא עם טקסט חופשי.

---

## 2. טבלת השוואה

**מקרא העמודות:** ‏"גיל/קטינים" = מה כתוב בתנאים. ‏"אימון" = האם הספק משתמש בקלט ובפלט של החשבון החינמי לאימון או לשיפור מודלים.

| ספק | מכסה חינמית (2026) | OpenAI-compatible ‏base URL | JSON / Structured | גיל / קטינים | אימון על free | מודלים טובים בחינם | עברית |
|---|---|---|---|---|---|---|---|
| **Google Gemini** (AI Studio) | ⚠️ פר־project, מוצג ב־AI Studio. הערכות: כ־10 RPM ו־1,500 RPD ל־Flash (מקורות סותרים, היו גם קיצוצים ל־20–100 RPD). ⚠️ מאפריל 2026 מודלי Pro כנראה בתשלום בלבד | ✅ `https://generativelanguage.googleapis.com/v1beta/openai/` | ✅ structured output לפי JSON Schema | ✅ **18+**, ו**אסור** בשירות "directed towards or likely to be accessed by" קטינים מתחת ל־18 | ✅ **כן.** גם human review | ⚠️ משפחת Flash 3.x: ‏Gemini 3.8 Flash (ספטמבר 2026), ‏3.7, ‏3.6, ‏Flash-Lite 3.5 / 3.1. ❌ ה־ID המדויק לא מאומת | **הטובה ביותר מהחינמיים.** ⚠️ בלוח העברי (Dicta/Mafat) ‏Gemini 2.5 Pro ו־3 Flash Preview בראש (Nikud כ־87–88) |
| **Groq** | ⚠️ פר־org. כ־30 RPM ו־1,000 RPD, ומגבלות TPM ו־TPD נוספות לכל מודל | ✅ `https://api.groq.com/openai/v1` | ✅ JSON mode (`json_object`). ‏`json_schema` רק בחלק מהמודלים (⚠️ דיווח על שגיאה ב־gpt-oss-20b) | ✅ **18+ לבעל החשבון.** אפליקציה לקטינים: **הלקוח אחראי לבדו** (לא אסור) | ✅ **לא מאמן.** יש **ZDR** (Zero Data Retention) בהגדרות | ⚠️ ‏`openai/gpt-oss-120b`, ‏`openai/gpt-oss-20b` (production, אוגוסט 2026), ‏`qwen/qwen3.6-27b` (preview). ‏Llama 3.1 8B נסגר ב־16.8.2026 | ❌ לא מאומת. ל־gpt-oss **אין ציון עברית** (MMMLU לא כולל עברית). חובה לבדוק |
| **OpenRouter** | ⚠️ מודלי `:free`: ‏20 RPM. ‏**50 בקשות ביום**, או 1,000 ביום אחרי רכישה מצטברת של 10$ | ✅ `https://openrouter.ai/api/v1` | ✅ `response_format` (תלוי במודל ובספק) | ⚠️ **18+** (עלה מ־13 ב־31.8.2026, לפי ConductAtlas) | ⚠️ **תלוי בספק.** 9 מתוך 19 המודלים החינמיים רצים אצל ספקים שעשויים לאמן. יש opt-out בהגדרות | ⚠️ הרשימה מתחלפת כל שבוע: Gemma 4 31B, ‏Nemotron 3, ‏gpt-oss ועוד (15 מודלי טקסט חינמיים ב־14.10.2026) | תלוי במודל |
| **Cerebras** | ⚠️ סותר: "1M tokens ביום, 30 RPM" או trial של 5$ ל־30 יום עם כרטיס אשראי (ספטמבר 2026) | ✅ `https://api.cerebras.ai/v1` | ✅ `json_schema` | ✅ **13+** (או גיל ההסכמה הדיגיטלית במדינה) | ⚠️ לא שומר prompts. לגבי אימון לא נאמר במפורש | ⚠️ ‏`gpt-oss-120b`, ‏`zai-glm-4.7`, ‏`llama-3.3-70b` | ❌ לא מאומת |
| **Mistral** (Experiment) | ⚠️ כ־1 RPS, ‏500K TPM, ‏1B tokens בחודש לכל מודל. דורש אימות טלפון | ❌ `https://api.mistral.ai/v1` (דומה ל־OpenAI, לא זהה) | ❌ ‏`json_object` ו־`json_schema` (מהידע שלי) | ✅ **13+, ונדרשת הסכמת הורה.** ⚠️ בתנאים המסחריים: אסור מידע אישי של ילדים מתחת ל־13, ואסור לקטינים להשתמש בלי הסכמת הורה | ✅ **כן.** בתוכנית החינמית חייבים להסכים לאימון | ❌ ‏`mistral-small-latest`, ‏`mistral-medium-latest` | בינונית. ✅ DictaLM 3.0 24B בנוי על Mistral-Small-3.1, כלומר הבסיס עצמו לא היה מספיק בעברית |
| **GitHub Models** | — | — | — | — | — | ✅ **נסגר ב־30.7.2026** | — |
| **Cloudflare Workers AI** | ✅ **10,000 Neurons ביום**, משותף לכל המודלים, מתאפס ב־00:00 UTC | ✅ `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1` | ✅ JSON mode (`json_object` / `json_schema`) | ⚠️ במדיניות הפרטיות: האתרים והשירותים "not intended for" מתחת ל־18. ❌ לא ברור אם זה חל על אפליקציה של לקוח | ✅ **לא מאמן** על Customer Content | ⚠️ ‏`@cf/openai/gpt-oss-120b`, ‏`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, ‏`@cf/google/gemma-3-12b-it`, ‏`@cf/mistralai/mistral-small-3.1-24b-instruct` | בינונית (❌ לא מאומת). ‏10K Neurons הם לא הרבה למודל של 70B או 120B |
| **Hugging Face Inference Providers** | ✅ **0.10$ בחודש** למשתמש חינמי (PRO: ‏2$) | ✅ `https://router.huggingface.co/v1` | תלוי בספק | ⚠️ **13+** | תלוי בספק שאליו מנותבים | כל מודל שיש לו provider. ❌ אולי DictaLM-3.0-24B-Thinking | ❌ לא מאומת |
| **Together AI** | ✅ **אין free trial.** מינימום 5$ (עדכון 1.6.2026) | ❌ `https://api.together.xyz/v1` | ❌ כן (מהידע שלי) | ❌ לא נמצא | ❌ לא נבדק | — | — |
| **DeepSeek** | ❌ אין tier חינמי ברור (זול מאוד: כ־0.14$ ל־1M input) | ⚠️ `https://api.deepseek.com` | ❌ JSON output (מהידע שלי) | ✅ **מתחת ל־18 רק בהסכמת אפוטרופוס.** "primarily intended for adults" | ⚠️ **כן**, לפי מדיניות הפרטיות. ה־opt-out ל־API לא ברור | ⚠️ ‏`deepseek-v4-flash`, ‏`deepseek-v4-pro` | ❌ לא מאומת |
| **Cohere** | ⚠️ trial key: ‏1,000 קריאות בחודש, ‏20 RPM ב־Chat. **אסור לשימוש production** | ❌ `https://api.cohere.ai/compatibility/v1` | ❌ JSON mode (מהידע שלי) | ❌ לא נמצא | ❌ לא נבדק | Command A/R ❌ | ❌ |
| **SambaNova** | ⚠️ סותר: ‏20 RPM, ‏20 RPD, ‏200K tokens ביום, או קרדיט של 5$ | ❌ `https://api.sambanova.ai/v1` | ❌ | ❌ לא נמצא | ❌ לא נבדק | ❌ | ❌ |
| **NVIDIA NIM** (build.nvidia.com) | ⚠️ trial: כ־40 RPM. ‏"evaluation and prototyping" בלבד | ⚠️ `https://integrate.api.nvidia.com/v1` | ❌ | ❌ לא נבדק | ❌ לא נבדק | gpt-oss-120b ועוד | ❌ |
| **Dicta** | — | ✅ **אין API מתארח רשמי** | — | — | — | DictaLM 3.0 (1.7B, ‏12B, ‏24B) כמשקלים פתוחים | **הכי טובה בקוד פתוח**, אבל דורש GPU |

---

## 3. תנאי שימוש: ציטוטים לגבי גיל וקטינים

### 3.1 Google Gemini API ✅

מקור: [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms)

> "You must be 18 years of age or older to use the APIs. You also will not use the Services as part of a website, application, or other service (collectively, "API Clients") that is directed towards or is likely to be accessed by individuals under the age of 18."

נתונים בשירות החינמי (Unpaid Services), מאותו דף:

> "Google uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products and services and machine learning technologies"

> "human reviewers may read, annotate, and process your API input and output."

> "Do not submit sensitive, confidential, or personal information to the Unpaid Services."

**השלכות לנגמון:**
- **זמן משחק (ב):** אסור בבירור. המשחק הוא "API Client" שילדים ניגשים אליו.
- **אזור אפור (א):** האם הסטודיו נחשב "API Client... likely to be accessed by" קטינים, כשהוא חלק מאותה תוכנה?
  - ⚠️ בפורום המפתחים של Google ענו שההגבלה חלה בכל דרך גישה, גם דרך Vertex AI. זו תשובת פורום, לא מדיניות רשמית ([discuss.google.dev](https://discuss.google.dev/t/question-regarding-age-restrictions-for-the-gemini-api/188060)).
  - **ההמלצה שלי:** להפריד את הסטודיו **פיזית**, כסקריפט נפרד `tools/content_studio.py` שרץ על המחשב של ההורה ולא נבנה לתוך ה־APK או ה־build של הילדים. מפתח ה־API לא נכנס לחבילת המשחק. הפלט הוא קובץ JSON סטטי שההורה אישר. כך הילדים אף פעם לא ניגשים ל־API Client.
  - ✅ לפי `SDD_ARCHITECTURE.md` ההורה כבר החליט ש־Gemini מותר בסטודיו "אחרי שהובהרה מגבלת התנאים". ההפרדה הפיזית מחזקת את ההחלטה הזו.
- ✅ ישראל ברשימת המדינות שבהן Gemini API זמין ([available regions](https://ai.google.dev/available_regions)).

### 3.2 Groq ✅ / ⚠️

מקור: [Groq Services Agreement](https://console.groq.com/docs/legal/services-agreement)

> "You must be 18 years of age or older to access or use the Cloud Services."

- ⚠️ **אפליקציה לקטינים:** סעיף Customer Obligations קובע שאם Customer Application מכוונת לאנשים מתחת לגיל הבגירות, או צפויה להגיע אליהם, **הלקוח לבדו אחראי** לעמידה בחוק לגביה. הנוסח המלא לא הוצג בתוצאת החיפוש, ולכן **צריך לקרוא את הסעיף המלא לפני שמסתמכים עליו**.
- [GroqCloud Terms of Sale](https://console.groq.com/docs/terms-of-sale): ‏"Customer may make the Services available to End Users through your Customer Applications". הלקוח אחראי ל־"End Users' compliance with this Agreement".
- [מדיניות פרטיות](https://groq.com/privacy-policy): ‏"Our Site is not directed to children, and we do not knowingly collect Personal Information from children under the age of 18". זה נוגע לאתר של Groq, לא לאפליקציה של הלקוח.
- **נתונים** ([Your Data](https://console.groq.com/docs/your-data)):
  - ברירת המחדל: לא שומרים inputs ו־outputs, חוץ ממקרים מוגבלים (אמינות, חקירת abuse).
  - כל לקוח יכול להדליק **ZDR** ב־Data Controls.
  - Groq לא מאמן על נתוני משתמשים.

**השלכה:** בעל החשבון הוא ההורה (בגיר). **Groq מתיר אפליקציה שקטינים משתמשים בה, אם הלקוח לוקח אחריות.** זה הבסיס להמלצה ל־(ב).

### 3.3 OpenRouter ⚠️

מקור: [OpenRouter Terms](https://openrouter.ai/terms)

> "You must be at least 18 years of age to use the Service."

- ⚠️ לפי [ConductAtlas](https://conductatlas.com/change/2026-09-01-openrouter-openrouter-terms-of-service-4768/), ב־31.8.2026 הגיל המינימלי עלה מ־13 ל־18, והאפשרות של הסכמת הורה לגילאי 13–17 הוסרה.
- ❌ לא מצאתי סעיף שמסדיר אפליקציות של מפתחים לילדים.
- **נתונים:** כל ספק מגדיר מדיניות משלו ([logging](https://openrouter.ai/docs/guides/privacy/logging)). בהגדרות החשבון אפשר לחסום ניתוב לספקים שמאמנים, עם הגדרה נפרדת למודלים בתשלום ולמודלים חינמיים.

**השלכה:** מתאים כגיבוי לסטודיו (א). **לא לזמן משחק.**

### 3.4 Cerebras ✅

מקור: [Cerebras Terms of Use](https://cloud.cerebras.ai/terms) (בתוקף מ־27.8.2024, אולי עודכן מאז ❌)

- נדרש גיל "at least 13 years of age or the minimum age of digital consent required in your country".
- [מדיניות פרטיות](https://www.cerebras.ai/privacy-policy): ‏"We do not knowingly collect Personal Data from minors under 13 years old."
- ❌ לא מצאתי סעיף על אפליקציות לילדים.

### 3.5 Mistral ✅ / ⚠️

מקור: [Help: Can children use Mistral products?](https://help.mistral.ai/en/articles/347631-can-children-use-mistral-products-and-services), [Terms](https://mistral.ai/en/terms)

> "You must be at least thirteen (13) years old to use the Mistral AI Products. You must have parental or legal guardian permission if you are a minor creating a Mistral AI account. We will delete any Mistral AI account found to violate these requirements."

⚠️ בתנאים המסחריים, לפי [ConductAtlas](https://conductatlas.com/platform/mistral-ai/mistral-ai-commercial-terms/childrens-data-restriction/), אסור:

> "personal information of children under 13 or the applicable age of digital consent as Customer Data or allow minors to use the Mistral AI Products without legally adequate consent from their parent or guardian"

- ⚠️ "the Customer bears sole responsibility for age verification and parental consent".
- **נתונים:** בתוכנית Experiment ‏(חינמית) "API requests ... may be used to train Mistral's models" ([help](https://help.mistral.ai/en/articles/450104-how-can-i-try-the-api-for-free-with-the-experiment-plan)).
- ⚠️ דיווח (צד שלישי, לא מאומת) על עדכון מ־8.8.2026 שמגביל את ה־API ללקוחות עסקיים. מנגד, תיעוד Mistral עדיין מתאר את תוכנית Experiment.

**השלכה:** **ההורה יכול לתת הסכמה**, אז תאורטית מותר. אבל התוכנית החינמית מאמנת על הקלט, ולכן **לא לשלוח אליה טקסט שילד הקליד**. מתאים לסטודיו (א), או לזמן משחק רק בתוכנית בתשלום.

### 3.6 Cloudflare Workers AI ✅ / ⚠️

- **נתונים** ✅ ([Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/privacy/)):

  > "Cloudflare does not use your Customer Content to (1) train any AI models made available on Workers AI or (2) improve any Cloudflare or third-party services, and would not do so unless we received your explicit consent."

- **גיל** ⚠️ (מדיניות הפרטיות, לפי [ConductAtlas](https://conductatlas.com/platform/cloudflare/cloudflare-privacy-policy/services-not-intended-for-minors/)):

  > "Cloudflare's Websites and Services are not intended for, nor designed to attract, individuals under the age of eighteen."

- ❌ **לא מאומת** אם זה חל על משתמשי קצה של אפליקציה של לקוח, או רק על איסוף מידע ישיר של Cloudflare. בעל החשבון הוא ההורה, ולפי Workers AI הנתונים לא נשמרים. זה בסדר כגיבוי, אבל כדאי לקרוא את ה־Self-Serve Subscription Agreement.

### 3.7 Hugging Face ⚠️

- לפי [ConductAtlas](https://conductatlas.com/platform/hugging-face/hugging-face-terms-of-service/minimum-age-requirement-age-13/): ‏"You cannot create a Hugging Face account if you are a natural person under age 13".
- הניתוב עובר לספקים חיצוניים, ולכל אחד תנאים משלו.
- ‏0.10$ בחודש הם בפועל רק לניסוי.

### 3.8 DeepSeek ✅

- [Open Platform Terms](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html): ‏"minors under the age of 18 shall read in the presence of a ... legal guardian".
- [Terms of Use](https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html): השירות "primarily intended for adults", ומתחת ל־18 רק בהסכמת אפוטרופוס.
- **נתונים:** לפי מדיניות הפרטיות, משתמשים במידע "to train and improve our technology". ⚠️ לא ברור אם יש opt-out ל־API.

**השלכה:** **לא לילדים.**

### 3.9 Together, Cohere, SambaNova, NVIDIA

- ❌ **לא נמצאו סעיפי גיל.** אף אחד מהם לא מציע tier חינמי שמתאים ל־production: ל־Together אין trial, המפתח של Cohere אסור ל־production, וה־NIM של NVIDIA מיועד ל־evaluation בלבד.
- לכן הם לא נכנסו להמלצה.

### 3.10 להשוואה: ספק בתשלום עם מדיניות מפורשת לקטינים

- ⚠️ ל־Anthropic (Claude API) יש מסמך [Guidelines for organizations serving minors](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors).
  - הוא **מתיר** מוצר שקטינים משתמשים בו, בתנאי שיש safeguards: age verification, content moderation, monitoring ו־child-safety system prompt.
  - האחריות ל־COPPA וחוקים דומים היא על הארגון.
- אם ההורה מוכן לשלם סכום קטן בחודש, זו הדרך הכי "נקייה" מבחינת התנאים לינשוף. ❌ המחיר לא נבדק כאן.

---

## 4. עברית: מה ידוע

- ✅ **לוח ה־Hebrew LLM של Dicta ו־Mafat** ב־Hugging Face ([blog](https://huggingface.co/blog/leaderboard-hebrew), [chat-results dataset](https://huggingface.co/datasets/hebrew-llm-leaderboard/chat-results)):
  - יש טבלת chat עם המשימות Nikud, ‏SummaryPairwise, ‏TranslationPairwise, ‏Trivia ו־Winograd.
  - ⚠️ ציונים לדוגמה (תאריך ה־snapshot לא מאומת):
    - **Gemini 2.5 Pro:** ‏Nikud כ־87.2, ‏Trivia כ־82.1, ‏Winograd כ־90.6.
    - **Gemini 3 Flash Preview:** ‏Nikud כ־88.4.
    - **DictaLM-3.0-24B-Thinking:** ‏Nikud כ־86.9.
    - **Qwen3.5-397B:** ‏Nikud כ־78.2, ‏Trivia כ־72.1.
    - **Qwen3-30B-A3B-Thinking:** חלש מאוד בתרגום.
  - ‏Llama ו־GPT לא הופיעו בקטע שחזר.
- ✅ **DictaLM 3.0** (פברואר 2026, [arXiv 2602.02104](https://arxiv.org/abs/2602.02104)):
  - נבנה על Mistral-Small-3.1 ‏(24B), ‏Nemotron Nano ‏(12B) ו־Qwen3 ‏(1.7B).
  - אומן בהמשך על כ־100B טוקנים של עברית.
  - **אין API מתארח.**
- ⚠️ **Hebatron** (מאי 2026): מודל MoE עברי של 30B, ממוצע 73.8% ב־reasoning בעברית, מול 68.9% של DictaLM-3.0-24B.
- ❌ **gpt-oss-120b:** אין ציון עברית. ב־MMMLU שלו אין עברית. ערבית, השפה השמית הקרובה ביותר: 82.7 (high effort).
- **מסקנה:**
  - בין האפשרויות החינמיות המרוחקות, **ל־Gemini Flash העברית הטובה ביותר**.
  - העברית של gpt-oss ו־Llama ב־Groq, Cerebras ו־Cloudflare **לא נבדקה** ועלולה להיות חלשה יותר: שגיאות דקדוק, מגדר, ניסוח לא טבעי לילדים.
  - **חובה להריץ בדיקת עברית קטנה** (סעיף 7) לפני שבוחרים מודל ל־(ב).

---

## 5. המלצה וניתוב

### 5.1 (א) סטודיו התוכן להורה

- **מי משתמש:** ההורה, בגיר.
- **מה נשלח:** רק מיומנות, רמה, נושא ותחומי עניין. **לא שם, לא גיל מדויק, לא היסטוריה.** לכן גם ספקים שמאמנים על הקלט מקובלים כאן.

| סדר | ספק | base URL | מודל (❌ לבדוק מול `/models`) | הערות |
|---|---|---|---|---|
| 1 | Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.8-flash` (או ה־Flash העדכני). למשימות זולות: Flash-Lite | structured output לפי JSON Schema. הכי טוב בעברית |
| 2 | Groq | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` | `json_object`. לבדוק `json_schema`. מהיר מאוד |
| 3 | Cerebras | `https://api.cerebras.ai/v1` | `gpt-oss-120b` | `json_schema`. ⚠️ מצב ה־free tier לא ברור |
| 4 | OpenRouter | `https://openrouter.ai/api/v1` | מודל `:free`, למשל Gemma 4 31B, עם מערך `models` לגיבוי | ‏50 בקשות ביום בלבד בלי רכישה. לחסום ספקים שמאמנים |
| 5 | Mistral | `https://api.mistral.ai/v1` | `mistral-small-latest` / `mistral-medium-latest` | Experiment = הסכמה לאימון. נדרש אימות טלפון |

**כללי ניתוב:**
- **429:** cooldown למודל לפי `Retry-After` (או 60 שניות), ומעבר לספק הבא.
- **5xx או timeout:** ניסיון חוזר אחד, ואז מעבר הלאה.
- **JSON לא תקין:** ניסיון אחד של "repair prompt", ואז מעבר הלאה.
- **ההורה רואה תמיד** איזה ספק ומודל ייצרו כל פריט (שדה `provenance` במאגר).
- כל פריט עובר validator בקוד ואישור ידני, כמו שמתואר ב־`GAME_PLAN.md` §11.

### 5.2 (ב) הינשוף וזמן משחק

**לפני הכול:** את "הסבר לתשובה שגויה" ואת ה־prefetch מעבירים לסטודיו (א). כך הם תוכן מאושר ולא קריאה חיה.

| סדר | ספק | base URL | מודל | למה |
|---|---|---|---|---|
| 1 | **Groq** (עם ZDR דלוק) | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b`. אם העברית חלשה: `qwen/qwen3.6-27b` (preview) | התנאים מתירים אפליקציה לקטינים באחריות הלקוח. לא מאמן. מהיר |
| 2 | **Cloudflare Workers AI** | `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1` | `@cf/openai/gpt-oss-120b` או `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | לא מאמן. ‏⚠️ סעיף הגיל לא ברור |
| 3 | **Offline** | — | תשובות מוכנות ומאושרות (FAQ של הינשוף, נוצר בסטודיו) | תמיד עובד |
| (בתשלום) | Anthropic או Mistral בתשלום | — | — | מדיניות מפורשת לקטינים, עם הסכמת הורה ו־safeguards |

**לא בזמן משחק:**
- **Gemini:** אסור לפי התנאים.
- **OpenRouter:** ‏18+, וספקים חינמיים שמאמנים.
- **Mistral Experiment:** מאמן על הקלט.
- **DeepSeek:** מאמן, וקטינים רק בהסכמת אפוטרופוס.
- **HF:** תקציב זניח.

**ברירת מחדל:** הינשוף **כבוי**, וההורה מדליק אותו לכל ילד בנפרד.

---

## 6. תכנון בטיחות לשימוש מול ילדים

### 6.1 עקרונות

1. **צמצום:** כל מה שאפשר לייצר מראש, מייצרים מראש ומאשרים.
2. **ממשק קלט צר:**
   - **גיל 5–7:** שאלות מתפריט בלבד ("למה השמיים כחולים?", "איך צמח שותה?"), בלי מקלדת.
   - **גיל 8–11:** טקסט חופשי עד 120 תווים, עם סינון.
3. **שום מידע מזהה לא יוצא מהמחשב:**
   - הבקשה כוללת רק את השאלה, את טווח הגיל ("6-7") ואת השפה.
   - בלי שם ובלי `user` field מזהה. משתמשים ב־hash אקראי לכל התקנה.
4. **ההורה רואה הכול:**
   - כל שאלה ותשובה נשמרות בלוג מקומי.
   - שאלות שנחסמו מסומנות בבירור.

### 6.2 System prompt (טיוטה)

```text
אתה "ינשוף החכם", דמות במשחק לימודי לילדים בגילאי {age_band} בישראל.
- ענה בעברית פשוטה, ב־1 עד 3 משפטים קצרים, לכל היותר 60 מילים. פנה לילד בגוף שני, בלשון {gender_or_neutral}.
- נושאים מותרים בלבד: מדע, טבע, בעלי חיים, חלל, מתמטיקה, שפה, אנגלית, גאוגרפיה, היסטוריה ברמת בית ספר יסודי.
- אם השאלה על אלימות, מין, סמים, פחד, מוות, פוליטיקה, דת, מלחמה, בריאות או רפואה, מידע אישי, או משהו שלא מתאים לילדים:
  אל תענה על התוכן. החזר refusal=true ותשובה עדינה: "זו שאלה חשובה! כדאי לשאול עליה את אמא או אבא 🦉".
- לעולם אל תבקש מהילד פרטים אישיים (שם, כתובת, בית ספר, טלפון), אל תציע קישורים ואל תמליץ על אתרים או אפליקציות.
- אל תעמיד פנים שאתה אדם. אם אינך בטוח, אמור "אני לא בטוח, בוא נבדוק יחד עם מבוגר".
- החזר JSON בלבד: {"answer": str, "refusal": bool, "topic": str, "needs_parent": bool}
```

### 6.3 סינון קלט (לפני השליחה, מקומית)

- **אורך:** עד 120 תווים. בלי URL. בלי מספרים ארוכים.
- **PII ב־regex:**
  - טלפון ישראלי: `0\d{1,2}-?\d{7}`
  - ת"ז: 9 ספרות
  - אימייל
  - כתובת ("רחוב", "רח'")
  - אם נמצא: **לא שולחים**, ומציגים לילד: "אסור לספר לינשוף פרטים אישיים".
- **blocklist** בעברית ובאנגלית (רשימה שההורה יכול לערוך): קללות, אלימות, מין, סמים, פגיעה עצמית.
- **מילות מצוקה:** פגיעה עצמית או "מישהו מרביץ לי" → **לא שולחים ל־LLM.** מציגים "ספר/י למבוגר שאת/ה סומך/ת עליו", ומסמנים **התראה בולטת** באזור ההורים.
- ❌ **אופציונלי:** קריאת moderation נפרדת (למשל מודל safeguard ב־Groq, אם זמין) על השאלה עצמה.

### 6.4 סינון פלט

- **parse של JSON** לפי סכמה. אם נכשל → תשובת fallback מוכנה.
- **אם `refusal` או `needs_parent`** → מציגים את הנוסח הקבוע (לא את מה שהמודל כתב), ושומרים בלוג.
- **בדיקות:**
  - אורך: עד 60 מילים.
  - שפה: לפחות 70% אותיות עבריות, כשהשאלה בעברית.
  - blocklist על הפלט.
  - בלי URL.
  - בלי שאלות שמבקשות פרטים ("איך קוראים לך").
- **אם בדיקה נכשלה** → fallback: "הממ… אני צריך לחשוב על זה. בוא נשאל את אמא או אבא 🦉".

### 6.5 לוג גלוי להורה

- **קובץ:** `~/.nagmon/ai_log/{child_id}/YYYY-MM.jsonl` (מקומי בלבד).
- **שדות:** `ts`, ‏`child_id`, ‏`question`, ‏`answer`, ‏`provider`, ‏`model`, ‏`blocked_reason`, ‏`latency_ms`, ‏`tokens`.
- **מסך באזור ההורים** (מוגן ב־PIN):
  - רשימה כרונולוגית.
  - פילטר "נחסמו / צריך הורה".
  - כפתור "הוסף ל־FAQ מאושר": הופך תשובה טובה לתשובה offline.
  - כפתור "חסום נושא".
- **שמירה:** 90 יום כברירת מחדל, וההורה יכול למחוק.

### 6.6 מגבלות קצב ותקציב

- **לכל ילד:** עד 15 שאלות לינשוף ביום (ניתן להגדרה), ולפחות 20 שניות בין שאלות.
- **לכל בקשה:** `max_tokens=200`, ‏`temperature=0.3`, ‏timeout של 8 שניות.
- **גלובלי:** תקציב יומי של טוקנים לכל ספק (למשל 50K), ו־**circuit breaker** אחרי 3 כשלונות רצופים (מנוחה של 10 דקות).
- **אם נגמר:** הינשוף "הולך לישון 💤". ‏FAQ offline ממשיך לעבוד.
- **prefetch ברקע** (אם בכל זאת רוצים): רק ממאגר הסטודיו. אם משתמשים ב־LLM, רק כשהמחשב idle, ובמכסה נפרדת שלא פוגעת בינשוף.

### 6.7 טיפול בסירוב ובשגיאות

| מצב | מה הילד רואה | מה נרשם |
|---|---|---|
| המודל סירב או `refusal=true` | "זו שאלה חשובה! כדאי לשאול עליה את אמא או אבא 🦉" | השאלה, עם סימון "needs_parent" |
| נחסם בקלט (PII) | "אסור לספר לינשוף פרטים אישיים 🙂" | "blocked: pii" (בלי הערך עצמו) |
| מילות מצוקה | "ספר/י למבוגר שאת/ה סומך/ת עליו. זה חשוב." | **התראה** להורה |
| 429, timeout או רשת | "הינשוף נח עכשיו, נסה עוד קצת" + FAQ | שם הספק ושגיאה |
| פלט לא עבר בדיקה | fallback קבוע | הפלט המקורי (להורה בלבד) |

---

## 7. בדיקת עברית מומלצת (חצי שעה)

1. **30 prompts:**
   - 10 שאלות ינשוף.
   - 10 בקשות JSON לשאלות חשבון ומדעים.
   - 10 סיפורים קצרים בגיל 6 ובגיל 10.
2. **להריץ על:** Gemini Flash, ‏Groq ‏`openai/gpt-oss-120b`, ‏Groq ‏Qwen, ו־Cloudflare ‏`@cf/openai/gpt-oss-120b`.
3. **ההורה מדרג כל תשובה 1–5:** דקדוק, מגדר, טבעיות, התאמה לגיל, דיוק.
4. **תקינות:** אחוז ה־JSON התקין.
5. **בוחרים מודל לכל שימוש** ושומרים את התוצאות ב־`docs/kids/` (קובץ CSV).

---

## 8. שלד קוד (OpenAI SDK, כל הספקים)

```python
from openai import OpenAI

PROVIDERS = {  # ‏key נקרא מ־keyring או מ־env, לעולם לא בתוך ה־build של הילדים
    "gemini":     ("https://generativelanguage.googleapis.com/v1beta/openai/", "GEMINI_API_KEY"),
    "groq":       ("https://api.groq.com/openai/v1", "GROQ_API_KEY"),
    "cerebras":   ("https://api.cerebras.ai/v1", "CEREBRAS_API_KEY"),
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
    "cloudflare": ("https://api.cloudflare.com/client/v4/accounts/{acct}/ai/v1", "CF_API_TOKEN"),
}
STUDIO_ROUTE = [("gemini", "gemini-3.8-flash"), ("groq", "openai/gpt-oss-120b"),
                ("cerebras", "gpt-oss-120b"), ("openrouter", "google/gemma-4-31b-it:free")]
OWL_ROUTE    = [("groq", "openai/gpt-oss-120b"), ("cloudflare", "@cf/openai/gpt-oss-120b")]
# ‏ה־IDs של המודלים: ❌ לא מאומתים. בהפעלה קוראים client.models.list() ומתריעים אם המודל חסר.
```

---

## 9. החלטות פתוחות להורה

1. **Gemini בסטודיו:** להפריד פיזית (סקריפט נפרד על המחשב של ההורה, בלי מפתח בחבילת המשחק)? **מומלץ: כן.**
2. **הינשוף:** חינמי (Groq), או תשלום קטן לספק עם מדיניות קטינים מפורשת (Anthropic, או Mistral בתשלום)?
3. **טקסט חופשי:** מאיזה גיל? **מומלץ: 8 ומעלה.**
4. **ZDR ב־Groq:** להדליק. **מומלץ: כן.**
5. **לקרוא בעצמכם** את הסעיפים המלאים: Groq Customer Obligations, ‏Cloudflare Self-Serve Agreement, ‏Mistral Commercial Terms.

---

## 10. מקורות

**Gemini**
- [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms)
- [OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)
- [Available regions](https://ai.google.dev/available_regions)
- [Release notes](https://ai.google.dev/gemini-api/docs/changelog)
- [9to5google: Gemini 3.8 Flash](https://9to5google.com/2026/09/02/gemini-3-8-flash-launch/)
- [klymentiev: free tier Oct 2026](https://klymentiev.com/blog/gemini-api-free-tier)
- [agentdeals: April 2026 changes](https://agentdeals.dev/gemini-api-pricing-changes)
- [Google dev forum on age](https://discuss.google.dev/t/question-regarding-age-restrictions-for-the-gemini-api/188060)

**Groq**
- [Services Agreement](https://console.groq.com/docs/legal/services-agreement)
- [Terms of Sale](https://console.groq.com/docs/terms-of-sale)
- [Your Data](https://console.groq.com/docs/your-data)
- [Privacy](https://groq.com/privacy-policy)
- [Models](https://console.groq.com/docs/models)
- [benchlm: Groq models Aug 2026](https://benchlm.ai/blog/posts/groq-is-not-a-model)
- [ai-sdk: Groq structured outputs](https://ai-sdk.dev/providers/ai-sdk-providers/groq)

**OpenRouter**
- [Terms](https://openrouter.ai/terms)
- [Logging/Privacy](https://openrouter.ai/docs/guides/privacy/logging)
- [ConductAtlas change 2026-09-01](https://conductatlas.com/change/2026-09-01-openrouter-openrouter-terms-of-service-4768/)
- [benchlm free tier](https://benchlm.ai/md/free-tier/openrouter.md)
- [TrueFoundry free models](https://www.truefoundry.com/blog/openrouter-free-models-whats-actually-free-and-what-it-costs-you)
- [aieatingtheworld Oct 2026](https://www.aieatingtheworld.com/articles/openrouter-free-models)

**Cerebras**
- [Terms](https://cloud.cerebras.ai/terms)
- [Privacy](https://www.cerebras.ai/privacy-policy)
- [Pricing](https://cerebras.ai/pricing)
- [benchlm](https://benchlm.ai/md/free-tier/cerebras.md)

**Mistral**
- [Children help article](https://help.mistral.ai/en/articles/347631-can-children-use-mistral-products-and-services)
- [Terms](https://mistral.ai/en/terms)
- [Experiment plan](https://help.mistral.ai/en/articles/450104-how-can-i-try-the-api-for-free-with-the-experiment-plan)
- [ConductAtlas commercial terms](https://conductatlas.com/platform/mistral-ai/mistral-ai-commercial-terms/childrens-data-restriction/)

**GitHub Models**
- [Retired 2026-07-30](https://github.blog/changelog/2026-07-30-github-models-is-now-retired/)

**Cloudflare**
- [Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [OpenAI compatibility](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility)
- [Data usage](https://developers.cloudflare.com/workers-ai/platform/privacy/)
- [ConductAtlas privacy](https://conductatlas.com/platform/cloudflare/cloudflare-privacy-policy/services-not-intended-for-minors/)

**Hugging Face**
- [Pricing](https://huggingface.co/docs/inference-providers/pricing)
- [Get started](https://huggingface.co/inference/get-started)
- [ConductAtlas ToS](https://conductatlas.com/platform/hugging-face/hugging-face-terms-of-service/minimum-age-requirement-age-13/)

**Together**
- [Support: no free trial](https://support.together.ai/articles/1862638756-changes-to-free-tier-and-billing-july-2025)

**DeepSeek**
- [Open Platform Terms](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html)
- [Terms of Use](https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html)
- [morphllm API](https://www.morphllm.com/deepseek-api)

**Cohere**
- [benchlm](https://benchlm.ai/md/free-tier/cohere.md)
- [codenote trial](https://codenote.net/en/posts/cohere-trial-api-key-pricing-and-limits/)

**SambaNova**
- [Rate limits](https://docs.sambanova.ai/docs/en/models/rate-limits)
- [toolfreebie](https://toolfreebie.com/sambanova-cloud-free-api/)

**NVIDIA**
- [NIM FAQ](https://forums.developer.nvidia.com/t/nvidia-nim-faq/300317)

**Anthropic**
- [Minors guidelines](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors)

**עברית ו־Dicta**
- [Hebrew leaderboard blog](https://huggingface.co/blog/leaderboard-hebrew)
- [chat-results](https://huggingface.co/datasets/hebrew-llm-leaderboard/chat-results)
- [DictaLM 3.0 paper](https://arxiv.org/abs/2602.02104)
- [dicta-il on HF](https://huggingface.co/dicta-il)
- [gpt-oss model card](https://arxiv.org/pdf/2508.10925)
