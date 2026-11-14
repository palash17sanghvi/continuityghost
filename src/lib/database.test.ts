import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
const mock = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), connect: vi.fn() }));
vi.mock('pg', () => ({ Pool: class { connect = mock.connect; async end() {} } }));
import { migrate } from '../../scripts/migrate';
import { databaseEnabled, persistAnalysis, persistReview, getAnalytics, persistAnalysisFailure, reconcileMemories } from './database';
const finding = { id:'finding-1', category:'props' as const, description:'Cup missing', referenceEvidence:'Cup present', candidateEvidence:'Cup absent', uncertainty:'May be intended', suggestedAction:'Check script', status:'unreviewed' as const };
const result = { analysisId:'analysis-1', projectId:'project-1', sceneId:'scene-1', summary:'Review cup', findings:[finding] };
beforeEach(() => {
  vi.stubEnv('ALLOW_DATABASE','true'); vi.stubEnv('DATABASE_URL','postgres://localhost/test');
  mock.query.mockReset().mockResolvedValue({rows:[]}); mock.release.mockReset(); mock.connect.mockReset().mockResolvedValue(mock);
});
afterEach(()=>vi.useRealTimers());
describe('database boundary', () => {
  it('only accepts active exact-scope decision IDs with canonical content',async()=>{
    const hit={id:'remote',decisionId:'decision',content:'untrusted',source:'supermemory' as const};
    mock.query.mockResolvedValue({rows:[{decisionId:'decision',content:'canonical'}]});
    expect(await reconcileMemories('p','s',[hit,{...hit,id:'missing',decisionId:undefined}])).toEqual([{...hit,content:'canonical'}]);
    const [sql,params]=mock.query.mock.calls.find(([sql])=>sql.includes('FROM continuity_rules'))!;
    expect(sql).toContain('active');expect(sql).toContain('decision_id');expect(params).toEqual(['p','s',['decision']]);
  });
  it('skips provenance-free legacy memories without connecting',async()=>{
    expect(await reconcileMemories('p','s',[{id:'old',content:'old',source:'supermemory'}])).toEqual([]);expect(mock.connect).not.toHaveBeenCalled();
  });
  it('destroys timed-out transactions once and never commits late work',async()=>{
    vi.useFakeTimers();let resume!:(value:unknown)=>void;
    mock.query.mockImplementation((sql:string)=>sql.includes('INSERT INTO projects')?new Promise(resolve=>{resume=resolve;}):Promise.resolve({rows:[]}));
    const pending=persistAnalysis(result,new Date());const rejected=expect(pending).rejects.toThrow('deadline');
    await vi.advanceTimersByTimeAsync(8000);await rejected;
    expect(mock.release).toHaveBeenCalledExactlyOnceWith(true);
    resume({rows:[]});await vi.advanceTimersByTimeAsync(1);
    expect(mock.query).not.toHaveBeenCalledWith('COMMIT');expect(mock.release).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds a stalled rollback and destroys its connection',async()=>{
    vi.useFakeTimers();mock.query.mockImplementation((sql:string)=>sql==='ROLLBACK'?new Promise(()=>{}):sql.includes('INSERT INTO projects')?Promise.reject(new Error('failed')):Promise.resolve({rows:[]}));
    const rejected=expect(persistAnalysis(result,new Date())).rejects.toThrow('deadline');await vi.advanceTimersByTimeAsync(8000);await rejected;
    expect(mock.release).toHaveBeenCalledExactlyOnceWith(true);expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds acquisition and destroys a client that arrives after timeout',async()=>{
    vi.useFakeTimers();let connect!:(value:unknown)=>void;
    mock.connect.mockReturnValue(new Promise(resolve=>{connect=resolve;}));
    const rejected=expect(persistAnalysis(result,new Date())).rejects.toThrow('acquisition deadline');
    await vi.advanceTimersByTimeAsync(2000);await rejected;
    expect(mock.query).not.toHaveBeenCalled();expect(mock.release).not.toHaveBeenCalled();
    connect(mock);await vi.advanceTimersByTimeAsync(1);
    expect(mock.release).toHaveBeenCalledExactlyOnceWith(true);expect(mock.query).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
  });
  it('clears deadlines on success without destroying the connection',async()=>{
    vi.useFakeTimers();await persistAnalysis(result,new Date());
    expect(mock.release).toHaveBeenCalledExactlyOnceWith(false);expect(vi.getTimerCount()).toBe(0);
  });
  it('requires explicit opt-in and URL', async () => {
    vi.stubEnv('ALLOW_DATABASE','false'); expect(databaseEnabled()).toBe(false);
    await expect(persistAnalysis(result,new Date())).rejects.toThrow('disabled'); expect(mock.connect).not.toHaveBeenCalled();
    vi.stubEnv('ALLOW_DATABASE','true'); vi.stubEnv('DATABASE_URL',''); expect(databaseEnabled()).toBe(false);
  });
  it('writes scoped analysis, evidence and timestamped events atomically using parameters', async () => {
    const started = new Date('2026-01-01T00:00:00Z'); await persistAnalysis(result,started);
    const calls = mock.query.mock.calls;
    expect(calls[0][0]).toBe('BEGIN'); expect(calls.at(-1)?.[0]).toBe('COMMIT');
    expect(calls.find(([sql]) => sql.includes('INSERT INTO analyses'))?.[1]).toEqual(expect.arrayContaining(['analysis-1','project-1','scene-1',started]));
    expect(calls.find(([sql]) => sql.includes('INSERT INTO findings'))?.[1]).toEqual(expect.arrayContaining(['Cup present','Cup absent']));
    for (const type of ['analysis_started','analysis_completed','finding_detected']) expect(calls.some(([,p]) => p?.includes(type))).toBe(true);
    expect(calls.map(([sql]) => sql).join(' ')).not.toContain('Cup missing'); expect(mock.release).toHaveBeenCalledOnce();
  });
  it('rolls back writes and releases connection on failure', async () => {
    mock.query.mockImplementation(async (sql:string) => { if (sql.includes('INSERT INTO findings')) throw new Error('write failed'); return {rows:[]}; });
    await expect(persistAnalysis(result,new Date())).rejects.toThrow('write failed');
    expect(mock.query).toHaveBeenCalledWith('ROLLBACK'); expect(mock.query).not.toHaveBeenCalledWith('COMMIT'); expect(mock.release).toHaveBeenCalledOnce();
  });
  it('rejects invalid input before connecting', async () => {
    await expect(persistAnalysis({...result,findings:[{...finding,category:'injected' as 'props'}]},new Date())).rejects.toThrow();
    await expect(persistReview({analysisId:'a',findingId:'f',projectId:'p',sceneId:'s',status:'invalid' as 'confirmed',note:''})).rejects.toThrow();
    expect(mock.connect).not.toHaveBeenCalled();
  });
  it('rejects review unless exact project, scene, analysis and finding exist', async () => {
    await expect(persistReview({analysisId:'a',findingId:'f',projectId:'p',sceneId:'s',status:'confirmed',note:''})).rejects.toThrow('scope');
    const select = mock.query.mock.calls.find(([sql]) => sql.includes('FOR UPDATE'))!;
    expect(select[1]).toEqual(['p','s','a','f']);
    for (const col of ['project_id','scene_id','analysis_id','id']) expect(select[0]).toContain(col);
    expect(mock.query).toHaveBeenCalledWith('ROLLBACK');
  });
  it('uses canonical evidence for rule and appends decision and review event', async () => {
    mock.query.mockImplementation(async (sql:string) => ({rows:sql.includes('FOR UPDATE') ? [finding] : []}));
    const saved = await persistReview({analysisId:'a',findingId:'f',projectId:'p',sceneId:'s',status:'intentional',note:'Scripted removal'});
    expect(saved.decisionId).toBeTruthy(); expect(saved.content).toContain('Cup present'); expect(saved.content).toContain('Scripted removal');
    for (const table of ['review_decisions','continuity_rules','events']) expect(mock.query.mock.calls.some(([sql])=>sql.includes(`INSERT INTO ${table}`))).toBe(true);
    expect(mock.query.mock.calls.some(([,p])=>p?.includes('review_intentional'))).toBe(true);
  });
  it('records failed analysis without invented findings', async () => {
    await persistAnalysisFailure({analysisId:'failed',projectId:'p',sceneId:'s'},new Date(),'Provider unavailable');
    expect(mock.query.mock.calls.some(([,p])=>p?.includes('analysis_failed'))).toBe(true);
    expect(mock.query.mock.calls.some(([sql])=>sql.includes('INSERT INTO findings'))).toBe(false);
  });
  it.each([false,true])('queries real project aggregates with timescale=%s', async enabled => {
    mock.query.mockImplementation(async (sql:string) => {
      if(sql.includes('pg_extension') || sql.includes('timescaledb_information.hypertables')) return {rows:[{available:enabled}]};
      if(sql.includes('GROUP BY category')) return {rows:[{category:'props',count:'2'}]};
      if(sql.includes('GROUP BY status')) return {rows:[{status:'confirmed',count:'1'}]};
      if(sql.includes('AS bucket')) return {rows:[{bucket:new Date('2026-01-01Z'),count:'2'}]};
      if(sql.includes('AS analyses')) return {rows:[{analyses:'1',findings:'2',reviews:'1'}]};
      return {rows:[]};
    });
    const analytics = await getAnalytics('project-1');
    expect(analytics.totals).toEqual({analyses:1,findings:2,reviews:1}); expect(analytics.categories).toEqual([{category:'props',count:2}]);
    expect(analytics.timeSeriesMode).toBe(enabled?'timescale':'postgres');
    const trend = mock.query.mock.calls.find(([sql])=>sql.includes('AS bucket'))!;
    expect(trend[0]).toContain(enabled?'time_bucket':'date_trunc'); expect(trend[0]).toContain('events'); expect(trend[1]).toEqual(['project-1']);
  });
  it('migration refuses disabled configuration before connecting', async () => {
    vi.stubEnv('ALLOW_DATABASE','false');
    await expect(migrate()).rejects.toThrow('disabled'); expect(mock.connect).not.toHaveBeenCalled();
  });
  it('migration serializes, tracks checksums, and skips applied SQL on rerun', async () => {
    await migrate();
    expect(mock.query.mock.calls[0][0]).toBe('BEGIN');
    expect(mock.query.mock.calls[1][0]).toContain('pg_advisory_xact_lock');
    const trackedRows = mock.query.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO schema_migrations')).map(([,params])=>({name:params[0],checksum:params[1]}));
    expect(trackedRows).toHaveLength((await readdir(new URL('../../migrations',import.meta.url))).filter(name=>name.endsWith('.sql')).length);
    const tracked = [trackedRows[0].name,trackedRows[0].checksum];
    expect(tracked[0]).toBe('001_initial.sql'); expect(tracked[1]).toMatch(/^[a-f0-9]{64}$/);
    mock.query.mockReset().mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT name, checksum')?trackedRows:[]}));
    await migrate();
    expect(mock.query.mock.calls.some(([sql])=>sql.includes('CREATE TABLE projects'))).toBe(false);
    expect(mock.query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
  it('migration rejects checksum drift and rolls back', async () => {
    mock.query.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT name, checksum')?[{name:'001_initial.sql',checksum:'changed'}]:[]}));
    await expect(migrate()).rejects.toThrow('checksum mismatch'); expect(mock.query).toHaveBeenCalledWith('ROLLBACK');
  });
  it('migration enforces composite isolation and optional extension without installation', () => {
    const sql = readFileSync(new URL('../../migrations/001_initial.sql',import.meta.url),'utf8');
    expect(sql).toContain('FOREIGN KEY (project_id, scene_id, analysis_id)');
    expect(sql).toContain('FOREIGN KEY (project_id, scene_id, analysis_id, finding_id)');
    expect(sql).toContain('create_hypertable'); expect(sql).toContain('pg_extension'); expect(sql).not.toMatch(/CREATE\s+EXTENSION/i);
    const runner = readFileSync(new URL('../../scripts/migrate.ts',import.meta.url),'utf8');
    expect(runner).toContain('pg_advisory_xact_lock'); expect(runner).toContain('sha256'); expect(runner).toContain('checksum');
  });
});
