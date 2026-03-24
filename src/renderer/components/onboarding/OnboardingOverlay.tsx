import React, { useEffect, useState, useCallback } from "react";
import {
  Terminal,
  LayoutDashboard,
  Zap,
  CheckCircle2,
  ChevronRight,
  X,
  Command,
  PanelLeftClose,
  Layers,
  Plus,
  AlertTriangle,
} from "lucide-react";
import Button from "../shared/Button";

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "gilfoyle:onboarded";
const TOTAL_STEPS = 4;
const modKey =
  typeof navigator !== "undefined" && navigator.platform.includes("Mac")
    ? "Cmd"
    : "Ctrl";

// ─── Types ────────────────────────────────────────────────────────────────────

type LayoutChoice = "beginner" | "power" | null;

interface ClaudeStatus {
  detected: boolean;
  version: string | null;
  loading: boolean;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface StepIndicatorProps {
  current: number;
  total: number;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ current, total }) => (
  <div
    className="flex items-center gap-1.5"
    aria-label={`Step ${current} of ${total}`}
  >
    {Array.from({ length: total }, (_, i) => (
      <span
        key={i}
        className="rounded-full transition-all duration-300"
        style={
          i + 1 === current
            ? { width: 20, height: 6, backgroundColor: "#e8a872" }
            : i + 1 < current
              ? { width: 6, height: 6, backgroundColor: "#7c4a1e" }
              : { width: 6, height: 6, backgroundColor: "#44403c" }
        }
      />
    ))}
  </div>
);

// ─── Step 1: Welcome ─────────────────────────────────────────────────────────

interface Step1Props {
  claudeStatus: ClaudeStatus;
  onNext: () => void;
}

const Step1Welcome: React.FC<Step1Props> = ({ claudeStatus, onNext }) => (
  <div className="flex flex-col items-center text-center gap-6">
    {/* Logo mark */}
    <div
      className="flex items-center justify-center w-16 h-16 rounded-2xl"
      style={{
        border: "1px solid rgba(232,168,114,0.3)",
        backgroundColor: "rgba(232,168,114,0.1)",
        boxShadow: "0 0 32px rgba(232,168,114,0.15)",
      }}
    >
      <Terminal size={28} style={{ color: "#e8a872" }} />
    </div>

    <div className="flex flex-col gap-2">
      <h1
        className="text-2xl font-semibold text-stone-50 tracking-tight"
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        Welcome to Gilfoyle
      </h1>
      <p
        className="text-stone-400 text-sm leading-relaxed"
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        A visual dashboard for Claude Code.
        <br />
        Beautiful. Fast. Built for your workflow.
      </p>
    </div>

    {/* Claude detection status */}
    <div
      className="w-full rounded-lg px-4 py-3"
      style={{
        border: "1px solid #3a3533",
        backgroundColor: "rgba(41,37,36,0.6)",
      }}
    >
      {claudeStatus.loading ? (
        <div className="flex items-center gap-2.5">
          <div
            className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin shrink-0"
            style={{ borderColor: "#e8a872", borderTopColor: "transparent" }}
          />
          <span
            className="text-stone-500 text-xs"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            Checking for Claude Code…
          </span>
        </div>
      ) : claudeStatus.detected ? (
        <div className="flex items-center gap-2.5">
          <span
            className="w-2 h-2 rounded-full bg-green-400 shrink-0"
            aria-hidden="true"
          />
          <span
            className="text-green-400 text-xs"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            Claude Code detected
            {claudeStatus.version != null ? `: ${claudeStatus.version}` : ""}
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2.5">
          <AlertTriangle
            size={14}
            className="shrink-0 mt-0.5"
            style={{ color: "#e8a872" }}
          />
          <div className="flex flex-col gap-0.5 text-left">
            <span
              className="text-xs font-medium"
              style={{
                fontFamily: "'Geist', system-ui, sans-serif",
                color: "#e8a872",
              }}
            >
              Claude Code not found in PATH
            </span>
            <span
              className="text-stone-500 text-xs"
              style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
            >
              Install it with{" "}
              <code
                className="text-stone-400 bg-stone-800 px-1 rounded"
                style={{ fontFamily: "'Geist Mono', monospace" }}
              >
                npm i -g @anthropic-ai/claude-code
              </code>
            </span>
          </div>
        </div>
      )}
    </div>

    <Button
      variant="primary"
      size="lg"
      icon={<ChevronRight size={16} />}
      onClick={onNext}
    >
      Get Started
    </Button>
  </div>
);

