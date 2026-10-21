import { type EffectSettings, type MotionSetting, nextMotion } from "../../../core/family/effects";
import { avatarImage } from "../../../core/family/avatars";
import { GRADE_NAMES_HE } from "../../../core/family/gradeDefaults";
import type { Profile } from "../../../core/family/profiles";
import { t } from "../../../i18n";
import { Tap } from "../../Tap";
import { Bar } from "./Bar";

interface Props {
  child: Profile;
  message?: string;
  busy: boolean;
  onName: () => void;
  onGrade: () => void;
  onAvatar: () => void;
  effects: EffectSettings;
  /** One of the battle's switches was pressed: the next motion setting, or sound or vibration on or off. */
  onEffects: (patch: Partial<EffectSettings>) => void;
  onDelete: () => void;
  onBack: () => void;
}

const MOTION_TEXT: Record<MotionSetting, "effectsMotionSystem" | "effectsMotionLess" | "effectsMotionFull"> = {
  system: "effectsMotionSystem",
  less: "effectsMotionLess",
  full: "effectsMotionFull",
};

/** One child: the name, the grade and the hero to change, and delete far from them. */
export function ChildPage({ child, message, busy, onName, onGrade, onAvatar, effects, onEffects, onDelete, onBack }: Props) {
  return (
    <main className="screen parents-page" data-screen="parents-child" data-child={child.id} data-grade={child.grade}>
      <Bar title={child.name} onBack={onBack} />
      <div className="parents-body">
        <div className="parents-row">
          <Tap id="child_name" disabled={busy} onTap={onName}>
            {t("childName")}
          </Tap>
          <Tap id="child_grade" disabled={busy} onTap={onGrade}>
            {t("childGrade", { grade: GRADE_NAMES_HE[child.grade] ?? String(child.grade) })}
          </Tap>
          <Tap id="child_avatar" disabled={busy} onTap={onAvatar}>
            <img className="child-avatar" src={avatarImage(child.avatar)} alt="" draggable={false} />
            {t("childAvatar")}
          </Tap>
        </div>
        <div className="parents-row effects-row">
          <Tap id="child_motion" disabled={busy} onTap={() => onEffects({ motion: nextMotion(effects.motion) })}>
            {t("effectsMotion", { mode: t(MOTION_TEXT[effects.motion]) })}
          </Tap>
          <Tap id="child_sound" disabled={busy} aria-pressed={effects.sound} onTap={() => onEffects({ sound: !effects.sound })}>
            {t("effectsSound", { state: t(effects.sound ? "effectsOn" : "effectsOff") })}
          </Tap>
          <Tap id="child_vibration" disabled={busy} aria-pressed={effects.vibration} onTap={() => onEffects({ vibration: !effects.vibration })}>
            {t("effectsVibration", { state: t(effects.vibration ? "effectsOn" : "effectsOff") })}
          </Tap>
        </div>
        <p className="message ok" role="status">
          {message ?? ""}
        </p>
        <Tap id="child_delete" className="danger" disabled={busy} onTap={onDelete}>
          {t("childDelete")}
        </Tap>
      </div>
    </main>
  );
}
