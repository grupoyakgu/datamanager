import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

function bodyParagraphs(text: string, rtl: boolean): Paragraph[] {
  const lines = text.split('\n');
  return lines.map(
    (line) =>
      new Paragraph({
        children: [new TextRun(line)],
        bidirectional: rtl,
        alignment: rtl ? AlignmentType.RIGHT : undefined,
      })
  );
}

export interface SummaryDocxInput {
  title: string;
  meetingDate: string | null;
  meetingTime: string | null;
  participants: string[];
  tags: string[];
  content: string;
  aiSummary: string | null;
  hebrewTranslation: string | null;
}

/** A real .docx (not a Google Doc) with the original email, the AI summary and its Hebrew translation. */
export async function generateSummaryDocx(input: SummaryDocxInput): Promise<Buffer> {
  const children: Paragraph[] = [new Paragraph({ text: input.title || 'Untitled summary', heading: HeadingLevel.HEADING_1 })];

  const meta: string[] = [];
  if (input.meetingDate) meta.push(`Date: ${input.meetingDate}${input.meetingTime ? ' ' + input.meetingTime : ''}`);
  if (input.participants.length > 0) meta.push(`Participants: ${input.participants.join(', ')}`);
  if (input.tags.length > 0) meta.push(`Tags: ${input.tags.join(', ')}`);
  for (const line of meta) {
    children.push(new Paragraph({ children: [new TextRun({ text: line, italics: true })] }));
  }

  children.push(new Paragraph({ text: 'Original Summary', heading: HeadingLevel.HEADING_2 }));
  children.push(...bodyParagraphs(input.content || '', false));

  if (input.aiSummary) {
    children.push(new Paragraph({ text: 'AI Summary', heading: HeadingLevel.HEADING_2 }));
    children.push(...bodyParagraphs(input.aiSummary, false));
  }

  if (input.hebrewTranslation) {
    children.push(
      new Paragraph({
        children: [new TextRun('תרגום לעברית (Hebrew Translation)')],
        heading: HeadingLevel.HEADING_2,
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
      })
    );
    children.push(...bodyParagraphs(input.hebrewTranslation, true));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
