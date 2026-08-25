'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';

type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed' | 'skipped';
type Task = {
  id: string; phase: string; track: string; module: string; title: string; source: string;
  scope: string; prerequisite: string[]; mode: 'learn' | 'review' | 'checkpoint' | 'mock';
  steps: string[]; completion_rule: string; status: TaskStatus;
  source_page: { pdf: number; printed: number } | null; weight: number;
};
type TaskProgress = {
  status: TaskStatus; step_done: boolean[]; note: string; error_tags: string[];
  skip_reason?: string; blocked_reason?: string; started_at?: string; completed_at?: string; updated_at: string;
};
type UserState = {
  schema_version: '1.0.0'; baseline_version?: string; task_progress: Record<string, TaskProgress>;
  settings: { theme: 'system' | 'light' | 'dark'; show_completed: boolean }; exported_at?: string;
};
type Baseline = { schema_version: string; tasks: Task[]; status_values: TaskStatus[] };
type View = 'home' | 'roadmap' | 'tasks' | 'detail' | 'review' | 'data';

const KEY = 'jlpt-n2-dashboard:user-state:v1';
const HINT_KEY = 'jlpt-n2-dashboard:install-hint-dismissed';
const memoryStorage = new Map<string, string>();
const statuses: Record<TaskStatus, [string, string]> = {
  not_started: ['○', '未开始'], in_progress: ['◐', '进行中'], blocked: ['!', '被阻塞'],
  completed: ['✓', '已完成'], skipped: ['↷', '已跳过'],
};
const modes: Record<Task['mode'], string> = { learn: '学习', review: '复习', checkpoint: '检查点', mock: '模拟' };
const errorTags = ['接续', '词义/语气', '审题', '定位', '速度', '听辨', '注意力'];
const trackMark: Record<string, string> = { 语法: '文', 阅读: '读', 听力: '听', 词汇: '词', 考试训练: '练' };

function emptyState(version?: string): UserState {
  return { schema_version: '1.0.0', baseline_version: version, task_progress: {}, settings: { theme: 'system', show_completed: false } };
}
function readStored(key: string) {
  try { return window.localStorage.getItem(key); }
  catch { return memoryStorage.get(key) || null; }
}
function writeStored(key: string, value: string) {
  try { window.localStorage.setItem(key, value); }
  catch { memoryStorage.set(key, value); }
}
function progress(task: Task, state: UserState): TaskProgress {
  const saved = state.task_progress[task.id];
  return saved
    ? { ...saved, step_done: task.steps.map((_, index) => Boolean(saved.step_done[index])), note: saved.note || '', error_tags: saved.error_tags || [] }
    : { status: task.status || 'not_started', step_done: task.steps.map(() => false), note: '', error_tags: [], updated_at: '' };
}
function phaseNo(phase: string) { return Number(phase.match(/P(\d+)/)?.[1] || 99); }
function bookName(source: string) {
  if (source.includes('TRY！') || source.includes('TRY!')) return 'TRY! N4 语法必备';
  if (source.includes('TRY新')) return 'TRY! N3 语法必备';
  if (source.includes('N2级语法')) return '新完全掌握 N2 语法';
  if (source.includes('N2级阅读')) return '新完全掌握 N2 阅读';
  if (source.includes('N2级 听力')) return '新完全掌握 N2 听力';
  return '教材目录任务';
}
function timeText(value?: string) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '尚无记录';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
function percent(tasks: Task[], state: UserState) {
  const active = tasks.filter((task) => progress(task, state).status !== 'skipped');
  const total = active.reduce((sum, task) => sum + task.weight, 0);
  const done = active.filter((task) => progress(task, state).status === 'completed').reduce((sum, task) => sum + task.weight, 0);
  return { done, total, value: total ? Math.round(done * 100 / total) : 0 };
}
function Badge({ value }: { value: TaskStatus }) {
  const item = statuses[value];
  return <span className={'badge badge-' + value}><span aria-hidden="true">{item[0]}</span>{item[1]}</span>;
}
function Chip({ children, kind = '' }: { children: React.ReactNode; kind?: string }) {
  return <span className={'chip ' + kind}>{children}</span>;
}
function Bar({ value, label }: { value: number; label: string }) {
  return <div className="bar-wrap"><div className="bar-label"><span>{label}</span><strong>{value}%</strong></div><div className="bar" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: value + '%' }} /></div></div>;
}