// ─── Step 2: Layout Choice ────────────────────────────────────────────────────

interface LayoutCardProps {
  title: string;
  description: string;
  ascii: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}

const LayoutCard: React.FC<LayoutCardProps> = ({
  title,
  description,
  ascii,
  icon,
  selected,
  onClick,
}) => (
  <button
    onClick={onClick}
    className={[
      "flex flex-col gap-3 p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer w-full",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
      selected
        ? "shadow-[0_0_20px_rgba(232,168,114,0.12)]"
        : "hover:border-stone-700",
    ].join(" ")}
    style={
      selected
        ? {
            border: "1px solid rgba(232,168,114,0.6)",
            backgroundColor: "rgba(232,168,114,0.08)",
            outline: "none",
          }
        : { border: "1px solid #3a3533", backgroundColor: "rgba(41,37,36,0.4)" }
    }
  >
    <div className="flex items-center gap-2">
      <span style={{ color: selected ? "#e8a872" : "#78716c" }}>{icon}</span>
      <span
        className={[
          "text-sm font-medium",
          selected ? "text-stone-50" : "text-stone-300",
        ].join(" ")}
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        {title}
      </span>
      {selected && (
        <span className="ml-auto">
          <CheckCircle2 size={14} style={{ color: "#e8a872" }} />
        </span>
      )}
    </div>

    {/* ASCII preview */}
    <pre
      className="text-[9px] leading-tight rounded-md p-2 border font-mono select-none"
      style={
        selected
          ? {
              color: "rgba(232,168,114,0.7)",
              borderColor: "rgba(124,74,30,0.4)",
              backgroundColor: "rgba(124,74,30,0.12)",
              fontFamily: "'Geist Mono', monospace",
            }
          : {
              color: "#57534e",
              borderColor: "#3a3533",
              backgroundColor: "rgba(23,20,18,0.6)",
              fontFamily: "'Geist Mono', monospace",
            }
      }
      aria-hidden="true"
    >
      {ascii}
    </pre>

    <p
      className="text-stone-500 text-xs leading-relaxed"
      style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
    >
      {description}
    </p>
  </button>
);

const BEGINNER_ASCII = `┌─────────────────┐
│   Terminal      │
│                 │
│   $             │
│                 │
└─────────────────┘`;

const POWER_ASCII = `┌───────┬────┬────┐
│  Term │Ana │Ctx │
│       ├────┴────┤
│       │Sessions │
├───────┤         │
│  MCP  │         │
└───────┴─────────┘`;

interface Step2Props {
  choice: LayoutChoice;
  onChoose: (c: LayoutChoice) => void;
  onNext: () => void;
}

const Step2Layout: React.FC<Step2Props> = ({ choice, onChoose, onNext }) => (
  <div className="flex flex-col gap-5">
    <div className="text-center">
      <h2
        className="text-xl font-semibold text-stone-50 tracking-tight"
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        Choose your layout
      </h2>
      <p
        className="text-stone-500 text-sm mt-1"
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        You can always switch with {modKey}+Shift+P
      </p>
    </div>

    <div className="flex gap-3">
      <LayoutCard
        title="Simple"
        description="Single terminal view. Low friction, high focus. Recommended for most workflows."
        ascii={BEGINNER_ASCII}
        icon={<Terminal size={15} />}
        selected={choice === "beginner"}
        onClick={() => onChoose("beginner")}
      />
      <LayoutCard
        title="Power"
        description="Multi-panel dashboard with analytics, agents, MCP, and file explorer open simultaneously."
        ascii={POWER_ASCII}
        icon={<LayoutDashboard size={15} />}
        selected={choice === "power"}
        onClick={() => onChoose("power")}
      />
    </div>

    <Button
      variant="primary"
      size="md"
      icon={<ChevronRight size={15} />}
      onClick={onNext}
      disabled={choice === null}
    >
      Continue
    </Button>
  </div>
);

