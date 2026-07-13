import type { Note } from "./types";
import { safeFileName } from "./markdown";

// A4 aspect ratio (297mm / 210mm), used to slice the rendered content into
// evenly sized pages regardless of the pixel scale it was rasterized at.
const A4_RATIO = 297 / 210;

const CONTENT_STYLES = `
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #111827;
  line-height: 1.6;
  font-size: 15px;
`;

const BODY_STYLES = `
  h1, h2, h3, h4 { font-weight: 600; margin: 1.2em 0 0.5em; }
  h1 { font-size: 1.6em; } h2 { font-size: 1.35em; } h3 { font-size: 1.15em; }
  p { margin: 0.6em 0; }
  ul, ol { margin: 0.6em 0; padding-left: 1.5em; }
  blockquote { margin: 0.6em 0; padding-left: 1em; border-left: 3px solid #d1d5db; color: #4b5563; }
  code { background: #f3f4f6; padding: 0.15em 0.35em; border-radius: 4px; font-size: 0.9em; }
  pre { background: #f3f4f6; padding: 0.8em; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
  th, td { border: 1px solid #d1d5db; padding: 0.4em 0.6em; text-align: left; }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px solid #d1d5db; margin: 1em 0; }
`;

// Renders a note's markdown into a hidden, print-styled container and
// rasterizes it, slicing the result into A4 pages of a PDF. Rendering markdown
// independently (via `marked`) rather than reusing the live editor keeps this
// decoupled from whichever editor component the app happens to use.
export async function exportNoteToPdf(note: Note): Promise<void> {
  const [{ marked }, { default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("marked"),
    import("jspdf"),
    import("html2canvas"),
  ]);

  const CONTENT_WIDTH_PX = 760;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = `${CONTENT_WIDTH_PX}px`;
  container.style.background = "#ffffff";
  container.style.padding = "32px";
  container.style.cssText += CONTENT_STYLES;

  const styleEl = document.createElement("style");
  styleEl.textContent = BODY_STYLES;
  container.appendChild(styleEl);

  const titleEl = document.createElement("h1");
  titleEl.textContent = note.title || "Untitled";
  titleEl.style.marginTop = "0";
  container.appendChild(titleEl);

  const bodyEl = document.createElement("div");
  bodyEl.innerHTML = await marked.parse(note.content_markdown || "");
  container.appendChild(bodyEl);

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff" });

    const pageWidth = canvas.width;
    const pageHeight = Math.round(pageWidth * A4_RATIO);
    const pageCount = Math.max(1, Math.ceil(canvas.height / pageHeight));

    const pdf = new jsPDF({ unit: "px", format: [pageWidth, pageHeight] });

    for (let i = 0; i < pageCount; i++) {
      const sliceHeight = Math.min(pageHeight, canvas.height - i * pageHeight);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = pageWidth;
      pageCanvas.height = pageHeight;
      const ctx = pageCanvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageWidth, pageHeight);
      ctx.drawImage(
        canvas,
        0,
        i * pageHeight,
        pageWidth,
        sliceHeight,
        0,
        0,
        pageWidth,
        sliceHeight
      );

      if (i > 0) pdf.addPage([pageWidth, pageHeight]);
      pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", 0, 0, pageWidth, pageHeight);
    }

    pdf.save(`${safeFileName(note.title)}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
