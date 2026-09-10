import { getSupabaseAdmin } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { computeCompleteness } from '@/lib/completeness';
import { extractFromSummary } from '@/lib/ai/extraction';
import { embedText } from '@/lib/ai/embeddings';
import { exportSummaryToDrive } from './drive-export';
import { getActiveTags } from './repository';

/**
 * Run AI extraction, tag detection, folder rules, completeness and embedding
 * for one summary. Safe to re-run; it overwrites previous extraction.
 */
export async function processSummary(summaryId: string, options: { applyFolderRules?: boolean } = {}) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: summary, error } = await supabaseAdmin
    .from('meeting_summaries')
    .select('id, title, content, email_received_at, meeting_date, folder_id')
    .eq('id', summaryId)
    .single();
  if (error || !summary) throw new Error(error?.message ?? 'Summary not found');

  const [settings, tags] = await Promise.all([getSettings(), getActiveTags()]);

  try {
    const extraction = await extractFromSummary({
      title: summary.title,
      content: summary.content,
      emailDate: summary.email_received_at,
      tags,
      fields: settings.extraction_fields,
    });

    const tagRows = extraction.tags
      .map((name) => tags.find((t) => t.name === name))
      .filter((t): t is { id: string; name: string; aliases: string[] } => !!t);

    await supabaseAdmin.from('meeting_summary_tags').delete().eq('summary_id', summaryId);
    if (tagRows.length > 0) {
      await supabaseAdmin
        .from('meeting_summary_tags')
        .insert(tagRows.map((t) => ({ summary_id: summaryId, tag_id: t.id })));
    }

    const completeness = computeCompleteness(
      {
        meetingDate: extraction.meetingDate ?? summary.meeting_date,
        participants: extraction.participants,
        topics: extraction.topics,
        tags: extraction.tags,
        companies: extraction.companies,
        decisions: extraction.decisions,
        actionItems: extraction.actionItems,
      },
      settings.completeness_weights
    );

    await supabaseAdmin.from('extracted_data').upsert(
      {
        summary_id: summaryId,
        participants: extraction.participants,
        companies: extraction.companies,
        topics: extraction.topics,
        action_items: extraction.actionItems,
        decisions: extraction.decisions,
        detected_tags: extraction.tags,
        meeting_time: extraction.meetingTime,
        model: extraction.model,
        raw: extraction.raw,
        extracted_at: new Date().toISOString(),
      },
      { onConflict: 'summary_id' }
    );

    let folderId: string = summary.folder_id;
    if (options.applyFolderRules !== false && tagRows.length > 0) {
      const { data: rules } = await supabaseAdmin
        .from('folder_rules')
        .select('tag_id, folder_id')
        .in('tag_id', tagRows.map((t) => t.id));
      const rule = (rules ?? []).find((r) => tagRows.some((t) => t.id === r.tag_id));
      if (rule) folderId = rule.folder_id as string;
    }

    const embeddingSource = [summary.title, extraction.topics.join(', '), extraction.participants.join(', '), summary.content]
      .filter(Boolean)
      .join('\n');
    let embedding: number[] | null = null;
    try {
      embedding = await embedText(embeddingSource);
    } catch (embedError) {
      console.error('Embedding failed for summary', summaryId, embedError);
    }

    const { error: updateError } = await supabaseAdmin
      .from('meeting_summaries')
      .update({
        meeting_date: extraction.meetingDate ?? summary.meeting_date,
        meeting_time: extraction.meetingTime,
        folder_id: folderId,
        completeness_score: completeness.score,
        missing_data: completeness.missing,
        language: extraction.language,
        processing_status: 'processed',
        processing_error: null,
        ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
      })
      .eq('id', summaryId);
    if (updateError) throw new Error(updateError.message);

    try {
      await exportSummaryToDrive(summaryId);
    } catch (driveError) {
      // Best-effort: extraction already succeeded, don't fail the whole run over Drive.
      console.error('Drive export failed for summary', summaryId, driveError);
    }

    return { completeness, tags: extraction.tags, folderId };
  } catch (processingError) {
    const message = processingError instanceof Error ? processingError.message : String(processingError);
    await supabaseAdmin
      .from('meeting_summaries')
      .update({ processing_status: 'failed', processing_error: message.slice(0, 500) })
      .eq('id', summaryId);
    throw processingError;
  }
}

/** Recompute completeness for a summary without calling the AI again. */
export async function recomputeCompleteness(summaryId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const [{ data: summary }, { data: extracted }, { data: tagLinks }, settings] = await Promise.all([
    supabaseAdmin.from('meeting_summaries').select('meeting_date').eq('id', summaryId).single(),
    supabaseAdmin.from('extracted_data').select('*').eq('summary_id', summaryId).maybeSingle(),
    supabaseAdmin.from('meeting_summary_tags').select('tag_id').eq('summary_id', summaryId),
    getSettings(),
  ]);
  const completeness = computeCompleteness(
    {
      meetingDate: summary?.meeting_date ?? null,
      participants: extracted?.participants ?? [],
      topics: extracted?.topics ?? [],
      tags: (tagLinks ?? []).map((t) => t.tag_id as string),
      companies: extracted?.companies ?? [],
      decisions: extracted?.decisions ?? [],
      actionItems: extracted?.action_items ?? [],
    },
    settings.completeness_weights
  );
  await supabaseAdmin
    .from('meeting_summaries')
    .update({ completeness_score: completeness.score, missing_data: completeness.missing })
    .eq('id', summaryId);
  return completeness;
}
