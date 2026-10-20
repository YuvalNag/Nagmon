import { t } from "./i18n";

export function App() {
  return (
    <main className="screen" data-screen="who-plays">
      <h1 className="title">{t("whoPlays")}</h1>
      <div className="row">
        <button className="primary" data-id="new_child">
          {t("newPlayer")}
        </button>
        <button data-id="parents">{t("parents")}</button>
      </div>
    </main>
  );
}