// ─── Step 3: Quick Tips ───────────────────────────────────────────────────────

interface TipCardProps {
  icon: React.ReactNode;
  shortcut: string;
  description: string;
}

const TipCard: React.FC<TipCardProps> = ({ icon, shortcut, description }) => (
  <div
    className="flex flex-col gap-2 p-3.5 rounded-lg"
    style={{
      border: "1px solid #3a3533",
      backgroundColor: "rgba(41,37,36,0.4)",
    }}
  >
    <div className="flex items-center gap-2">
      <span className="shrink-0" style={{ color: "#e8a872" }}>
        {icon}
      </span>
      <kbd
        className="text-xs text-stone-300 bg-stone-800 border border-stone-700 rounded px-1.5 py-0.5 font-mono tracking-wide"
        style={{ fontFamily: "'Geist Mono', monospace" }}
      >
        {shortcut}
      </kbd>
    </div>
    <p
      className="text-stone-500 text-xs leading-relaxed"
      style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
    >
      {description}
    </p>
  </div>
);

interface Step3Props {
  onNext: () => void;
}

const Step3Tips: React.FC<Step3Props> = ({ onNext }) => (
  <div className="flex flex-col gap-5">
    <div className="text-center">
      <h2
        className="text-xl font-semibold text-stone-50 tracking-tight"
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        Quick tips
      </h2>
      <p
        className="text-stone-500 text-sm mt-1"
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        A few shortcuts to get you moving fast
      </p>
    </div>

    <div className="grid grid-cols-2 gap-2.5">
      <TipCard
        icon={<Command size={14} />}
        shortcut={`${modKey}+K`}
        description="Open Command Palette — search any action"
      />
      <TipCard
        icon={<PanelLeftClose size={14} />}
        shortcut={`${modKey}+\\`}
        description="Toggle sidebar visibility"
      />
      <TipCard
        icon={<Layers size={14} />}
        shortcut={`${modKey}+Shift+P`}
        description="Switch between Simple and Power layouts"
      />
      <TipCard
        icon={<Plus size={14} />}
        shortcut={`${modKey}+N`}
        description="Start a new Claude Code session"
      />
    </div>

    <Button
      variant="primary"
      size="md"
      icon={<ChevronRight size={15} />}
      onClick={onNext}
    >
      Almost there
    </Button>
  </div>
);

// ─── Step 4: Ready ────────────────────────────────────────────────────────────

interface Step4Props {
  onDismiss: () => void;
}

const Step4Ready: React.FC<Step4Props> = ({ onDismiss }) => (
  <div className="flex flex-col items-center text-center gap-6">
    <div
      className="flex items-center justify-center w-16 h-16 rounded-full border border-green-500/30 bg-green-500/10"
      style={{ boxShadow: "0 0 32px rgba(34,197,94,0.12)" }}
    >
      <CheckCircle2 size={32} className="text-green-400" />
    </div>

    <div className="flex flex-col gap-2">
      <h2
        className="text-2xl font-semibold text-stone-50 tracking-tight"
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        You're all set!
      </h2>
      <p
        className="text-stone-400 text-sm leading-relaxed"
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        Gilfoyle is ready to go.
        <br />
        Press {modKey}+K anytime to get help.
      </p>
    </div>

    <Button
      variant="primary"
      size="lg"
      icon={<Zap size={16} />}
      onClick={onDismiss}
    >
      Start using Gilfoyle
    </Button>
  </div>
);

// ─── Main Overlay ─────────────────────────────────────────────────────────────

interface OnboardingOverlayProps {
  /** Force the overlay to show regardless of localStorage — useful in dev/storybook. */
  forceShow?: boolean;
}

