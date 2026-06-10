/** Lichtgewicht parsing van de rapporttekst naar renderbare blokken. */

export type ReportBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

const HEADING_KEYWORDS =
  /^(introductie|fase\s*\d|slotreflectie|aspiratie|patronen|nieuwe richting)/i;

function stripMarkdownMarks(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*(.+)\*\*:?\s*$/, "$1")
    .trim();
}

function isHeading(rawLine: string): boolean {
  const line = rawLine.trim();
  if (/^#{1,6}\s+/.test(line)) return true;
  if (/^\*\*.+\*\*:?$/.test(line)) return true; // hele regel vetgedrukt
  return HEADING_KEYWORDS.test(stripMarkdownMarks(line));
}

export function parseReport(text: string): ReportBlock[] {
  const blocks: ReportBlock[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length) {
      blocks.push({ type: "list", items: listBuffer });
      listBuffer = [];
    }
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    if (/^[-*•]\s+/.test(line)) {
      listBuffer.push(line.replace(/^[-*•]\s+/, ""));
      continue;
    }

    flushList();

    if (isHeading(line)) {
      blocks.push({ type: "heading", text: stripMarkdownMarks(line) });
    } else {
      blocks.push({ type: "paragraph", text: line });
    }
  }
  flushList();

  return blocks;
}

/**
 * Zet een DOM-node om naar een gedownload PDF-bestand.
 * html2canvas + jsPDF worden dynamisch geladen (client-only).
 */
export async function downloadNodeAsPdf(
  node: HTMLElement,
  filename: string,
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#d6c9af",
    useCORS: true,
  });

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const imgData = canvas.toDataURL("image/png");

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}