export default function Dashboard() {
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [state, setState] = useState<UserState | null>(null);
  const [view, setView] = useState<View>('home');
  const [detailId, setDetailId] = useState('');
  const [query, setQuery] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [trackFilter, setTrackFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('focus');
  const [reviewTrack, setReviewTrack] = useState('all');
  const [reviewError, setReviewError] = useState('all');
  const [pending, setPending] = useState<UserState | null>(null);
  const [message, setMessage] = useState('');
  const [hint, setHint] = useState(false);
  const [upgrade, setUpgrade] = useState(false);

  useEffect(() => {
    try {
      const stored = readStored(KEY);
      const parsed = stored ? JSON.parse(stored) as UserState : null;
      setState(parsed?.schema_version === '1.0.0' && parsed.task_progress ? { ...emptyState(), ...parsed, settings: { ...emptyState().settings, ...parsed.settings } } : emptyState());
    } catch { setState(emptyState()); }
    setHint(window.location.protocol !== 'file:' && readStored(HINT_KEY) !== '1');
    const inlineBaseline = (window as Window & { __JLPT_TASKS__?: Baseline }).__JLPT_TASKS__;
    const baselineRequest: Promise<Baseline> = inlineBaseline
      ? Promise.resolve(inlineBaseline)
      : fetch('./data/tasks.json').then((res) => {
        if (!res.ok) throw new Error('任务清单加载失败');
        return res.json();
      });
    baselineRequest.then((data: Baseline) => {
      const ids = data.tasks.map((task) => task.id);
      if (ids.length !== new Set(ids).size) throw new Error('任务 ID 重复');
      setBaseline(data);
    }).catch(() => setBaseline(null));
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!state) return;
    writeStored(KEY, JSON.stringify(state));
    document.documentElement.dataset.theme = state.settings.theme;
  }, [state]);
  useEffect(() => {
    if (baseline && state?.baseline_version && state.baseline_version !== baseline.schema_version) setUpgrade(true);
  }, [baseline, state]);
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1);
      if (hash.startsWith('task/')) { setDetailId(decodeURIComponent(hash.slice(5))); setView('detail'); return; }
      if (['home', 'roadmap', 'tasks', 'review', 'data'].includes(hash)) setView(hash as View);
    };
    sync(); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync);
  }, []);

  const tasks = baseline?.tasks || [];
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const phases = useMemo(() => [...new Set(tasks.map((task) => task.phase))].sort((a, b) => phaseNo(a) - phaseNo(b)), [tasks]);
  const tracks = useMemo(() => [...new Set(tasks.map((task) => task.track))], [tasks]);
  const canStart = (task: Task) => task.prerequisite.every((id) => {
    const prerequisite = byId.get(id);
    const status = prerequisite && state ? progress(prerequisite, state).status : 'not_started';
    return status === 'completed' || status === 'skipped';
  });
  const edit = (task: Task, changes: Partial<TaskProgress>) => {
    setState((current) => {
      if (!current) return current;
      const currentProgress = progress(task, current);
      return { ...current, task_progress: { ...current.task_progress, [task.id]: { ...currentProgress, ...changes, updated_at: new Date().toISOString() } } };
    });
  };
  const setStatus = (task: Task, status: TaskStatus) => {
    if (!state) return;
    const current = progress(task, state);
    if ((status === 'in_progress' || status === 'completed') && !canStart(task)) return window.alert('请先完成或明确跳过所有前置任务。');
    if (status === 'blocked' && !current.blocked_reason?.trim()) {
      const reason = window.prompt('请填写阻塞原因（之后可在复盘页重新打开）：');
      if (!reason?.trim()) return window.alert('阻塞原因不能为空。');
      edit(task, { status, blocked_reason: reason.trim() });
      return;
    }
    if (status === 'skipped' && !current.skip_reason?.trim()) {
      const reason = window.prompt('请填写跳过原因（之后可在复盘页重新打开）：');
      if (!reason?.trim()) return window.alert('跳过原因不能为空。');
      edit(task, { status, skip_reason: reason.trim() });
      return;
    }
    if (status === 'completed' && !window.confirm('完成条件：\n' + task.completion_rule + '\n\n确认标记为已完成？')) return;
    const now = new Date().toISOString();
    edit(task, { status, started_at: status === 'in_progress' ? current.started_at || now : current.started_at, completed_at: status === 'completed' ? now : status === 'not_started' ? undefined : current.completed_at });
  };
  const open = (id: string) => { setDetailId(id); window.location.hash = 'task/' + encodeURIComponent(id); };
  const go = (next: Exclude<View, 'detail'>) => { setView(next); window.location.hash = next === 'home' ? '' : next; };
  const overall = state ? percent(tasks, state) : { done: 0, total: 0, value: 0 };
  const next = useMemo(() => {
    if (!state) return [];
    return tasks.filter((task) => {
      const status = progress(task, state).status;
      return status === 'in_progress' || status === 'blocked' || (status === 'not_started' && canStart(task));
    }).sort((a, b) => {
      const aa = progress(a, state).status === 'in_progress' ? 0 : progress(a, state).status === 'blocked' ? 2 : 1;
      const bb = progress(b, state).status === 'in_progress' ? 0 : progress(b, state).status === 'blocked' ? 2 : 1;
      return aa - bb || phaseNo(a.phase) - phaseNo(b.phase) || b.weight - a.weight;
    }).slice(0, 4);
  }, [tasks, state, byId]);
  const listed = useMemo(() => {
    if (!state) return [];
    const text = query.toLowerCase();
    return tasks.filter((task) => {
      const item = progress(task, state);
      const matchText = !text || (task.title + task.scope + task.module).toLowerCase().includes(text);
      const matchStatus = statusFilter === 'all' || (statusFilter === 'focus' ? item.status === 'in_progress' || item.status === 'blocked' || (item.status === 'not_started' && canStart(task)) : item.status === statusFilter);
      return matchText && (phaseFilter === 'all' || task.phase === phaseFilter) && (trackFilter === 'all' || task.track === trackFilter) && matchStatus && (state.settings.show_completed || item.status !== 'completed');
    });
  }, [tasks, state, query, phaseFilter, trackFilter, statusFilter, byId]);
  const reviews = useMemo(() => {
    if (!state) return [];
    return tasks.filter((task) => {
      const item = progress(task, state);
      const notable = item.status === 'blocked' || item.status === 'skipped' || item.note.trim() || item.error_tags.length;
      return notable && (reviewTrack === 'all' || reviewTrack === task.track) && (reviewError === 'all' || item.error_tags.includes(reviewError));
    }).sort((a, b) => (progress(b, state).updated_at || '').localeCompare(progress(a, state).updated_at || ''));
  }, [tasks, state, reviewTrack, reviewError]);
  const selected = byId.get(detailId);

  const exportState = () => {
    if (!state || !baseline) return;
    const content = { export_schema_version: '1.0.0', baseline_version: baseline.schema_version, exported_at: new Date().toISOString(), user_state: { ...state, exported_at: new Date().toISOString() } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'jlpt-n2-dashboard-progress.json'; link.click(); URL.revokeObjectURL(url);
  };
  const readImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setMessage('导入文件超过 2 MB，已拒绝。');
    try {
      const data = JSON.parse(await file.text()) as { export_schema_version?: string; user_state?: UserState };
      if (data.export_schema_version !== '1.0.0' || data.user_state?.schema_version !== '1.0.0' || !data.user_state.task_progress) throw new Error('版本或格式不支持。');
      const valid = new Set(tasks.map((task) => task.id));
      for (const [id, item] of Object.entries(data.user_state.task_progress)) {
        if (!valid.has(id) || !statuses[item.status] || !Array.isArray(item.step_done) || !Array.isArray(item.error_tags)) throw new Error('发现无效任务记录：' + id);
      }
      setPending({ ...emptyState(data.user_state.baseline_version), ...data.user_state, settings: { ...emptyState().settings, ...data.user_state.settings } }); setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法读取 JSON 文件。'); }
  };
  const importState = (mode: 'merge' | 'replace') => {
    if (!pending || !state || !baseline) return;
    if (mode === 'replace') setState({ ...pending, baseline_version: baseline.schema_version });
    else {
      const combined = { ...state.task_progress };
      for (const [id, item] of Object.entries(pending.task_progress)) if (!combined[id] || new Date(item.updated_at || 0).getTime() >= new Date(combined[id].updated_at || 0).getTime()) combined[id] = item;
      setState({ ...state, task_progress: combined, baseline_version: baseline.schema_version });
    }
    setPending(null); setMessage(mode === 'merge' ? '已合并较新的记录。' : '已覆盖本机记录。');
  };
  const reset = () => {
    if (baseline && window.confirm('清除本设备所有进度、笔记和复盘记录？此操作不能撤销。')) setState(emptyState(baseline.schema_version));
  };

  if (!baseline || !state) return <main className="app-shell loading"><span className="logo">日</span><p>正在载入学习任务…</p></main>;

  return <main className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => go('home')}><span className="logo">日</span><span><strong>JLPT N2</strong><small>学习 Dashboard</small></span></button><button className="quiet" onClick={() => go('data')}>◎ 数据</button></header>
    {upgrade && <section className="notice"><span><strong>发现新版教材基线</strong><small>学习记录会保留；确认后仅采用新任务版本。</small></span><button onClick={() => { setState({ ...state, baseline_version: baseline.schema_version }); setUpgrade(false); }}>采用新版</button></section>}
    <div className="content">
      {view === 'home' && <Home tasks={tasks} state={state} all={overall} next={next} tracks={tracks} hint={hint} dismiss={() => { writeStored(HINT_KEY, '1'); setHint(false); }} open={open} go={go} />}
      {view === 'roadmap' && <Roadmap tasks={tasks} state={state} phases={phases} open={open} canStart={canStart} />}
      {view === 'tasks' && <Tasks tasks={listed} state={state} phases={phases} tracks={tracks} query={query} phase={phaseFilter} track={trackFilter} status={statusFilter} querySet={setQuery} phaseSet={setPhaseFilter} trackSet={setTrackFilter} statusSet={setStatusFilter} open={open} canStart={canStart} />}
      {view === 'detail' && selected && <Detail task={selected} state={state} byId={byId} unlocked={canStart(selected)} edit={edit} setStatus={setStatus} back={() => go('tasks')} />}
      {view === 'detail' && !selected && <Empty title="没有找到任务" body="请从任务列表重新选择一个学习任务。" />}
      {view === 'review' && <Review tasks={reviews} state={state} tracks={tracks} track={reviewTrack} error={reviewError} setTrack={setReviewTrack} setError={setReviewError} open={open} />}
      {view === 'data' && <Data baseline={baseline} state={state} message={message} pending={pending} exportState={exportState} readImport={readImport} importState={importState} cancel={() => setPending(null)} reset={reset} setting={(patch) => setState({ ...state, settings: { ...state.settings, ...patch } })} />}
    </div>
    <nav className="bottom-nav" aria-label="主导航">
      <Nav active={view === 'home'} label="总览" icon="⌂" onClick={() => go('home')} /><Nav active={view === 'roadmap'} label="路线" icon="→" onClick={() => go('roadmap')} /><Nav active={view === 'tasks' || view === 'detail'} label="任务" icon="□" onClick={() => go('tasks')} /><Nav active={view === 'review'} label="复盘" icon="↺" onClick={() => go('review')} /><Nav active={view === 'data'} label="数据" icon="◎" onClick={() => go('data')} />
    </nav>
  </main>;
}

