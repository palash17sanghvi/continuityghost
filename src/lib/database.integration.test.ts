import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const boundary = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('pg', () => ({ Pool: class { async connect() { return {query:boundary.query,release() {}}; } async end() {} } }));
import { persistAnalysis, persistAnalysisFailure, persistReview, getAnalytics, reconcileMemories } from './database';
const db = new PGlite();
const f = {id:'same-finding',category:'props' as const,description:'Cup missing',referenceEvidence:'Canonical cup on table',candidateEvidence:'Empty table',uncertainty:'May be intended',suggestedAction:'Check script',status:'unreviewed' as const};
const scope = {analysisId:'same-analysis',sceneId:'same-scene'};
beforeAll(async () => {
  vi.stubEnv('DATABASE_URL','postgres://localhost/pglite-test-only'); vi.stubEnv('ALLOW_DATABASE','true');
  boundary.query.mockImplementation((sql:string,params?:unknown[])=>db.query(sql,params));
  for (const name of ['001_initial.sql','002_active_rules.sql']) await db.exec(await readFile(new URL(`../../migrations/${name}`,import.meta.url),'utf8'));
},30000);
afterAll(async()=>{await db.close();vi.unstubAllEnvs();});
describe('actual PostgreSQL via disposable in-process PGlite (no Timescale)',()=>{
  it('rejects obsolete remote decisions after an unpublished reversal, preserving history',async()=>{
    const scoped={analysisId:'reversal',projectId:'reversal-project',sceneId:'scene'};
    await persistAnalysis({...scoped,summary:'Review',findings:[f]},new Date());
    const first=await persistReview({...scoped,findingId:f.id,status:'intentional',note:'Keep absent'});
    const hit={id:'remote-hit',decisionId:first.decisionId,content:'Untrusted remote paraphrase',source:'supermemory' as const};
    expect(await reconcileMemories(scoped.projectId,scoped.sceneId,[hit])).toEqual([{...hit,content:first.content}]);
    const reversed=await persistReview({...scoped,findingId:f.id,status:'confirmed',note:'Restore the cup; not published to memory'});
    expect(await reconcileMemories(scoped.projectId,scoped.sceneId,[hit])).toEqual([]);
    expect(await reconcileMemories(scoped.projectId,'wrong-scene',[{...hit,decisionId:reversed.decisionId}])).toEqual([]);
    expect(await reconcileMemories('wrong-project',scoped.sceneId,[{...hit,decisionId:reversed.decisionId}])).toEqual([]);
    expect(await reconcileMemories(scoped.projectId,scoped.sceneId,[{...hit,decisionId:reversed.decisionId}])).toEqual([{...hit,decisionId:reversed.decisionId,content:reversed.content}]);
    const history=await db.query('SELECT active FROM continuity_rules WHERE project_id=$1 ORDER BY active',[scoped.projectId]);
    expect(history.rows).toEqual([{active:false},{active:true}]);
  });
  it('persists actual SQL and isolates colliding identifiers between projects',async()=>{
    await persistAnalysis({...scope,projectId:'project-A',summary:'A',findings:[f]},new Date());
    await persistAnalysis({...scope,projectId:'project-B',summary:'B',findings:[{...f,description:'Different project evidence'}]},new Date());
    const decision = await persistReview({...scope,projectId:'project-A',findingId:f.id,status:'intentional',note:'Script says remove cup'});
    expect(decision.content).toContain('Canonical cup on table');
    const rules = await db.query<{content:string}>('SELECT content FROM continuity_rules WHERE project_id=$1',['project-A']);
    expect(rules.rows[0].content).toBe(decision.content);
    const a=await getAnalytics('project-A'); const b=await getAnalytics('project-B'); const empty=await getAnalytics('absent');
    expect(a).toMatchObject({totals:{analyses:1,findings:1,reviews:1},outcomes:[{status:'intentional',count:1}],timeSeriesMode:'postgres'});
    expect(a.trends).toHaveLength(1); expect(a.trends[0].count).toBe(1);
    expect(b).toMatchObject({totals:{analyses:1,findings:1,reviews:0},outcomes:[{status:'unreviewed',count:1}]});
    expect(empty.totals).toEqual({analyses:0,findings:0,reviews:0}); expect(empty.trends).toEqual([]);
    const events = await db.query<{event_type:string;occurred_at:Date}>('SELECT event_type,occurred_at FROM events WHERE project_id=$1 ORDER BY occurred_at,event_type',['project-A']);
    expect(events.rows.map(r=>r.event_type).sort()).toEqual(['analysis_completed','analysis_started','finding_detected','review_intentional']);
    expect(events.rows.every(r=>r.occurred_at)).toBe(true);
    const replacement = await persistReview({...scope,projectId:'project-A',findingId:f.id,status:'dismissed',note:'x'.repeat(4000)});
    expect(replacement.decisionId).not.toBe(decision.decisionId);
    const active = await db.query<{content:string}>('SELECT content FROM continuity_rules WHERE project_id=$1 AND active',['project-A']);
    expect(active.rows).toHaveLength(1); expect(active.rows[0].content).toContain('dismissed:');
    const history = await db.query('SELECT id FROM review_decisions WHERE project_id=$1',['project-A']);
    expect(history.rows).toHaveLength(2);
  });
  it('rejects cross-scene reviews and database-level composite scope violations',async()=>{
    await expect(persistReview({...scope,sceneId:'other-scene',projectId:'project-A',findingId:f.id,status:'confirmed',note:''})).rejects.toThrow('scope');
    await expect(db.query("INSERT INTO review_decisions (id,project_id,scene_id,analysis_id,finding_id,status,note,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())",['bad','project-A','other-scene',scope.analysisId,f.id,'confirmed',''])).rejects.toThrow();
    expect((await getAnalytics('project-A')).totals.reviews).toBe(2);
  });
  it('rolls back partial writes and records actual failed runs',async()=>{
    await expect(persistAnalysis({...scope,projectId:'project-A',summary:'Duplicate',findings:[f]},new Date())).rejects.toThrow();
    expect((await getAnalytics('project-A')).totals).toEqual({analyses:1,findings:1,reviews:2});
    await persistAnalysisFailure({analysisId:'failed-analysis',projectId:'project-A',sceneId:scope.sceneId},new Date(),'Provider failed');
    expect((await getAnalytics('project-A')).totals).toEqual({analyses:2,findings:1,reviews:2});
    const events = await db.query<{event_type:string}>('SELECT event_type FROM events WHERE analysis_id=$1',['failed-analysis']);
    expect(events.rows.map(r=>r.event_type).sort()).toEqual(['analysis_failed','analysis_started']);
  });
});
