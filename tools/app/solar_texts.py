# SPDX-License-Identifier: GPL-3.0
"""
What the people of the solar-system trip say, in Hebrew and English.

Pure data (no imports), read by ``solar_layouts`` (which hands it to the
importer that writes the ``.po`` strings) and by ``solar_missions`` (which
turns it into the maps' events).

A key is ``(zone, name)``: ``zone`` is a zone id or ``station``, ``name``
is the person's slug (the greeting, 2-3 true facts) or the slug plus
``_<part>`` (a later step of a mission). Texts that every person shares
(the answers to a question) are under the zone ``quiz``.

Every fact is checked against what is known; no text says more than
that. Short, calm, no niqqud.
"""

from __future__ import annotations

#: Coins for the first mission of each zone, and for a right answer to a
#: person's question (at most ``DAILY_LIMIT`` a day for each person).
MISSION_COINS = {
    "moon": 10,
    "sun": 12,
    "rocky_planets": 15,
    "giants": 18,
    "outer": 25,
}
#: The one item a zone's mission gives besides the coins, on its first
#: completion (ids of mods/nagmon/economy/items.yaml; a different one per zone).
MISSION_ITEMS = {
    "moon": "magic_net",
    "sun": "hint_feather",
    "rocky_planets": "silver_net",
    "giants": "growth_tonic",
    "outer": "clover",
}
QUIZ_COINS = 3
DAILY_LIMIT = 3

_P = "nagmon_solar_"

