import { Albert_Sans, Nanum_Pen_Script, Yeseva_One } from "next/font/google";

// Stori type: Yeseva One for names and headings, Albert Sans for the interface, a pen hand for wishes and date captions on the TV.
// next/font self-hosts the files, so guest pages never call Google.

export const display = Yeseva_One({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-st-display" });
export const ui = Albert_Sans({ subsets: ["latin"], display: "swap", variable: "--font-st-ui" });
export const pen = Nanum_Pen_Script({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-st-pen" });
