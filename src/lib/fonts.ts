import { Hanken_Grotesk, Marcellus, Nanum_Pen_Script } from "next/font/google";

// Songket type: inscriptional display caps for names, a plain grotesque for controls, a pen hand for wishes on the TV.
// next/font self-hosts the files, so guest pages never call Google.

export const display = Marcellus({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-sk-display" });
export const ui = Hanken_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-sk-ui" });
export const pen = Nanum_Pen_Script({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-sk-pen" });
