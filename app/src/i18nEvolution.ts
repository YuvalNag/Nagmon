/**
 * The words of evolution (BATTLE_V3 7): the offer, the checklist, the cards, the animation. They are used only by the
 * lazy screens (the battle, the Bag, the Friends, the shop, the tutor, the parents' page), so they are a table of their
 * own that those screens load with themselves: the start script stays small (tests/unit/startBundle.test.ts). Each key
 * has its Hebrew and English text in nagmon.po as app_<key> (tests/app/test_app_evolution_texts.py keeps them in step).
 */
import { registerTexts } from "./i18n";

export const evoHe = {
  evoWarm: "{name} מרגיש משהו חם בפנים…",
  evoGo: "להתפתח!",
  evoLater: "אחר כך",
  evoSkip: "דילוג",
  evoDone: "ממשיכים",
  evoShelf: "כרטיסי התפתחות",
  evoFound: "{name} השאיר לך מתנה: {card}!",
  evoNoTarget: "אין עכשיו חבר שהכרטיס הזה מתאים לו.",
  evoNotYet: "הכרטיס הזה מתאים מרמה {level}.",
  evoWhoCard: "מי יתפתח?",
  evoCardInBattle: "כרטיסי התפתחות משתמשים מחוץ לקרב.",
  evoChecklist: "מה חסר כדי להתפתח?",
  evoReady: "{name} מוכן להתפתח!",
  evoGateLevel: "רמה {have} מתוך {need}",
  evoGateKnow: "ידע ב{subject} {have} מתוך {need}",
  evoGateStars: "כוכבים ב{subject} {have} מתוך {need}",
  evoGateHearts: "לבבות {have} מתוך {need}",
  evoGateLesson: "שיעור אצל המורה",
  evoGatePlace: "לעמוד במקום של {name}",
  evoNoForm: "אין לו צורה גדולה יותר.",
  evoKeepSmall: "להישאר קטן",
  evoKeepSmallOn: "נשאר קטן וחמוד",
  evoShimmer: "זוהר מהלמידה",
  evoStatPep: "מרץ",
  evoStatPower: "כוח",
  evoStatGuard: "הגנה",
  evoStatSpeed: "מהירות",
  evoOwl: "כל הכבוד! הלמידה שלך עזרה לו לגדול.",
  evoBook: "רשומה חדשה בספר",
  evoShimmerLine: "הוא זוהר בצבע של {subject}!",
  evoEffectsAnim: "התפתחות: {mode}",
  evoEffectsLong: "ארוכה",
  evoEffectsShort: "קצרה",
  evoTutorGift: "המורה נתנה לך מתנה: {name}!",
} as const;

registerTexts(evoHe);
