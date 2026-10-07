import { validDate } from "./domain.mjs";
const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
export function syllabusCandidates(blocks, { year, dateOrder = "MDY" } = {}) {
  if (!Array.isArray(blocks) || blocks.length > 10000)
    throw Error(
      "The document has too many text blocks. Choose a shorter file.",
    );
  if (!["MDY", "DMY"].includes(dateOrder)) throw Error("Choose a date order.");
  if (
    year &&
    (!/^\d{4}$/.test(String(year)) ||
      Number(year) < 2000 ||
      Number(year) > 2100)
  )
    throw Error("Choose an academic year between 2000 and 2100.");
  const result = [];
  for (const [index, block] of blocks.entries()) {
    const text = block.text.trim();
    if (
      !/\b(assignment|exam|quiz|midterm|final|essay|report|project|read|reading|homework|problem set|presentation|due|submit|lab)\b/i.test(
        text,
      )
    )
      continue;
    let date = "",
      match = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/),
      warning = "";
    if (match) date = match[0];
    else {
      match = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}))?\b/);
      if (match) {
        const y = match[3] || year,
          m = dateOrder === "MDY" ? match[1] : match[2],
          d = dateOrder === "MDY" ? match[2] : match[1];
        if (y) date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        warning = `Check ${dateOrder === "MDY" ? "month/day" : "day/month"} date${match[3] ? "" : " and chosen year"}.`;
      } else {
        match = text.match(
          /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i,
        );
        if (match) {
          const y = match[3] || year;
          if (y)
            date = `${y}-${String(months.indexOf(match[1].slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
          if (!match[3])
            warning = "Confirm the chosen year against the syllabus.";
        }
      }
    }
    if (date && !validDate(date)) {
      date = "";
      warning =
        "The date could not be validated. Choose it yourself or confirm no deadline.";
    }
    if (!date)
      warning =
        warning ||
        "No complete deadline found. Choose a date or explicitly keep this undated.";
    // Never choose among several deadlines or infer times from prose.
    const dates = text.match(
      /\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}\b/gi,
    );
    if (dates?.length > 1) {
      date = "";
      warning = "Several dates appear here. Choose the correct deadline.";
    }
    result.push({
      id: String(index),
      title: text.slice(0, 500),
      date,
      kind: /\b(exam|quiz|midterm|final)\b/i.test(text) ? "Exam" : "Assignment",
      location: block.location,
      excerpt: text.slice(0, 3000),
      warning,
    });
    if (result.length > 150)
      throw Error(
        "More than 150 possible items were found. Import a shorter section.",
      );
  }
  return result;
}
