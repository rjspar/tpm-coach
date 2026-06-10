import { forwardRef, type ReactNode } from "react";
import { parseReport } from "./report";

/** Inline **vet** ondersteuning. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    return bold ? (
      <strong key={i} style={{ fontWeight: 700 }}>
        {bold[1]}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    );
  });
}

type Props = { report: string; title: string };

/**
 * Gestileerde versie van het rapport, offscreen gerenderd en door
 * html2canvas vastgelegd. Inline styles (geen Tailwind-klassen) zodat
 * html2canvas alles betrouwbaar oppakt.
 */
const ReportDocument = forwardRef<HTMLDivElement, Props>(function ReportDocument(
  { report, title },
  ref,
) {
  const blocks = parseReport(report);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: "-10000px",
        top: 0,
        width: "720px",
        backgroundColor: "#d6c9af",
        padding: "56px 56px 72px",
        boxSizing: "border-box",
        fontFamily: "var(--font-montserrat), sans-serif",
        color: "#1a1a1a",
      }}
    >
      {/* Logo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo_Walk_Your_Talk_transparant.png"
        alt="Walk Your Talk"
        style={{ width: "180px", height: "auto", marginBottom: "32px" }}
      />

      <h1
        style={{
          fontFamily: "var(--font-playfair), Georgia, serif",
          color: "#0d654a",
          fontSize: "30px",
          margin: "0 0 4px",
        }}
      >
        {title}
      </h1>
      <div
        style={{
          height: "2px",
          backgroundColor: "#e19c55",
          width: "100%",
          margin: "12px 0 28px",
        }}
      />

      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <div key={i} style={{ marginTop: "28px" }}>
              <h2
                style={{
                  fontFamily: "var(--font-playfair), Georgia, serif",
                  color: "#0d654a",
                  fontSize: "20px",
                  margin: "0 0 8px",
                }}
              >
                {block.text}
              </h2>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "#e19c55",
                  width: "64px",
                  marginBottom: "12px",
                }}
              />
            </div>
          );
        }

        if (block.type === "list") {
          return (
            <ul
              key={i}
              style={{
                margin: "0 0 12px",
                paddingLeft: "20px",
                lineHeight: 1.7,
                fontSize: "15px",
              }}
            >
              {block.items.map((item, j) => (
                <li key={j} style={{ marginBottom: "4px" }}>
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p
            key={i}
            style={{ margin: "0 0 12px", lineHeight: 1.7, fontSize: "15px" }}
          >
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
});

export default ReportDocument;