TEXTS: dict[tuple[str, str], tuple[str, str]] = {
    # --------------------------------------------------------- the answers
    ("quiz", "good"): (
        f"נכון! הנה {QUIZ_COINS} מטבעות בשבילכם.",
        f"Right! Here are {QUIZ_COINS} coins for you.",
    ),
    ("quiz", "free"): (
        "נכון! כל הכבוד. המטבעות להיום נגמרו, אבל תמיד כיף ללמוד.",
        "Right! Well done. The coins for today are all given, but learning is always fun.",
    ),
    ("quiz", "wrong"): (
        "לא נורא! עכשיו ראינו את התשובה. בפעם הבאה יהיה קל יותר.",
        "No problem! Now we saw the answer. Next time it will be easier.",
    ),
    ("quiz", "mission_wrong"): (
        "לא נורא! עכשיו ראינו את התשובה. אפשר לחזור ולנסות שוב מתי שרוצים.",
        "No problem! Now we saw the answer. You can come back and try again whenever you like.",
    ),
    # ------------------------------------------------------------ the Moon
    ("moon", f"{_P}moon_engineer"): (
        "אני מהנדסת הירח. על הירח אין אוויר, ולכן אין שם רוח ואין קולות. הירח מלא מכתשים, שנוצרו כשסלעים מהחלל פגעו בו.",
        "I am the Moon engineer. The Moon has no air, so there is no wind and no sound. It is full of craters, made when rocks from space hit it.",
    ),
    ("moon", f"{_P}moon_engineer_ask"): (
        "אני רושמת את המכתשים ביומן, ויש המון. תעזרו לי עם שאלה אחת?",
        "I am writing the craters in my log, and there are so many. Will you help me with one question?",
    ),
    ("moon", f"{_P}moon_engineer_good"): (
        f"נכון! המכתשים נרשמו ביומן. קבלו {MISSION_COINS['moon']} מטבעות על העזרה.",
        f"Right! The craters are in the log. Here are {MISSION_COINS['moon']} coins for your help.",
    ),
    ("moon", f"{_P}owl"): (
        "הירח לא מאיר בעצמו. אנחנו רואים אור שמש שחוזר ממנו. הירח מקיף את כדור הארץ בערך פעם בחודש.",
        "The Moon makes no light of its own. We see sunlight coming back from it. The Moon goes around the Earth about once a month.",
    ),
    # ------------------------------------------------------------- the Sun
    ("sun", f"{_P}owl"): (
        "השמש היא כוכב: כדור ענק של גז לוהט. לעולם לא מסתכלים על השמש ישר. מסתכלים עליה רק דרך מסנן מיוחד, ועם מבוגר.",
        "The Sun is a star: a giant ball of hot gas. Never look straight at the Sun. Look only through a special filter, with a grown-up.",
    ),
    ("sun", f"{_P}owl_ask"): (
        "המסנן המגן שלי אבד בערפל! בלעדיו אי אפשר להסתכל על השמש בבטחה. אולי האישה עם הברדס האפור מצאה אותו?",
        "My shield filter got lost in the fog! Without it we cannot watch the Sun safely. Maybe the woman in the grey hood found it?",
    ),
    ("sun", f"{_P}owl_wait"): (
        "עוד לא מצאנו את המסנן שלי. נסו לשאול את האישה עם הברדס האפור.",
        "We have not found my filter yet. Try asking the woman in the grey hood.",
    ),
    ("sun", f"{_P}owl_found"): (
        "זה המסנן שלי! תודה. מסנן כזה מגן על העיניים, ובלעדיו לא מסתכלים על השמש. יש לי עוד שאלה בשבילכם.",
        "That is my filter! Thank you. A filter like this protects the eyes, and without it we do not look at the Sun. I have one more question for you.",
    ),
    ("sun", f"{_P}owl_good"): (
        f"נכון! קבלו {MISSION_COINS['sun']} מטבעות, ותודה שמצאתם את המסנן.",
        f"Right! Here are {MISSION_COINS['sun']} coins, and thank you for finding the filter.",
    ),
    ("sun", f"{_P}grey_hood"): (
        "השמש גדולה כל כך שיותר ממיליון כדורי ארץ היו נכנסים בתוכה. האור שלה לוקח בערך שמונה דקות להגיע אלינו.",
        "The Sun is so big that more than a million Earths would fit inside it. Its light takes about eight minutes to reach us.",
    ),
    ("sun", f"{_P}grey_hood_filter"): (
        "מצאתי בערפל מסנן מוזר. אולי הוא של הינשוף? בבקשה, קחו אותו אליו.",
        "I found a strange filter in the fog. Maybe it is the owl's? Please take it to him.",
    ),
    # ----------------------------------------------------- the rocky planets
    ("rocky_planets", f"{_P}rover_driver"): (
        "אני נוהג ברובר על מאדים. האדמה שם אדומה, כי יש בה ברזל חלוד. על מאדים יש הר געש ענק בשם אולימפוס.",
        "I drive a rover on Mars. The ground there is red, because it holds rusty iron. Mars has a giant volcano called Olympus.",
    ),
    ("rocky_planets", f"{_P}rover_driver_ask"): (
        "רוצים לנסוע איתי? יהיו שלוש תחנות בדרך, ובכל תחנה שאלה.",
        "Want to ride with me? There are three stops on the way, and a question at each stop.",
    ),
    ("rocky_planets", f"{_P}rover_driver_good"): (
        f"הגענו! נסיעה יפה. קבלו {MISSION_COINS['rocky_planets']} מטבעות.",
        f"We made it! A fine drive. Here are {MISSION_COINS['rocky_planets']} coins.",
    ),
    ("rocky_planets", f"{_P}rover_driver_weak"): (
        "הדרך הייתה קצת משובשת, אבל למדנו בדרך. אפשר לנסוע שוב מתי שרוצים.",
        "The road was a little bumpy, but we learned on the way. We can drive again whenever you like.",
    ),
    ("rocky_planets", f"{_P}sage"): (
        "ארבעת כוכבי הלכת הראשונים סלעיים: חמה, נוגה, כדור הארץ ומאדים. יש להם קרקע קשה. כדור הארץ הוא המקום היחיד שאנחנו יודעים שיש בו חיים.",
        "The first four planets are rocky: Mercury, Venus, Earth and Mars. They have hard ground. Earth is the only place we know that has life.",
    ),
    ("rocky_planets", f"{_P}owl"): (
        "חמה הכי קרובה לשמש, אבל נוגה הכי חמה, בגלל העננים העבים שלה. יום אחד על נוגה ארוך יותר משנה שלה.",
        "Mercury is closest to the Sun, but Venus is the hottest, because of its thick clouds. One day on Venus is longer than its year.",
    ),
    # ------------------------------------------------- the giants and the rings
    ("giants", f"{_P}sage"): (
        "צדק הוא כוכב הלכת הגדול ביותר. לשבתאי יש טבעות של קרח וסלעים. שניהם עשויים בעיקר מגז.",
        "Jupiter is the biggest planet. Saturn has rings of ice and rock. Both are made mostly of gas.",
    ),
    ("giants", f"{_P}sage_ask"): (
        "חידה בשבילכם: יש לי טבעות יפות של קרח וסלעים, ואני הכוכב השישי מהשמש. מי אני? נגלה את התשובה אחרי שאלה אחת.",
        "A riddle for you: I have beautiful rings of ice and rock, and I am the sixth planet from the Sun. Who am I? We will find the answer after one question.",
    ),
    ("giants", f"{_P}sage_good"): (
        f"נכון! והתשובה לחידה: שבתאי, הכוכב עם הטבעות. הנה {MISSION_COINS['giants']} מטבעות.",
        f"Right! And the answer to the riddle: Saturn, the planet with the rings. Here are {MISSION_COINS['giants']} coins.",
    ),
    ("giants", f"{_P}sage_wrong"): (
        "לא נורא! עכשיו ראינו את התשובה. והתשובה לחידה: שבתאי, הכוכב עם הטבעות. אפשר לנסות שוב.",
        "No problem! Now we saw the answer. And the answer to the riddle: Saturn, the planet with the rings. You can try again.",
    ),
    ("giants", f"{_P}moon_engineer"): (
        "לצדק יש עשרות ירחים. גנימד, הגדול שבהם, גדול אפילו מכוכב חמה. אירופה, ירח אחר של צדק, מכוסה בקרח.",
        "Jupiter has dozens of moons. Ganymede, the biggest, is even bigger across than Mercury. Europa, another moon of Jupiter, is covered with ice.",
    ),
    ("giants", f"{_P}owl"): (
        "בצדק אין קרקע לעמוד עליה: הוא עשוי בעיקר מגז. יש בו סערה אדומה ענקית, שנראית כבר יותר ממאה שנה.",
        "There is no ground to stand on at Jupiter: it is mostly gas. It has a giant red storm, seen for more than a hundred years.",
    ),
    # ------------------------------------------------------ the icy edge
    ("outer", f"{_P}grey_hood"): (
        "כאן רחוק וקר. אורנוס ונפטון הם ענקי קרח. האור מהשמש מגיע לנפטון אחרי בערך ארבע שעות.",
        "It is far and cold out here. Uranus and Neptune are ice giants. Sunlight takes about four hours to reach Neptune.",
    ),
    ("outer", f"{_P}grey_hood_ask"): (
        "יש לי שלושה קלפים מהקצה של המערכת. תסתכלו עליהם, ואחר כך שאלה אחת.",
        "I have three cards from the edge of the system. Take a look at them, and then one question.",
    ),
    ("outer", f"{_P}grey_hood_card1"): (
        "קלף ראשון, נפטון: כוכב הלכת הרחוק ביותר מהשמש, עם רוחות חזקות מאוד.",
        "First card, Neptune: the planet farthest from the Sun, with very strong winds.",
    ),
    ("outer", f"{_P}grey_hood_card2"): (
        "קלף שני, פלוטו: כוכב לכת ננסי, קטן מהירח שלנו, ועל פניו אזור בצורת לב.",
        "Second card, Pluto: a dwarf planet, smaller than our Moon, with a heart-shaped region on it.",
    ),
    ("outer", f"{_P}grey_hood_card3"): (
        "קלף שלישי, שביט: כדור של קרח ואבק. כשהוא מתקרב לשמש, הוא מפתח זנב.",
        "Third card, a comet: a ball of ice and dust. When it comes near the Sun, it grows a tail.",
    ),
    ("outer", f"{_P}grey_hood_good"): (
        f"נכון! הקלפים שלכם. קבלו {MISSION_COINS['outer']} מטבעות.",
        f"Right! The cards are yours to remember. Here are {MISSION_COINS['outer']} coins.",
    ),
    ("outer", f"{_P}rover_driver"): (
        "גשושיות טסות לכאן במשך שנים. אין להן נהג, רק אנטנה שמדברת איתנו. לפעמים האות לוקח שעות להגיע.",
        "Probes fly for years to get here. They have no driver, only an antenna that talks to us. Sometimes a signal takes hours to arrive.",
    ),
    ("outer", f"{_P}owl"): (
        "פלוטו הוא כוכב לכת ננסי. שביטים באים מהאזור הקפוא בקצה המערכת. מכאן השמש נראית כמו כוכב קטן.",
        "Pluto is a dwarf planet. Comets come from the frozen region at the edge of the system. From here the Sun looks like a small star.",
    ),
    # ----------------------------------------------------------- the station
    ("station", f"{_P}astronomer"): (
        "ברוכים הבאים לתחנת החלל! דרך הטלסקופ רואים כוכבים רחוקים. האור של חלק מהם נסע אלינו שנים רבות.",
        "Welcome to the space station! The telescope shows faraway stars. The light of some of them travelled to us for many years.",
    ),
    ("station", f"{_P}astronomer_how"): (
        "יש חמישה מקומות: הירח, ליד השמש, כוכבי הלכת הסלעיים, הענקים והקצה. כל מקום נפתח כשהחבר החזק שלכם מגיע לרמה מסוימת, והנסיעה עולה מטבעות. מקום נחשב גמור כשמסיימים בו את המשימה וגם תופסים בו שלושה יצורים. כשכל החמישה גמורים, מחכה בתפריט הנסיעות מבחן האסטרונומית. מי שמצליח בו מקבל את התג.",
        "There are five places: the Moon, near the Sun, the rocky planets, the giants and the edge. Each place opens when your strongest friend reaches a certain level, and the trip costs coins. A place is done when you finish its mission there and also catch three creatures there. When all five are done, the astronomer test waits in the trips menu. Whoever passes it gets the badge.",
    ),
    ("station", f"{_P}astronomer_ready"): (
        "כל חמש המשימות גמורות! מי שתפס שלושה יצורים בכל מקום יכול לפתוח את תפריט הנסיעות ולגשת למבחן האסטרונומית.",
        "All five missions are done! If you caught three creatures in every place, you can open the trips menu and take the astronomer test.",
    ),
    ("station", f"{_P}mila"): (
        "שמונה כוכבי לכת מקיפים את השמש, וכדור הארץ הוא אחד מהם. כדור הארץ מקיף את השמש פעם בשנה. בחלל אין למעלה ולמטה, ולכן אסטרונאוטים מרחפים.",
        "Eight planets go around the Sun, and Earth is one of them. Earth goes around the Sun once a year. In space there is no up or down, so astronauts float.",
    ),
}
