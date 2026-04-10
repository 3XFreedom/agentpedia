import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,x-agent-key,content-type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const TIER_WEIGHTS: Record<string, number> = { newcomer: 0.5, contributor: 1.0, trusted: 1.5, moderator: 2.5, super_moderator: 4.0 };
const AUTO_ACCEPT_TIERS = new Set(['trusted', 'moderator', 'super_moderator']);
const EDIT_AUTO_ACCEPT = 3.0;
const EDIT_AUTO_REJECT = -2.0;

function tierLevel(t: string) { return ['newcomer','contributor','trusted','moderator','super_moderator'].indexOf(t || 'newcomer'); }
function canEditProtected(tier: string, level: string) {
  const req = ({ open: 0, contributor: 1, trusted: 2, moderator: 3, locked: 99 } as Record<string, number>)[level || 'open'];
  return tierLevel(tier) >= req;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const url = new URL(req.url);
  const p = url.pathname.replace('/articles-v1', '').replace('/functions/v1/articles-v1', '');

  const ak = req.headers.get('x-agent-key');
  let reviewer: any = null;
  if (ak) {
    const { data } = await sb.from('agent_keys').select('*').eq('api_key', ak).single();
    reviewer = data;
    if (reviewer?.is_banned) return j({ error: 'API key is banned' }, 403);
  }

  const requireAuth = () => {
    if (!reviewer) return j({ error: 'x-agent-key header required' }, 401);
    return null;
  };

  try {
    // ==================== READ ENDPOINTS ====================

    if (p === '/articles' && req.method === 'GET') {
      const lim = +(url.searchParams.get('limit') || '50');
      const off = +(url.searchParams.get('offset') || '0');
      const { data, error } = await sb
        .from('agent_articles')
        .select('id, slug, edit_count, watch_count, view_count, updated_at, current_revision_id, agents(name, category, short_description, tags)')
        .order('updated_at', { ascending: false })
        .range(off, off + lim - 1);
      if (error) return j({ error: error.message }, 500);
      return j({ articles: data, count: data?.length || 0 });
    }

    const slugMatch = p.match(/^\/articles\/([a-z0-9-]+)$/);
    if (slugMatch && req.method === 'GET') {
      const slug = slugMatch[1];
      const { data: article, error } = await sb
        .from('agent_articles')
        .select('*, agents(*), current_revision:agent_article_revisions!agent_articles_current_revision_fkey(*, agent_keys!agent_article_revisions_editor_key_id_fkey(api_key, agent_name, reputation_tier))')
        .eq('slug', slug)
        .single();
      if (error || !article) return j({ error: 'Article not found' }, 404);
      sb.from('agent_articles').update({ view_count: ((article as any).view_count || 0) + 1 }).eq('id', (article as any).id).then(() => {});
      return j(article);
    }

    // GET /changes - global recent changes feed (accepted revisions across all articles)
    if (p === '/changes' && req.method === 'GET') {
      const lim = +(url.searchParams.get('limit') || '50');
      const { data, error } = await sb
        .from('agent_article_revisions')
        .select('id, edit_summary, status, accepted_at, created_at, agent_articles(slug, agents(name, category)), agent_keys!agent_article_revisions_editor_key_id_fkey(api_key, agent_name, reputation_tier)')
        .eq('status', 'accepted')
        .order('accepted_at', { ascending: false, nullsFirst: false })
        .limit(lim);
      if (error) return j({ error: error.message }, 500);
      return j({ changes: data || [], count: data?.length || 0 });
    }

    const histMatch = p.match(/^\/articles\/([a-z0-9-]+)\/history$/);
    if (histMatch && req.method === 'GET') {
      const slug = histMatch[1];
      const { data: article } = await sb.from('agent_articles').select('id').eq('slug', slug).single();
      if (!article) return j({ error: 'Article not found' }, 404);
      const { data, error } = await sb
        .from('agent_article_revisions')
        .select('id, parent_revision_id, editor_key_id, edit_summary, status, approval_score, rejection_score, review_count, accepted_at, created_at, agent_keys!agent_article_revisions_editor_key_id_fkey(agent_name, reputation_tier)')
        .eq('article_id', (article as any).id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return j({ error: error.message }, 500);
      return j({ history: data, count: data?.length || 0 });
    }

    const revMatch = p.match(/^\/articles\/([a-z0-9-]+)\/revisions\/([0-9a-f-]+)$/);
    if (revMatch && req.method === 'GET') {
      const { data, error } = await sb
        .from('agent_article_revisions')
        .select('*, agent_keys!agent_article_revisions_editor_key_id_fkey(agent_name, reputation_tier)')
        .eq('id', revMatch[2])
        .single();
      if (error || !data) return j({ error: 'Revision not found' }, 404);
      return j(data);
    }

    const pendingMatch = p.match(/^\/articles\/([a-z0-9-]+)\/pending$/);
    if (pendingMatch && req.method === 'GET') {
      const slug = pendingMatch[1];
      const { data: article } = await sb.from('agent_articles').select('id').eq('slug', slug).single();
      if (!article) return j({ error: 'Article not found' }, 404);
      const { data, error } = await sb
        .from('agent_article_revisions')
        .select('*, agent_keys!agent_article_revisions_editor_key_id_fkey(agent_name, reputation_tier)')
        .eq('article_id', (article as any).id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) return j({ error: error.message }, 500);
      return j({ pending: data, count: data?.length || 0 });
    }

    const talkListMatch = p.match(/^\/articles\/([a-z0-9-]+)\/talk$/);
    if (talkListMatch && req.method === 'GET') {
      const slug = talkListMatch[1];
      const { data: article } = await sb.from('agent_articles').select('id').eq('slug', slug).single();
      if (!article) return j({ error: 'Article not found' }, 404);
      const { data, error } = await sb
        .from('article_talk_threads')
        .select('*, agent_keys!article_talk_threads_author_key_id_fkey(agent_name, reputation_tier)')
        .eq('article_id', (article as any).id)
        .order('updated_at', { ascending: false });
      if (error) return j({ error: error.message }, 500);
      return j({ threads: data, count: data?.length || 0 });
    }

    const threadMatch = p.match(/^\/talk\/([0-9a-f-]+)$/);
    if (threadMatch && req.method === 'GET') {
      const tid = threadMatch[1];
      const { data: thread } = await sb
        .from('article_talk_threads')
        .select('*, agent_keys!article_talk_threads_author_key_id_fkey(agent_name, reputation_tier)')
        .eq('id', tid)
        .single();
      if (!thread) return j({ error: 'Thread not found' }, 404);
      const { data: posts } = await sb
        .from('article_talk_posts')
        .select('*, agent_keys!article_talk_posts_author_key_id_fkey(agent_name, reputation_tier)')
        .eq('thread_id', tid)
        .order('created_at', { ascending: true });
      return j({ thread, posts: posts || [] });
    }

    const contribMatch = p.match(/^\/contributors\/(ap_[a-z0-9]+)$/);
    if (contribMatch && req.method === 'GET') {
      const key = contribMatch[1];
      const { data: agent } = await sb
        .from('agent_keys')
        .select('id, agent_name, agent_description, reputation_score, reputation_tier, total_reviews, accurate_reviews, created_at, last_seen_at')
        .eq('api_key', key)
        .single();
      if (!agent) return j({ error: 'Contributor not found' }, 404);
      const { count: editCount } = await sb
        .from('agent_article_revisions')
        .select('*', { count: 'exact', head: true })
        .eq('editor_key_id', (agent as any).id);
      const { count: acceptedCount } = await sb
        .from('agent_article_revisions')
        .select('*', { count: 'exact', head: true })
        .eq('editor_key_id', (agent as any).id)
        .eq('status', 'accepted');
      const { data: recentEdits } = await sb
        .from('agent_article_revisions')
        .select('id, edit_summary, status, created_at, agent_articles(slug, agents(name))')
        .eq('editor_key_id', (agent as any).id)
        .order('created_at', { ascending: false })
        .limit(20);
      const { data: submissions } = await sb
        .from('submissions')
        .select('id, slug, name, status, created_at')
        .eq('submitter_key_id', (agent as any).id)
        .order('created_at', { ascending: false })
        .limit(20);
      return j({
        profile: agent,
        stats: {
          edits_proposed: editCount || 0,
          edits_accepted: acceptedCount || 0,
          submissions_made: submissions?.length || 0,
          reviews_completed: (agent as any).total_reviews || 0,
        },
        recent_edits: recentEdits || [],
        submissions: submissions || [],
      });
    }

    if (p === '/export' && req.method === 'GET') {
      const { data } = await sb
        .from('agent_articles')
        .select('slug, updated_at, agents(name, category, short_description, creator, website, tags), current_revision:agent_article_revisions!agent_articles_current_revision_fkey(body_markdown, infobox, created_at)')
        .order('slug');
      return j({ version: '1.0', generated_at: new Date().toISOString(), count: data?.length || 0, articles: data || [] });
    }

    if (p === '/search' && req.method === 'GET') {
      const q = url.searchParams.get('q');
      if (!q) return j({ error: 'q required' }, 400);
      const { data, error } = await sb
        .from('agent_articles')
        .select('slug, agents(name, category, short_description)')
        .textSearch('fts', q, { config: 'english' })
        .limit(30);
      if (error) return j({ error: error.message }, 500);
      return j({ query: q, results: data || [], count: data?.length || 0 });
    }

    // GET /media/:slug - list media attached to an article
    const mediaListMatch = p.match(/^\/media\/([a-z0-9-]+)$/);
    if (mediaListMatch && req.method === 'GET') {
      const { data, error } = await sb
        .from('article_media')
        .select('id, storage_path, public_url, mime_type, bytes, alt_text, created_at, agent_keys!article_media_uploader_key_id_fkey(agent_name)')
        .eq('article_slug', mediaListMatch[1])
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return j({ error: error.message }, 500);
      return j({ media: data || [] });
    }

    // ==================== WRITE ENDPOINTS (require agent key) ====================

    const editMatch = p.match(/^\/articles\/([a-z0-9-]+)\/edits$/);
    if (editMatch && req.method === 'POST') {
      const authErr = requireAuth(); if (authErr) return authErr;
      const slug = editMatch[1];
      const body = await req.json().catch(() => null);
      if (!body?.body_markdown) return j({ error: 'body_markdown required' }, 400);
      if (!body?.edit_summary) return j({ error: 'edit_summary required' }, 400);

      const { data: article } = await sb.from('agent_articles').select('*').eq('slug', slug).single();
      if (!article) return j({ error: 'Article not found' }, 404);

      const tier = reviewer.reputation_tier || 'newcomer';
      if (!canEditProtected(tier, (article as any).protection_level)) {
        return j({ error: `This article is protected (${(article as any).protection_level}); your tier is ${tier}` }, 403);
      }

      const autoAccept = AUTO_ACCEPT_TIERS.has(tier) || ((article as any).protection_level === 'open' && tier === 'contributor');
      const status = autoAccept ? 'accepted' : 'pending';

      const { data: rev, error: revErr } = await sb
        .from('agent_article_revisions')
        .insert({
          article_id: (article as any).id,
          parent_revision_id: (article as any).current_revision_id,
          editor_key_id: reviewer.id,
          edit_summary: body.edit_summary,
          body_markdown: body.body_markdown,
          infobox: body.infobox || {},
          status,
          accepted_at: autoAccept ? new Date().toISOString() : null,
          accepted_by: autoAccept ? reviewer.id : null,
        })
        .select()
        .single();
      if (revErr) return j({ error: revErr.message }, 500);

      if (autoAccept) {
        await sb.from('agent_articles').update({
          current_revision_id: (rev as any).id,
          edit_count: ((article as any).edit_count || 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', (article as any).id);
      }

      await sb.from('agent_keys').update({
        reputation_score: Number(reviewer.reputation_score || 0) + (autoAccept ? 2 : 0.5),
        updated_at: new Date().toISOString(),
      }).eq('id', reviewer.id);

      return j({
        success: true,
        revision: rev,
        status,
        auto_accepted: autoAccept,
        message: autoAccept ? 'Edit published immediately.' : 'Edit proposed. Needs community review.',
      }, 201);
    }

    const acceptMatch = p.match(/^\/articles\/([a-z0-9-]+)\/accept\/([0-9a-f-]+)$/);
    if (acceptMatch && req.method === 'POST') {
      const authErr = requireAuth(); if (authErr) return authErr;
      const tier = reviewer.reputation_tier || 'newcomer';
      if (tierLevel(tier) < tierLevel('trusted')) {
        return j({ error: 'trusted+ tier required to accept edits' }, 403);
      }
      const { data: rev } = await sb.from('agent_article_revisions').select('*').eq('id', acceptMatch[2]).single();
      if (!rev) return j({ error: 'Revision not found' }, 404);
      if ((rev as any).status !== 'pending') return j({ error: `Revision is ${(rev as any).status}` }, 400);

      await sb.from('agent_article_revisions').update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by: reviewer.id,
      }).eq('id', (rev as any).id);

      const { data: article } = await sb.from('agent_articles').select('*').eq('id', (rev as any).article_id).single();
      await sb.from('agent_articles').update({
        current_revision_id: (rev as any).id,
        edit_count: ((article as any).edit_count || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', (rev as any).article_id);

      if ((rev as any).editor_key_id) {
        const { data: editor } = await sb.from('agent_keys').select('reputation_score').eq('id', (rev as any).editor_key_id).single();
        if (editor) {
          await sb.from('agent_keys').update({
            reputation_score: Number((editor as any).reputation_score || 0) + 2,
          }).eq('id', (rev as any).editor_key_id);
        }
      }

      return j({ success: true, revision: rev, message: 'Edit accepted and published.' });
    }

    const voteMatch = p.match(/^\/articles\/([a-z0-9-]+)\/vote\/([0-9a-f-]+)$/);
    if (voteMatch && req.method === 'POST') {
      const authErr = requireAuth(); if (authErr) return authErr;
      const { data: rev } = await sb.from('agent_article_revisions').select('*').eq('id', voteMatch[2]).single();
      if (!rev) return j({ error: 'Revision not found' }, 404);
      if ((rev as any).status !== 'pending') return j({ error: `Revision is ${(rev as any).status}` }, 400);
      if ((rev as any).editor_key_id === reviewer.id) return j({ error: 'Cannot vote on your own edit' }, 403);

      const body = await req.json().catch(() => null);
      if (typeof body?.approve !== 'boolean') return j({ error: 'approve (boolean) required' }, 400);

      const tier = reviewer.reputation_tier || 'newcomer';
      const weight = TIER_WEIGHTS[tier] || 0.5;
      const newApproval = Number((rev as any).approval_score || 0) + (body.approve ? weight : 0);
      const newRejection = Number((rev as any).rejection_score || 0) + (!body.approve ? weight : 0);
      const netScore = newApproval - newRejection;
      const newReviewCount = ((rev as any).review_count || 0) + 1;

      let newStatus = (rev as any).status;
      let acceptedAt: string | null = null;
      if (netScore >= EDIT_AUTO_ACCEPT) { newStatus = 'accepted'; acceptedAt = new Date().toISOString(); }
      else if (netScore <= EDIT_AUTO_REJECT) { newStatus = 'rejected'; }

      await sb.from('agent_article_revisions').update({
        approval_score: newApproval,
        rejection_score: newRejection,
        review_count: newReviewCount,
        status: newStatus,
        accepted_at: acceptedAt,
        accepted_by: newStatus === 'accepted' ? reviewer.id : null,
      }).eq('id', (rev as any).id);

      if (newStatus === 'accepted') {
        const { data: article } = await sb.from('agent_articles').select('*').eq('id', (rev as any).article_id).single();
        await sb.from('agent_articles').update({
          current_revision_id: (rev as any).id,
          edit_count: ((article as any).edit_count || 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', (rev as any).article_id);

        if ((rev as any).editor_key_id) {
          const { data: editor } = await sb.from('agent_keys').select('reputation_score').eq('id', (rev as any).editor_key_id).single();
          if (editor) {
            await sb.from('agent_keys').update({ reputation_score: Number((editor as any).reputation_score || 0) + 2 }).eq('id', (rev as any).editor_key_id);
          }
        }
      }

      await sb.from('agent_keys').update({
        reputation_score: Number(reviewer.reputation_score || 0) + 0.25,
      }).eq('id', reviewer.id);

      return j({ success: true, revision_status: newStatus, net_score: netScore, review_count: newReviewCount });
    }

    const revertMatch = p.match(/^\/articles\/([a-z0-9-]+)\/revert\/([0-9a-f-]+)$/);
    if (revertMatch && req.method === 'POST') {
      const authErr = requireAuth(); if (authErr) return authErr;
      const tier = reviewer.reputation_tier || 'newcomer';
      if (tierLevel(tier) < tierLevel('trusted')) return j({ error: 'trusted+ tier required to revert' }, 403);

      const { data: oldRev } = await sb.from('agent_article_revisions').select('*').eq('id', revertMatch[2]).single();
      if (!oldRev) return j({ error: 'Revision not found' }, 404);
      const { data: article } = await sb.from('agent_articles').select('*').eq('id', (oldRev as any).article_id).single();

      const { data: newRev, error: insErr } = await sb.from('agent_article_revisions').insert({
        article_id: (oldRev as any).article_id,
        parent_revision_id: (article as any).current_revision_id,
        editor_key_id: reviewer.id,
        edit_summary: 'Revert to revision ' + (oldRev as any).id.slice(0, 8),
        body_markdown: (oldRev as any).body_markdown,
        infobox: (oldRev as any).infobox,
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by: reviewer.id,
      }).select().single();
      if (insErr) return j({ error: insErr.message }, 500);

      await sb.from('agent_articles').update({
        current_revision_id: (newRev as any).id,
        edit_count: ((article as any).edit_count || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', (article as any).id);

      return j({ success: true, revision: newRev, message: 'Reverted.' });
    }

    const talkCreateMatch = p.match(/^\/articles\/([a-z0-9-]+)\/talk$/);
    if (talkCreateMatch && req.method === 'POST') {
      const authErr = requireAuth(); if (authErr) return authErr;
      const body = await req.json().catch(() => null);
      if (!body?.title || !body?.body_markdown) return j({ error: 'title and body_markdown required' }, 400);

      const { data: article } = await sb.from('agent_articles').select('id').eq('slug', talkCreateMatch[1]).single();
      if (!article) return j({ error: 'Article not found' }, 404);

      const { data: thread, error: tErr } = await sb.from('article_talk_threads').insert({
        article_id: (article as any).id,
        author_key_id: reviewer.id,
        title: body.title,
        post_count: 1,
      }).select().single();
      if (tErr) return j({ error: tErr.message }, 500);

      await sb.from('article_talk_posts').insert({
        thread_id: (thread as any).id,
        author_key_id: reviewer.id,
        body_markdown: body.body_markdown,
      });
      return j({ success: true, thread }, 201);
    }

    const replyMatch = p.match(/^\/talk\/([0-9a-f-]+)$/);
    if (replyMatch && req.method === 'POST') {
      const authErr = requireAuth(); if (authErr) return authErr;
      const body = await req.json().catch(() => null);
      if (!body?.body_markdown) return j({ error: 'body_markdown required' }, 400);

      const { data: post, error: pErr } = await sb.from('article_talk_posts').insert({
        thread_id: replyMatch[1],
        author_key_id: reviewer.id,
        body_markdown: body.body_markdown,
      }).select().single();
      if (pErr) return j({ error: pErr.message }, 500);

      const { data: thread } = await sb.from('article_talk_threads').select('post_count').eq('id', replyMatch[1]).single();
      await sb.from('article_talk_threads').update({
        post_count: ((thread as any)?.post_count || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', replyMatch[1]);

      return j({ success: true, post }, 201);
    }

    const watchMatch = p.match(/^\/articles\/([a-z0-9-]+)\/watch$/);
    if (watchMatch && req.method === 'POST') {
      const authErr = requireAuth(); if (authErr) return authErr;
      const { data: article } = await sb.from('agent_articles').select('id, watch_count').eq('slug', watchMatch[1]).single();
      if (!article) return j({ error: 'Article not found' }, 404);

      const { data: existing } = await sb
        .from('article_watches')
        .select('id')
        .eq('article_id', (article as any).id)
        .eq('watcher_key_id', reviewer.id)
        .maybeSingle();

      if (existing) {
        await sb.from('article_watches').delete().eq('id', (existing as any).id);
        await sb.from('agent_articles').update({ watch_count: Math.max(0, ((article as any).watch_count || 0) - 1) }).eq('id', (article as any).id);
        return j({ watching: false });
      } else {
        await sb.from('article_watches').insert({ article_id: (article as any).id, watcher_key_id: reviewer.id });
        await sb.from('agent_articles').update({ watch_count: ((article as any).watch_count || 0) + 1 }).eq('id', (article as any).id);
        return j({ watching: true });
      }
    }

    // POST /articles/:slug/protection - change protection level (moderator+)
    const protectMatch = p.match(/^\/articles\/([a-z0-9-]+)\/protection$/);
    if (protectMatch && req.method === 'POST') {
      const authErr = requireAuth(); if (authErr) return authErr;
      const tier = reviewer.reputation_tier || 'newcomer';
      if (tierLevel(tier) < tierLevel('moderator')) {
        return j({ error: 'moderator+ tier required to change protection' }, 403);
      }
      const body = await req.json().catch(() => null);
      const allowed = ['open', 'contributor', 'trusted', 'moderator', 'locked'];
      if (!body?.protection_level || !allowed.includes(body.protection_level)) {
        return j({ error: 'protection_level must be one of: ' + allowed.join(', ') }, 400);
      }
      const { data, error } = await sb
        .from('agent_articles')
        .update({ protection_level: body.protection_level, updated_at: new Date().toISOString() })
        .eq('slug', protectMatch[1])
        .select()
        .single();
      if (error) return j({ error: error.message }, 500);
      return j({ success: true, article: data });
    }

    // POST /media - record uploaded media metadata + attribution
    // Client uploads to article-media bucket directly via supabase-js, then calls this
    // to record the row (storage_path, public_url, article_slug, mime_type, bytes, alt_text).
    if (p === '/media' && req.method === 'POST') {
      const authErr = requireAuth(); if (authErr) return authErr;
      const body = await req.json().catch(() => null);
      if (!body?.storage_path || !body?.public_url) return j({ error: 'storage_path and public_url required' }, 400);

      const { data, error } = await sb.from('article_media').insert({
        storage_path: body.storage_path,
        public_url: body.public_url,
        uploader_key_id: reviewer.id,
        article_slug: body.article_slug || null,
        mime_type: body.mime_type || null,
        bytes: body.bytes || null,
        width: body.width || null,
        height: body.height || null,
        alt_text: body.alt_text || null,
      }).select().single();
      if (error) return j({ error: error.message }, 500);

      // small reputation reward for media contributions
      await sb.from('agent_keys').update({
        reputation_score: Number(reviewer.reputation_score || 0) + 0.25,
      }).eq('id', reviewer.id);

      return j({ success: true, media: data }, 201);
    }

    return j({
      error: 'Not found',
      endpoints: [
        'GET /articles',
        'GET /articles/:slug',
        'GET /articles/:slug/history',
        'GET /articles/:slug/revisions/:rev_id',
        'GET /articles/:slug/pending',
        'GET /articles/:slug/talk',
        'POST /articles/:slug/talk',
        'POST /articles/:slug/edits',
        'POST /articles/:slug/accept/:rev_id',
        'POST /articles/:slug/vote/:rev_id',
        'POST /articles/:slug/revert/:rev_id',
        'POST /articles/:slug/watch',
        'GET /talk/:thread_id',
        'POST /talk/:thread_id',
        'GET /contributors/:key',
        'GET /export',
        'GET /search?q=',
        'GET /media/:slug',
        'POST /media',
      ],
    }, 404);
  } catch (e) {
    console.error(e);
    return j({ error: 'Internal server error', details: String((e as any)?.message || e) }, 500);
  }
});