function Nav({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) { return <button className={'nav ' + (active ? 'active' : '')} onClick={onClick} aria-label={label}><span aria-hidden="true">{icon}</span><small>{label}</small></button>; }
function Empty({ title, body }: { title: string; body: string }) { return <section className="empty"><b aria-hidden="true">○</b><h2>{title}</h2><p>{body}</p></section>; }
function TaskRow({ task, state, open, locked = false }: { task: Task; state: UserState; open: () => void; locked?: boolean }) {
  const item = progress(task, state);
  return <button className="task-row" onClick={open}><b className="track-mark" aria-hidden="true">{trackMark[task.track] || '学'}</b><span className="row-copy"><small><Chip>{task.phase}</Chip> {task.track} · {modes[task.mode]}</small><strong>{task.title}</strong><em>{task.module}</em></span><span className="row-status">{locked && item.status === 'not_started' ? <Chip kind="locked">前置未完成</Chip> : <Badge value={item.status} />}<i aria-hidden="true">›</i></span></button>;
}
function Home({ tasks, state, all, next, tracks, hint, dismiss, open, go }: { tasks: Task[]; state: UserState; all: ReturnType<typeof percent>; next: Task[]; tracks: string[]; hint: boolean; dismiss: () => void; open: (id: string) => void; go: (view: Exclude<View, 'detail'>) => void }) {
  const recent = tasks.filter((task) => progress(task, state).status === 'completed').sort((a, b) => (progress(b, state).completed_at || '').localeCompare(progress(a, state).completed_at || '')).slice(0, 3);
  return <><section className="hero"><div><p className="eyebrow">阶段 → 模块 → 任务 → 检查点</p><h1>沿着主线，稳定推进。</h1><p>不安排日期。选择已经解锁的下一步，让语法、阅读和听力在合适的阶段并行。</p></div><div className="score"><strong>{all.value}%</strong><small>加权进度</small></div></section>
    {hint && <section className="install"><b aria-hidden="true">＋</b><p><strong>可离线使用</strong><br />在 iPhone Safari 的“分享”菜单选择“添加到主屏幕”。</p><button onClick={dismiss} aria-label="关闭提示">×</button></section>}
    <section><Header eyebrow="下一步" title="可继续的任务" action="查看全部" onAction={() => go('tasks')} /><div className="stack">{next.length ? next.map((task) => <TaskRow key={task.id} task={task} state={state} open={() => open(task.id)} />) : <Empty title="当前没有可继续的任务" body="从路线中检查阶段任务，或在数据页导入已有记录。" />}</div></section>
    <section><Header eyebrow="并行轨道" title="每条线各自累计" /><div className="tracks">{tracks.map((track) => { const item = percent(tasks.filter((task) => task.track === track), state); return <button className="track-card" onClick={() => go('roadmap')} key={track}><b className="track-mark">{trackMark[track] || '学'}</b><span><strong>{track}</strong><small>{item.done} / {item.total} 权重完成</small></span><em>{item.value}%</em></button>; })}</div></section>
    <section><Header eyebrow="最近完成" title="已留下的轨迹" />{recent.length ? <div className="recent">{recent.map((task) => <button key={task.id} onClick={() => open(task.id)}><b>✓</b><span><strong>{task.title}</strong><small>{task.module} · {timeText(progress(task, state).completed_at)}</small></span></button>)}</div> : <p className="muted">完成一个任务后，它会出现在这里。</p>}</section>
  </>;
}
function Header({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) { return <div className="section-header"><span><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></span>{action && <button className="text-button" onClick={onAction}>{action}</button>}</div>; }
function Roadmap({ tasks, state, phases, open, canStart }: { tasks: Task[]; state: UserState; phases: string[]; open: (id: string) => void; canStart: (task: Task) => boolean }) {
  return <><Intro eyebrow="路线" title="阶段不是日历。" copy="语法推进等级；阅读与听力在具备前置条件后以独立轨道并行。" /><div className="roadmap">{phases.map((phase) => { const phaseTasks = tasks.filter((task) => task.phase === phase); const item = percent(phaseTasks, state); const modules = [...new Set(phaseTasks.map((task) => task.module))]; return <section className="phase-card" key={phase}><div className="phase-head"><span><Chip kind="phase">{phase}</Chip><h2>{phase.replace(/^P\d+-/, '')}</h2></span><b>{item.value}%</b></div><Bar value={item.value} label={phase + ' 加权进度'} /><div className="modules">{modules.map((module) => { const moduleTasks = phaseTasks.filter((task) => task.module === module); const mod = percent(moduleTasks, state); const parallel = moduleTasks.some((task) => task.track === '阅读' || task.track === '听力'); return <details key={module}><summary><span><strong>{module}</strong><small>{[...new Set(moduleTasks.map((task) => task.track))].join(' · ')}{parallel ? ' · 可并行' : ''}</small></span><b>{mod.value}%　⌄</b></summary><div>{moduleTasks.map((task) => <TaskRow key={task.id} task={task} state={state} open={() => open(task.id)} locked={!canStart(task)} />)}</div></details>; })}</div></section>; })}</div></>;
}
function Intro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) { return <section className="intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></section>; }
function Tasks({ tasks, state, phases, tracks, query, phase, track, status, querySet, phaseSet, trackSet, statusSet, open, canStart }: { tasks: Task[]; state: UserState; phases: string[]; tracks: string[]; query: string; phase: string; track: string; status: string; querySet: (v: string) => void; phaseSet: (v: string) => void; trackSet: (v: string) => void; statusSet: (v: string) => void; open: (id: string) => void; canStart: (task: Task) => boolean }) {
  return <><Intro eyebrow="任务" title="从可开始的任务入手。" copy="被锁定的任务仍可查看；完成操作会受到前置条件保护。" /><section className="filters"><label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => querySet(event.target.value)} placeholder="搜索标题、范围或模块" /></label><div className="selects"><Select label="阶段" value={phase} set={phaseSet} options={['all', ...phases]} all="全部阶段" /><Select label="轨道" value={track} set={trackSet} options={['all', ...tracks]} all="全部轨道" /><Select label="状态" value={status} set={statusSet} options={['focus', 'all', ...Object.keys(statuses)]} all="可开始 / 进行中 / 阻塞" /></div></section><p className="result">{tasks.length} 项任务</p><div className="stack">{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} state={state} open={() => open(task.id)} locked={!canStart(task)} />) : <Empty title="没有匹配的任务" body="调整筛选条件或尝试其他关键词。" />}</div></>;
}
function Select({ label, value, set, options, all }: { label: string; value: string; set: (v: string) => void; options: string[]; all: string }) { return <label><span>{label}</span><select value={value} onChange={(event) => set(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option === 'all' || option === 'focus' ? all : statuses[option as TaskStatus]?.[1] || option}</option>)}</select></label>; }
function Detail({ task, state, byId, unlocked, edit, setStatus, back }: { task: Task; state: UserState; byId: Map<string, Task>; unlocked: boolean; edit: (task: Task, patch: Partial<TaskProgress>) => void; setStatus: (task: Task, status: TaskStatus) => void; back: () => void }) {
  const item = progress(task, state); const reason = item.status === 'blocked' ? item.blocked_reason || '' : item.skip_reason || '';
  const setReason = (value: string) => edit(task, item.status === 'blocked' ? { blocked_reason: value } : { skip_reason: value });
  const toggleStep = (index: number) => { const steps = [...item.step_done]; steps[index] = !steps[index]; edit(task, { step_done: steps }); };
  const tag = (name: string) => edit(task, { error_tags: item.error_tags.includes(name) ? item.error_tags.filter((value) => value !== name) : [...item.error_tags, name] });
  return <><button className="back" onClick={back}>‹ 返回任务</button><section className="detail-hero"><div><Chip kind="phase">{task.phase}</Chip> <Chip>{task.track}</Chip> <Chip>{modes[task.mode]}</Chip></div><h1>{task.title}</h1><p>{task.module}</p><div className="detail-status"><Badge value={item.status} />{unlocked ? <span>前置已满足，可开始</span> : <span className="locked-text">前置任务尚未完成</span>}</div></section>
    <section className="card"><h2>范围与教材定位</h2><p>{task.scope}</p><dl><div><dt>教材</dt><dd>{bookName(task.source)}</dd></div><div><dt>页码</dt><dd>{task.source_page ? 'PDF ' + task.source_page.pdf + ' 页 · 印刷 ' + task.source_page.printed + ' 页' : '基础诊断，无固定页码'}</dd></div></dl></section>
    <section className="card"><div className="card-head"><span><h2>完成步骤</h2><p>勾选仅记录过程；不会自动计为完成。</p></span><b>{item.step_done.filter(Boolean).length} / {task.steps.length}</b></div><div className="steps">{task.steps.map((step, index) => <label key={step}><input type="checkbox" checked={item.step_done[index]} onChange={() => toggleStep(index)} /><span>{step}</span></label>)}</div></section>
    {task.prerequisite.length > 0 && <section className="card"><h2>前置任务</h2><div className="prereqs">{task.prerequisite.map((id) => { const before = byId.get(id); return before ? <span key={id}><Badge value={progress(before, state).status} /><strong>{before.title}</strong></span> : null; })}</div></section>}
    <section className="card completion"><h2>完成条件</h2><p>{task.completion_rule}</p><div className="actions">{item.status === 'not_started' && <button className="button primary" disabled={!unlocked} onClick={() => setStatus(task, 'in_progress')}>{unlocked ? '开始此任务' : '前置未完成'}</button>}{item.status === 'in_progress' && <button className="button primary" onClick={() => setStatus(task, 'completed')}>确认完成</button>}{item.status === 'completed' && <button className="button outline" onClick={() => setStatus(task, 'not_started')}>重新打开</button>}{(item.status === 'blocked' || item.status === 'skipped') && <button className="button primary" disabled={!unlocked} onClick={() => setStatus(task, 'in_progress')}>重新开始</button>}{item.status !== 'completed' && item.status !== 'blocked' && <button className="button outline" onClick={() => setStatus(task, 'blocked')}>标记阻塞</button>}{item.status !== 'completed' && item.status !== 'skipped' && <button className="button outline" onClick={() => setStatus(task, 'skipped')}>跳过任务</button>}</div>{(item.status === 'blocked' || item.status === 'skipped') && <label className="field"><span>{item.status === 'blocked' ? '阻塞原因（必填）' : '跳过原因（必填）'}</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明原因，之后可在复盘页重新打开。" /></label>}</section>
    <section className="card"><h2>错因与笔记</h2><p className="muted">复盘页会汇总这些内容。可多选错因。</p><div className="tags">{errorTags.map((name) => <button key={name} className={item.error_tags.includes(name) ? 'picked' : ''} onClick={() => tag(name)}>{item.error_tags.includes(name) ? '✓ ' : ''}{name}</button>)}</div><label className="field"><span>学习笔记</span><textarea value={item.note} onChange={(event) => edit(task, { note: event.target.value })} placeholder="记录例句、混淆点或下次处理方式…" /></label><small className="saved">本机自动保存 · 最近更新：{timeText(item.updated_at)}</small></section>
  </>;
}
function Review({ tasks, state, tracks, track, error, setTrack, setError, open }: { tasks: Task[]; state: UserState; tracks: string[]; track: string; error: string; setTrack: (v: string) => void; setError: (v: string) => void; open: (id: string) => void }) {
  return <><Intro eyebrow="复盘" title="把问题留在可见处。" copy="这里收集有错因、笔记、阻塞或跳过理由的任务，可随时重新打开。" /><section className="filters"><div className="selects"><Select label="轨道" value={track} set={setTrack} options={['all', ...tracks]} all="全部轨道" /><Select label="错因" value={error} set={setError} options={['all', ...errorTags]} all="全部错因" /></div></section><div className="review-list">{tasks.length ? tasks.map((task) => { const item = progress(task, state); const note = item.status === 'blocked' ? item.blocked_reason : item.status === 'skipped' ? item.skip_reason : item.error_tags.length ? '错因：' + item.error_tags.join(' · ') : item.note; return <button className="review-card" onClick={() => open(task.id)} key={task.id}><span><small><Chip>{task.track}</Chip> <Badge value={item.status} /></small><h2>{task.title}</h2><p>{note || '有待复盘的记录'}</p></span><i aria-hidden="true">›</i></button>; }) : <Empty title="复盘区还是空的" body="在任务详情里添加错因、笔记，或标记阻塞后，会集中显示在这里。" />}</div></>;
}
function Data({ baseline, state, message, pending, exportState, readImport, importState, cancel, reset, setting }: { baseline: Baseline; state: UserState; message: string; pending: UserState | null; exportState: () => void; readImport: (event: ChangeEvent<HTMLInputElement>) => void; importState: (mode: 'merge' | 'replace') => void; cancel: () => void; reset: () => void; setting: (patch: Partial<UserState['settings']>) => void }) {
  return <><Intro eyebrow="数据" title="学习记录只保存在这台设备。" copy="教材任务是只读基线；导入、导出与清除都只作用于你的本地学习状态。" /><section className="card"><h2>导出与导入</h2><p>导出包含进度、步骤、笔记、错因与设置，不包含教材 PDF。</p><div className="actions"><button className="button primary" onClick={exportState}>导出本机记录</button><label className="button outline file">导入 JSON<input type="file" accept="application/json,.json" onChange={readImport} /></label></div>{message && <p className="message">{message}</p>}{pending && <div className="preview"><strong>导入预览</strong><p>已通过格式校验，包含 {Object.keys(pending.task_progress).length} 项学习记录。请选择处理方式：</p><div className="actions"><button className="button primary" onClick={() => importState('merge')}>合并，保留较新记录</button><button className="button outline" onClick={() => importState('replace')}>覆盖本机记录</button><button className="button ghost" onClick={cancel}>取消</button></div></div>}</section>
    <section className="card"><h2>显示设置</h2><label className="switch"><span><strong>在任务列表显示已完成</strong><small>默认聚焦可开始、进行中和阻塞任务。</small></span><input type="checkbox" checked={state.settings.show_completed} onChange={(event) => setting({ show_completed: event.target.checked })} /></label><label className="field"><span>外观</span><select value={state.settings.theme} onChange={(event) => setting({ theme: event.target.value as UserState['settings']['theme'] })}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label></section>
    <section className="card"><h2>教材基线与本机存储</h2><dl><div><dt>任务基线版本</dt><dd>{baseline.schema_version}</dd></div><div><dt>教材任务数</dt><dd>{baseline.tasks.length} 项</dd></div><div><dt>已保存任务记录</dt><dd>{Object.keys(state.task_progress).length} 项</dd></div><div><dt>数据位置</dt><dd>此浏览器的 localStorage</dd></div></dl><p className="muted">更新任务基线不会静默删除学习记录；若版本变化，应用会明确提示。</p><button className="button danger" onClick={reset}>清除本机学习记录</button></section>
  </>;
}
