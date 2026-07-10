import type { BgModelChoice } from "@/lib/photo-bg-composite-client"

export const MANUFACTURER_BG_MODEL_OPTIONS: Array<{
  value: BgModelChoice
  label: string
  desc: string
}> = [
  {
    value: "bria-rmbg2",
    label: "✨ BRIA RMBG-2.0",
    desc: "Ultra precision — best for hair, ponytails, and braids. Requires internet.",
  },
  {
    value: "gemini",
    label: "☁️ Google AI (Gemini)",
    desc: "Premium quality — handles hair perfectly. Requires internet.",
  },
  {
    value: "removebg",
    label: "⚡ API AI (Poof/remove.bg)",
    desc: "Uses the same cloud API chain as the live form. Requires internet.",
  },
  {
    value: "birefnet",
    label: "☁️ Cloud AI (BiRefNet)",
    desc: "Alternative quality — fast cloud processing. Requires internet.",
  },
  {
    value: "isnet",
    label: "💻 Local ISNet",
    desc: "Runs on this PC. First use downloads ~170MB. Works offline.",
  },
]
