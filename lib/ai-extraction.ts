import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ExtractionResult {
  participants: string[];
  companies: string[];
  topics: string[];
  actionItems: string[];
  decisions: string[];
  meetingDate: string | null;
  completenessScore: number;
  missingData: string[];
}

export async function extractDataFromSummary(
  content: string,
  title: string
): Promise<ExtractionResult> {
  try {
    const prompt = `Analyze this meeting summary and extract structured information.

Title: ${title}

Content:
${content}

Return a JSON object with:
{
  "participants": ["name1", "name2"],
  "companies": ["company1", "company2"],
  "topics": ["topic1", "topic2"],
  "actionItems": ["action1", "action2"],
  "decisions": ["decision1", "decision2"],
  "meetingDate": "YYYY-MM-DD or null"
}

Be strict about what qualifies as participants (people mentioned as attendees), companies (organizations mentioned), and action items (specific tasks assigned).`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const extracted = JSON.parse(response.choices[0].message.content || '{}');

    const missingData: string[] = [];
    if (!extracted.participants || extracted.participants.length === 0) {
      missingData.push('Participants');
    }
    if (!extracted.meetingDate) {
      missingData.push('Meeting Date');
    }
    if (!extracted.topics || extracted.topics.length === 0) {
      missingData.push('Topics');
    }

    const totalFields = 5;
    const filledFields = [
      extracted.participants?.length > 0 ? 1 : 0,
      extracted.meetingDate ? 1 : 0,
      extracted.topics?.length > 0 ? 1 : 0,
      extracted.actionItems?.length > 0 ? 1 : 0,
      extracted.decisions?.length > 0 ? 1 : 0,
    ].reduce((a, b) => a + b, 0);

    const completenessScore = Math.round((filledFields / totalFields) * 100);

    return {
      participants: extracted.participants || [],
      companies: extracted.companies || [],
      topics: extracted.topics || [],
      actionItems: extracted.actionItems || [],
      decisions: extracted.decisions || [],
      meetingDate: extracted.meetingDate || null,
      completenessScore,
      missingData,
    };
  } catch (error) {
    console.error('Error extracting data:', error);
    return {
      participants: [],
      companies: [],
      topics: [],
      actionItems: [],
      decisions: [],
      meetingDate: null,
      completenessScore: 0,
      missingData: [
        'Participants',
        'Meeting Date',
        'Topics',
        'Action Items',
        'Decisions',
      ],
    };
  }
}
