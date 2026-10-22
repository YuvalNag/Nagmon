import { useCallback, useState } from "react";
import type { Play } from "../../app/play";
import { claimGift, inbox, MAIL_KEEP, markRead, type MailItem } from "../../core/game/mail";
import { type Recall, recallFor } from "../../core/game/journal";
import { fillText } from "../../core/world/dialog";
import { prizeLook } from "../prizeLook";
import { Tap } from "../Tap";
import { EnvelopeArt, Pic } from "./ObjectArt";
import { RecallCard } from "./Recall";
import { checkMail } from "./mailSync";
import { type InnerBack, useInnerBack } from "./useBack";
import { w } from "./words";

interface Props {
  play: Play;
  inner: InnerBack;
  /** The wallet, the Bag or the mail changed (saved already). */
  onChanged: () => void;
}

/**
 * The mail (the mailbox's screen and the PC's Mail tab): today's postcard and the event letters that
 * arrived (core/game/mail.ts), newest first. A letter shows its words, the fact it carries verbatim, an
 * optional recall question (practice only) and, once, its small gift.
 */
export function MailView({ play, inner, onChanged }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [recall, setRecall] = useState<Recall | null>(null);
  const [taken, setTaken] = useState<string | null>(null);
  const world = play.world;
  const today = play.today();

  // what came by today arrives when the mail is opened (safe to repeat), and is saved at once
  useState(() => checkMail(play));

  const items = inbox(world);
  const item = open ? (items.find((i) => i.uid === open) ?? null) : null;
  const goBack = useCallback(() => {
    setRecall(null);
    setTaken(null);
    setOpen(null);
  }, []);
  useInnerBack(inner, item !== null, goBack);

  const read = (i: MailItem) => {
    setOpen(i.uid);
    setTaken(null);
    setRecall(null);
    if (markRead(world, i.uid)) {
      void play.saveWorld();
      onChanged();
    }
  };

  const letter = item ? play.mail.letters[item.id] : undefined;
  const variant = item && letter ? (letter.variants[item.v] ?? letter.variants[0]) : undefined;
  const sender = item ? play.mail.senders[item.from] : undefined;

  if (!item || !letter || !variant) {
    return (
      <div className="mail-list" data-id="mail_list" data-count={items.length}>
        {items.length === 0 && (
          <p className="obj-empty" data-id="mail_empty">
            {w("mailEmpty")}
          </p>
        )}
        <ul className="obj-rows">
          {items.map((i) => {
            const s = play.mail.senders[i.from];
            return (
              <li key={i.uid}>
                <Tap id={`mail_item_${i.uid.replace(/[^a-z0-9_]/gi, "_")}`} className="obj-row mail-row" data-read={i.read} data-kind={i.kind} aria-label={`${w("mailFrom", { name: s?.name ?? "" })}${i.read ? "" : `, ${w("mailNew")}`}`} onTap={() => read(i)}>
                  <EnvelopeArt open={i.read} />
                  <span className="row-text">
                    <strong>{w("mailFrom", { name: s?.name ?? "" })}</strong>
                    <span className="row-sub">{i.kind === "postcard" ? w("mailPostcard") : w("mailLetter")}</span>
                  </span>
                  {i.gift && !i.claimed && (
                    <span className="mail-gift-dot" aria-label={w("mailGift")}>
                      🎁
                    </span>
                  )}
                  {!i.read && <span className="new-dot">{w("mailNew")}</span>}
                </Tap>
              </li>
            );
          })}
        </ul>
        {items.length > 0 && <p className="obj-note">{w("mailKept", { n: MAIL_KEEP })}</p>}
      </div>
    );
  }

  const fact = variant.fact ? play.facts[variant.fact] : undefined;
  const canRecall = variant.recall && fact !== undefined && !recall;
  const gift = item.gift && !item.claimed ? item.gift : null;

  const claim = () => {
    const r = claimGift(world, play.economy, play.mail, item.uid, today);
    if (!r.taken || !r.prize) return;
    play.field.note("mail", { gift: r.prize.item ?? "coins", n: r.prize.item ? r.prize.n : r.prize.coins });
    setTaken(prizeLook(play.economy, r.prize).words);
    void play.saveWorld();
    onChanged();
  };

  return (
    <div className="mail-letter" data-id="mail_letter" data-uid={item.uid}>
      {recall ? (
        <RecallCard recall={recall} facts={play.facts} onDone={() => setRecall(null)} />
      ) : (
        <div className="letter-paper">
          <header className="letter-head">
            <Pic code={sender?.emoji ?? "2709"} className="letter-pic" />
            <strong>{w("mailFrom", { name: sender?.name ?? "" })}</strong>
          </header>
          <p className="letter-text" data-id="letter_text">
            {fillText(variant.text, { name: play.profile.name })}
          </p>
          {fact && (
            <div className="letter-fact" data-id="letter_fact">
              <Pic code={fact.emoji} className="fact-pic-small" />
              <span>{fact.text}</span>
            </div>
          )}
          {taken && (
            <p className="obj-said" role="status" data-id="mail_taken">
              {w("mailTaken", { what: taken })}
            </p>
          )}
        </div>
      )}
      {!recall && (
      <div className="obj-actions">
        {canRecall && (
          <Tap id="mail_recall" onTap={() => setRecall(recallFor(variant.fact!, play.facts, `mail:${item.uid}`))}>
            {w("mailRecall")}
          </Tap>
        )}
        {gift && (
          <Tap id="mail_take" className="primary" onTap={claim}>
            🎁 {w("mailTake")}
          </Tap>
        )}
        <Tap id="mail_back" onTap={goBack}>
          {w("mailBackToList")}
        </Tap>
      </div>
      )}
    </div>
  );
}
