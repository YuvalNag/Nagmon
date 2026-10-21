import { t } from "../../i18n";

/** Small drawn icons of the tutor's screens (the font has no coin sign). */

export function CoinIcon() {
  return (
    <svg className="coin-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#f4c542" stroke="#9a6b00" strokeWidth="2" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#c99a1c" strokeWidth="1.5" />
    </svg>
  );
}

/** The child's coins, in the corner (the same pill as the map's, which is hidden under the tutor). */
export function CoinPill({ coins }: { coins: number }) {
  return (
    <p className="map-coins" data-id="coins" data-coins={coins} role="status" aria-label={t("mapCoins", { coins })}>
      <CoinIcon />
      <span>{coins}</span>
    </p>
  );
}

export function CheckIcon() {
  return (
    <svg className="check-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