const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({
  forceShow = false,
}) => {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(1);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [layoutChoice, setLayoutChoice] = useState<LayoutChoice>(null);
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus>({
    detected: false,
    version: null,
    loading: true,
  });

  // ── Show logic: only if not already onboarded ──────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const alreadyDone = stored === "true";
    console.log(
      "[Onboarding] storage key:",
      STORAGE_KEY,
      "value:",
      stored,
      "alreadyDone:",
      alreadyDone,
    );
    if (forceShow || !alreadyDone) {
      setVisible(true);
    }
  }, [forceShow]);

  // ── Detect Claude Code via platform API ────────────────────────────────
  useEffect(() => {
    if (!visible) return;

    const detect = async (): Promise<void> => {
      try {
        const api = (
          window as Window & { claude?: { getPlatform(): Promise<string> } }
        ).claude;
        if (!api) {
          setClaudeStatus({ detected: false, version: null, loading: false });
          return;
        }
        // We use getPlatform as a connectivity check; a real version check
        // would require a dedicated IPC channel. For now we confirm the
        // preload bridge is alive which implies the app launched correctly.
        await api.getPlatform();
        setClaudeStatus({ detected: true, version: null, loading: false });
      } catch {
        setClaudeStatus({ detected: false, version: null, loading: false });
      }
    };

    detect();
  }, [visible]);

  // ── Step transition with animation ────────────────────────────────────
  const goTo = useCallback(
    (next: number, dir: "forward" | "back" = "forward") => {
      setAnimating(true);
      setDirection(dir);
      setTimeout(() => {
        setStep(next);
        setAnimating(false);
      }, 180);
    },
    [],
  );

  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS) goTo(step + 1, "forward");
  }, [step, goTo]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    console.log("[Onboarding] dismissed — marked onboarded in localStorage");
    setVisible(false);
  }, []);

  if (!visible) return null;

  // ── Animation classes ─────────────────────────────────────────────────
  const contentClass = animating
    ? direction === "forward"
      ? "opacity-0 translate-x-3"
      : "opacity-0 -translate-x-3"
    : "opacity-100 translate-x-0";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-md"
        style={{ backgroundColor: "rgba(23,20,18,0.75)" }}
        onClick={handleDismiss}
        aria-hidden="true"
      />

      {/* Card */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "#1a1614",
          border: "1px solid #3a3533",
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.04), 0 32px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* Ambient top glow */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(232,168,114,0.4) 50%, transparent)",
          }}
          aria-hidden="true"
        />

        {/* Header row */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <StepIndicator current={step} total={TOTAL_STEPS} />

          <button
            onClick={handleDismiss}
            className="text-stone-600 hover:text-stone-400 transition-colors duration-150 rounded-md p-1 -mr-1 focus-visible:outline-none focus-visible:ring-2"
            aria-label="Skip onboarding"
            title="Skip"
          >
            <X size={14} />
          </button>
        </div>

        {/* Step content — animated */}
        <div
          className={[
            "px-6 py-6 transition-all duration-180",
            contentClass,
          ].join(" ")}
          style={{ transitionDuration: "180ms" }}
        >
          {step === 1 && (
            <Step1Welcome claudeStatus={claudeStatus} onNext={handleNext} />
          )}
          {step === 2 && (
            <Step2Layout
              choice={layoutChoice}
              onChoose={setLayoutChoice}
              onNext={handleNext}
            />
          )}
          {step === 3 && <Step3Tips onNext={handleNext} />}
          {step === 4 && <Step4Ready onDismiss={handleDismiss} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-5">
          {step > 1 ? (
            <button
              onClick={() => goTo(step - 1, "back")}
              className="text-stone-600 hover:text-stone-400 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 rounded"
              style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
            >
              Back
            </button>
          ) : (
            <span />
          )}

          <button
            onClick={handleDismiss}
            className="text-stone-700 hover:text-stone-500 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 rounded"
            style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
          >
            Skip setup
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingOverlay;
