# W1: shipped Hebrew lines that need a native reviewer

All 1,327 lines in `mods/nagmon/npcs/*.lines.he.yaml` need a native Hebrew and educator pass before release
(the parent's rule). The build already checks length (90 characters), two sentences at most, no family words,
no fear words, no moralising phrases, no brands. A person must still read them. The ones I am least sure of:

- Jokes and riddles (correctness and whether they are funny): `nagmon_kid` `topic.joke`; `nagmon_carpenter` `topic.riddle`.
- Gender and register: lines are addressed to the child in the plural to stay neutral ("אתם", "בואו"); check they do not sound odd to one child.
- Tom (`nagmon_tourist`): the mix of English words and Hebrew, and the reading direction of mixed lines on a phone.
- Cat Pita (`nagmon_cat_pita`): lines in parentheses describe what a child imagines she says.
- Science-ish simplifications (not exact): gardener "העלים ירוקים כי הם אוכלים אור", "צמחים ... משתמשים בריח כדי להגיד שלום"; astronomer "אפשר לספור כוכבים ... הם לא נגמרים"; fisher "מים עוברים מהים לשמיים"; clockmaker `topic.tick`.
- Health: pharmacist `topic.medicine` ("מקבלים אותה ממבוגר שיודע"): safety advice that may read as a rule; nurse `topic.health`.
- Idioms and puns: Danny's stamp pun "בול", Avi's counting lines, Granny's sayings ("לאט לאט מגיעים רחוק", "מי שמחייך, הדרך אליו קצרה").
- Ofir, Salim, Haim and Fuad speak in short sentences on purpose; check they do not feel curt.
- Spelling choices without niqqud: "שנייה", "פירושו", "ד״ש".
