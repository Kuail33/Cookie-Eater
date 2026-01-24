import "./Format.css";

interface SummaryData {
  safety_score: number;
  flags: string[];
  brief_summary: string;
  advice: string;
}

export function formatSummary(summary: string) {
  try {
    const data: SummaryData = JSON.parse(summary);
    return (
      // Safety score
      <div style={{ fontSize: "14px", lineHeight: "1.6" }}>
        <div style={{ marginBottom: "12px", textAlign: "left"}}>
          <span  style={{ fontWeight: "bold", fontSize: "18px"}}>
            <strong> Safety Score: </strong>{" "}
            
            <span style={{ color: data.safety_score < 60 ? "red" : "green" }}>
              {data.safety_score}/100
            </span>
          </span>
        
        </div>

        {/* Summary */}
        <div style={{ marginBottom: "12px", textAlign: "left"}}>
          <strong> Summary: </strong>
          <p style={{ marginTop: "6px", fontStyle: "italic" }}>{data.brief_summary}</p>
        </div>

        {/* flags format */}
        {data.flags && data.flags.length > 0 && (
          <div style={{ marginBottom: "12px", textAlign: "left"}}>
            <strong> Flags: </strong>
            <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
              {data.flags.map((flag, i) => (
                <li key={i} style={{ marginBottom: "6px", textAlign: "left"}}> {flag} </li>
              ))}
            </ul>
          </div>
        )}

        

        {/* Advice */}
        <div style={{textAlign: "left"}}>
          <strong> Advice: </strong>
          <p style={{ marginTop: "6px" }}> {data.advice} </p>
        </div>
      </div>
    )
      } catch {
        return <pre> {summary}</pre>;
      }
}
