window.__ModuleLoader__.load({
  id: 'dsh-animebar',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useCallback } = React;

    const UA = { 'user-agent': 'dsh-animebar/0.3' };
    const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const DAYS_JA = ['月', '火', '水', '木', '金', '土', '日'];
    const CACHE_KEY = 'animebar.panel.cache.v2';
    const EN_CACHE = 'animebar.entitles.v1';
    const NOTES_KEY = 'animebar.notes.v1';
    const PHENOMENA = ['静止画多', '精度落差', '画风突变', '重复镜头', '演出神回'];
    const SPECULATIONS = ['疑似外包', '工期紧张', '作监尽力', '资方干预'];
    const TAG = {
      '静止画多': ['Many stills', '静止画が多い'], '精度落差': ['Quality drop', '精度の落差'],
      '画风突变': ['Style shift', '絵柄の変化'], '重复镜头': ['Repeated shots', '繰り返しカット'],
      '演出神回': ['Standout episode', '神回の演出'], '评分分歧': ['Score divergence', '評価の乖離'],
      '疑似外包': ['Suspected outsourcing', '外注の可能性'], '工期紧张': ['Schedule crunch', '工期逼迫'],
      '作监尽力': ['AD carried it', '作監の踏ん張り'], '资方干预': ['Producer meddling', '出資者の介入'],
      '值得学习': ['Worth studying', '参考になる'], '中规中矩': ['By the book', '可もなく不可もなく'],
      '有待提高': ['Needs work', '要改善'], '有巧思': ['Clever', '工夫がある'], '平淡': ['Flat', '平凡'],
      '用力过猛': ['Overwrought', 'やりすぎ'], '加分项': ['Adds value', '加点'], '无感': ['Forgettable', '響かない'],
      '出戏': ['Breaks immersion', '没入できない'],
    };
    const DIMENSIONS = [
      { key: 'art', label: '作画', options: ['值得学习', '中规中矩', '有待提高'] },
      { key: 'staging', label: '演出', options: ['有巧思', '平淡', '用力过猛'] },
      { key: 'sound', label: '声音', options: ['加分项', '无感', '出戏'] },
    ];

    function loadNotes() {
      try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'); } catch (e) { return []; }
    }

    function saveNotes(list) {
      try { localStorage.setItem(NOTES_KEY, JSON.stringify(list)); } catch (e) { /* 忽略 */ }
    }

    function notesToMarkdown(list, lang) {
      const tt = (zh, en, ja) => (lang === 'ja' ? (ja || en) : lang === 'en' ? en : zh);
      const tg = (zh) => { const p = TAG[zh]; return p ? (lang === 'ja' ? p[1] : lang === 'en' ? p[0] : zh) : zh; };
      const D = { art: ['作画', 'sakuga', '作画'], staging: ['演出', 'direction', '演出'], sound: ['声音', 'sound', '音響'] };
      const lines = [tt('# 制作人视角记录', "# Director's View", '# 制作者視点') + ' (' + list.length + ')', ''];
      const byTitle = {};
      for (const n of list) {
        (byTitle[n.title] = byTitle[n.title] || []).push(n);
      }
      for (const n of list) {
        lines.push('## ' + (n.title || ''), '');
        lines.push('- ' + tt('记录', 'Note', '記録'));
        if (n.phenomena && n.phenomena.length) lines.push('  - ' + tt('现象：', 'Symptoms: ', '兆候：') + n.phenomena.map(tg).join('、'));
        if (n.speculations && n.speculations.length) lines.push('  - ' + tt('推测：', 'Speculation: ', '推測：') + n.speculations.map(tg).join('、') + (n.evidence ? tt('（依据：', ' (evidence: ', '（根拠：') + n.evidence + '）' : ''));
        const dims = n.dims || {};
        const dimParts = Object.keys(dims).filter((k) => dims[k]).map((k) => {
          const dl = (kk) => D[kk][lang === 'ja' ? 2 : lang === 'en' ? 1 : 0];
          return dl(k) + '·' + tg(dims[k]);
        });
        if (dimParts.length) lines.push('  - ' + tt('维度：', 'Dimensions: ', '軸：') + dimParts.join('，'));
        if (n.reflection) lines.push('  - ' + tt('如果是我：', 'If it were me: ', '自分なら：') + n.reflection);
        lines.push('');
      }
      return lines.join('\n');
    }



    function readCache() {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && parsed.day === new Date().toDateString() ? parsed : null;
      } catch (e) { return null; }
    }

    function writeCache(data) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(Object.assign({ day: new Date().toDateString() }, data))); } catch (e) { /* 忽略 */ }
    }

    async function fetchTv() {
      const res = await fetch('https://api.bgm.tv/calendar', { headers: UA });
      if (!res.ok) throw new Error('Bangumi ' + res.status);
      const data = await res.json();
      const out = [];
      for (const day of data) {
        for (const it of day.items || []) {
          out.push({
            id: it.id,
            title: it.name_cn || it.name,
            orig: it.name,
            score: (it.rating && it.rating.score) || 0,
            pop: (it.rating && it.rating.total) || 0,
            img: (it.images && (it.images.common || it.images.large)) || '',
            wd: (day.weekday && day.weekday.id) || 0,
            date: it.air_date || '',
            url: 'https://bgm.tv/subject/' + it.id,
          });
        }
      }
      return out;
    }

    async function fetchMovies() {
      const out = [];
      for (let page = 0; page < 4; page += 1) {
        const res = await fetch('https://api.bgm.tv/v0/search/subjects?limit=20&offset=' + page * 20, {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, UA),
          body: JSON.stringify({ keyword: '劇場版', filter: { type: [2] }, sort: 'heat' }),
        });
        if (!res.ok) break;
        const data = await res.json();
        const rows = data.data || [];
        if (rows.length === 0) break;
        for (const it of rows) {
          out.push({
            id: it.id,
            title: it.name_cn || it.name,
            orig: it.name,
            score: (it.rating && it.rating.score) || 0,
            pop: (it.rating && it.rating.total) || 0,
            img: (it.images && (it.images.common || it.images.large)) || '',
            date: (it.date || '').slice(0, 10),
            url: 'https://bgm.tv/subject/' + it.id,
          });
        }
      }
      return out;
    }

    const GHOST = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 84'>" +
      "<rect width='60' height='84' fill='#1e293b'/>" +
      "<path d='M30 20c-9 0-14 7-14 15v20c0 4 3 4 5 2l3-3 3 4c1 2 5 2 6 0l3-4 3 4c2 2 5 2 5-2V35c0-8-5-15-14-15z' fill='#475569' opacity='.65'/>" +
      "<circle cx='25' cy='38' r='2.4' fill='#1e293b'/><circle cx='35' cy='38' r='2.4' fill='#1e293b'/>" +
      "</svg>");

    async function altScore(query) {
      try {
        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'query($s:String){Media(search:$s,type:ANIME){averageScore title{english romaji}}}', variables: { s: query } }),
        });
        const d = await res.json();
        const m = (d.data && d.data.Media) || null;
        return m && m.averageScore ? { score: m.averageScore / 10, en: (m.title && (m.title.english || m.title.romaji)) || '' } : null;
      } catch (e) { return null; }
    }

    async function kitsuScore(query) {
      try {
        const res = await fetch('https://kitsu.io/api/edge/anime?filter%5Btext%5D=' + encodeURIComponent(query) + '&page%5Blimit%5D=1');
        const d = await res.json();
        const a = (d.data && d.data[0] && d.data[0].attributes) || null;
        return a && a.averageRating ? a.averageRating / 10 : null;
      } catch (e) { return null; }
    }

    const scoreCache = new Map();
    const titleCache = new Map();
    async function multiScore(it) {
      const key = it.id;
      if (scoreCache.has(key)) return scoreCache.get(key);
      const [al, ki] = await Promise.all([altScore(it.orig || it.title), kitsuScore(it.title)]);
      if (al && al.en) titleCache.set(it.id, al.en);
      const r = 'BGM ' + (it.score ? it.score.toFixed(1) : '—')
        + ' · AniList ' + (al && al.score != null ? al.score.toFixed(1) : '—')
        + ' · Kitsu ' + (ki != null ? ki.toFixed(1) : '—');
      scoreCache.set(key, r);
      return r;
    }
    async function fetchEnglishTitles(items) {
      for (const it of items) {
        if (titleCache.has(it.id)) continue;
        const al = await altScore(it.orig || it.title);
        if (al && al.en) titleCache.set(it.id, al.en);
      }
    }

    const S = {
      btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 28, padding: '0 11px', borderRadius: 999, cursor: 'pointer', border: '1px solid #22c55e', background: '#22c55e', color: '#04140a', fontSize: 12, fontWeight: 600, lineHeight: 1 },
      hint: { position: 'absolute', left: 0, bottom: 36, whiteSpace: 'nowrap', background: '#0f172a', color: '#e2e8f0', border: '1px solid #22c55e', borderRadius: 8, padding: '5px 9px', fontSize: 11, boxShadow: '0 8px 20px rgba(0,0,0,.35)' },
      panel: { position: 'fixed', right: 16, bottom: 88, width: 400, maxHeight: '76vh', display: 'flex', flexDirection: 'column', zIndex: 60, background: '#020617', color: '#e2e8f0', borderRadius: 14, border: '1px solid #1e293b', boxShadow: '0 18px 48px rgba(0,0,0,.5)', fontFamily: 'system-ui, -apple-system, "PingFang SC", sans-serif', overflow: 'hidden', fontSize: 13 },
      head: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 8px', borderBottom: '1px solid #1e293b' },
      tabs: { display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' },
      tab: { border: '1px solid transparent', background: 'transparent', color: '#94a3b8', borderRadius: 7, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
      tabOn: { background: 'rgba(34,197,94,.16)', color: '#22c55e', border: '1px solid #166534' },
      icon: { border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 2 },
      filters: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 12px', borderBottom: '1px solid #0f172a' },
      chip: { border: '1px solid #1e293b', background: 'transparent', color: '#94a3b8', borderRadius: 999, padding: '2px 8px', fontSize: 11, cursor: 'pointer' },
      chipOn: { background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' },
      search: { flex: 1, minWidth: 90, background: 'transparent', border: '1px solid #1e293b', borderRadius: 999, color: 'inherit', fontSize: 11, padding: '3px 9px', outline: 'none' },
      list: { overflowY: 'auto', padding: 6 },
      row: { display: 'flex', gap: 9, alignItems: 'center', padding: '5px 7px', borderRadius: 8, textDecoration: 'none', color: 'inherit' },
      coverBox: { width: 32, height: 45, borderRadius: 5, flex: '0 0 auto', overflow: 'hidden', backgroundColor: '#1e293b', backgroundSize: 'cover', backgroundPosition: 'center' },
      cover: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
      title: { fontSize: 12.5, lineHeight: 1.35, margin: 0, flex: 1, minWidth: 0 },
      score: { fontSize: 11, fontVariantNumeric: 'tabular-nums', color: '#94a3b8', flex: '0 0 auto' },
      act: { border: '1px solid #1e293b', background: 'transparent', color: '#64748b', borderRadius: 6, fontSize: 10, padding: '2px 6px', cursor: 'pointer', flex: '0 0 auto' },
      status: { padding: 16, fontSize: 12, color: '#94a3b8', textAlign: 'center' },
      field: { width: '100%', boxSizing: 'border-box', background: '#0b1220', border: '1px solid #1e293b', borderRadius: 7, color: '#e2e8f0', fontSize: 12, padding: '5px 8px', outline: 'none', fontFamily: 'inherit' },
      label: { fontSize: 11, color: '#64748b', margin: '6px 0 3px' },
      ta: { width: '100%', boxSizing: 'border-box', minHeight: 44, resize: 'vertical', background: '#0b1220', border: '1px solid #1e293b', borderRadius: 7, color: '#e2e8f0', fontSize: 12, padding: '5px 8px', outline: 'none', fontFamily: 'inherit' },
      primary: { border: '1px solid #22c55e', background: '#22c55e', color: '#04140a', borderRadius: 7, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
      noteRow: { padding: '7px 8px', borderBottom: '1px solid #0f172a', fontSize: 12 },
      toast: { position: 'fixed', right: 24, bottom: 96, zIndex: 70, background: '#166534', color: '#dcfce7', border: '1px solid #22c55e', borderRadius: 8, padding: '6px 12px', fontSize: 12, boxShadow: '0 8px 20px rgba(0,0,0,.4)' },
    };

    function AnimePanel() {
      const [open, setOpen] = useState(false);
      const [lang, setLang] = useState(() => { try { return localStorage.getItem('animebar.panel.lang') || 'zh'; } catch (e) { return 'zh'; } });
      const t = (zh, en, ja) => (lang === 'ja' ? (ja || en) : lang === 'en' ? en : zh);
      const ttag = (zh) => { const p = TAG[zh]; return p ? (lang === 'ja' ? p[1] : lang === 'en' ? p[0] : zh) : zh; };
      const detailHref = (it) => {
        if (lang === 'en') return 'https://myanimelist.net/anime.php?q=' + encodeURIComponent(it.orig || it.title);
        if (lang === 'ja') return 'https://www.google.com/search?q=' + encodeURIComponent((it.orig || it.title) + ' アニメ');
        return it.url;
      };
      const watchHref = (it) => {
        if (lang === 'en') return 'https://www.justwatch.com/us/search?q=' + encodeURIComponent(it.orig || it.title);
        if (lang === 'ja') return 'https://www.justwatch.com/jp/search?q=' + encodeURIComponent(it.orig || it.title);
        return 'animebar://anich?title=' + encodeURIComponent(it.title);
      };
      const titleText = (it) => {
        if (lang === 'ja') return it.orig || it.title;
        if (lang === 'en') {
          const cached = enTitles[it.id] || titleCache.get(it.id);
          if (cached) return cached;
          return it.orig || it.title;
        }
        return it.title;
      };
      const [hint, setHint] = useState(() => {
        try { return localStorage.getItem('animebar.hint') !== 'seen'; } catch (e) { return true; }
      });
      const [tab, setTab] = useState('tv');
      const [tv, setTv] = useState(null);
      const [movies, setMovies] = useState(null);
      const [error, setError] = useState('');
      const [wd, setWd] = useState(0);
      const [sortKey, setSortKey] = useState('pop');
      const [kw, setKw] = useState('');
      const [toast, setToast] = useState('');
      const [scoreMap, setScoreMap] = useState({});
      const [enTitles, setEnTitles] = useState({});
      const [notes, setNotes] = useState(loadNotes);
      const [draft, setDraft] = useState({ title: '', phenomena: [], speculations: [], evidence: '', reflection: '', dims: {} });

      // ---- 捕获复盘（Triage）----
      const [captures, setCaptures] = useState(null);
      const EMPTY_TRI = { note_id: '', episode: '', phenomena: [], speculations: [], my_take: '', evidence: '' };
      const [tri, setTri] = useState(EMPTY_TRI);
      const [tags, setTags] = useState([]);

      const labelOf = (tag) => {
        const l = (tag && tag.label) || {};
        if (lang === 'ja') return l.ja || l.en || tag.slug;
        if (lang === 'en') return l.en || tag.slug;
        return l.zh || tag.slug;
      };

      const loadTags = useCallback(async () => {
        try {
          const res = await fetch('/api/animebar/tags', { credentials: 'same-origin' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          setTags(Array.isArray(data.tags) ? data.tags : []);
          setSeedSlugs(Array.isArray(data.seedSlugs) ? data.seedSlugs : []);
        } catch (e) {
          setToast(t('读取标签失败', 'Cannot load tags', 'タグ取得に失敗') + ': ' + String(e.message || e));
        }
      }, [lang]);

      const [newTag, setNewTag] = useState({ slug: '', zh: '', en: '', ja: '' });
      const [manage, setManage] = useState(false);
      const [seedSlugs, setSeedSlugs] = useState([]);
      const [pendingDelete, setPendingDelete] = useState('');
      const [dimsOpen, setDimsOpen] = useState({});
      const [exportRange, setExportRange] = useState('all');

      const addSlug = async (kind) => {
        const slug = newTag.slug.trim().toLowerCase();
        if (!slug) return;
        const label = {};
        if (newTag.zh.trim()) label.zh = newTag.zh.trim();
        if (newTag.en.trim()) label.en = newTag.en.trim();
        if (newTag.ja.trim()) label.ja = newTag.ja.trim();
        try {
          const res = await fetch('/api/animebar/tags', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug, kind, label }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
          await loadTags();
          toggleTriTag(kind, slug);
          setNewTag({ slug: '', zh: '', en: '', ja: '' });
          setToast(t('已新增标签', 'Tag added', 'タグを追加'));
        } catch (e) {
          setToast(t('新增失败', 'Add failed', '追加に失敗') + ': ' + String(e.message || e));
        }
      };

      const removeTag = async (slug) => {
        try {
          const res = await fetch('/api/animebar/tags?slug=' + encodeURIComponent(slug), {
            method: 'DELETE',
            credentials: 'same-origin',
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
          await loadTags();
          setToast(t('已删除标签', 'Tag deleted', 'タグを削除'));
        } catch (e) {
          setToast(t('删除失败', 'Delete failed', '削除に失敗') + ': ' + String(e.message || e));
        }
      };

      const toggleTriTag = (kind, slug) => {
        const field = kind === 'speculation' ? 'speculations' : 'phenomena';
        setTri((prev) => {
          const cur = Array.isArray(prev[field]) ? prev[field] : [];
          const next = cur.includes(slug) ? cur.filter((x) => x !== slug) : cur.concat(slug);
          return Object.assign({}, prev, { [field]: next });
        });
      };

      // 从片名猜集数：'第7集' / 'S01E07' / 'EP05' / ' - 03 [1080p]' 都认；
      // 分辨率（1080/720…）和年份不当作集数
      const guessEpisode = (title) => {
        const t = String(title || '');
        let m = t.match(/第\s*(\d{1,3})\s*[集話话]/);
        if (m) return String(parseInt(m[1], 10));
        m = t.match(/S\d{1,2}E(\d{1,3})/i) || t.match(/\bE(?:P)?(\d{1,3})\b/i);
        if (m) return String(parseInt(m[1], 10));
        const skip = new Set(['480', '720', '1080', '1440', '2160', '264', '265']);
        const tokens = t.match(/(?:^|[\s\-_\[\]\(\)])(\d{1,3})(?=[\s\-_\[\]\(\)\.]|$)/g) || [];
        for (const tok of tokens) {
          const n = tok.replace(/\D/g, '');
          if (!n) continue;
          const v = parseInt(n, 10);
          if (skip.has(n) || v === 0 || v >= 190) continue;
          return String(v);
        }
        return '';
      };

      const fmtClock = (sec) => {
        const v = Math.max(0, Math.round(Number(sec) || 0));
        return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
      };

      const loadCaptures = useCallback(async (silent) => {
        try {
          const res = await fetch('/api/animebar/captures', { credentials: 'same-origin' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          setCaptures(Array.isArray(data.items) ? data.items : []);
        } catch (e) {
          // 轮询失败不刷屏，只在用户主动操作时报
          if (!silent) {
            setCaptures([]);
            setToast(t('读取捕获失败', 'Cannot load captures', '取得に失敗') + ': ' + String(e.message || e));
          }
        }
      }, [lang]);

      // 捕获是外部（IINA）写进文件的，面板自己不会收到通知，
      // 所以：进入复盘页就拉一次，停留期间每 4 秒轮询，离开即停。
      useEffect(() => {
        if (!open || tab !== 'notes') return undefined;
        loadCaptures();
        loadTags();
        const timer = setInterval(() => loadCaptures(true), 4000);
        return () => clearInterval(timer);
      }, [open, tab, loadCaptures, loadTags]);

      const deleteCapture = async (id) => {
        if (!id) return;
        try {
          const res = await fetch('/api/animebar/captures?note_id=' + encodeURIComponent(id), {
            method: 'DELETE',
            credentials: 'same-origin',
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
          setPendingDelete('');
          setTri(EMPTY_TRI);
          setToast(t('已删除捕获', 'Capture deleted', 'キャプチャを削除'));
          await loadCaptures();
        } catch (e) {
          setToast(t('删除失败', 'Delete failed', '削除に失敗') + ': ' + String(e.message || e));
        }
      };

      const clearTriage = async (id) => {
        if (!id) return;
        try {
          const res = await fetch('/api/animebar/triage', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            // 追加墓碑而不是抹掉历史行：误删还能翻回来
            body: JSON.stringify({ note_id: id, clear: true }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
          setToast(t('已清空复盘', 'Triage cleared', '整理をクリア'));
          setTri(EMPTY_TRI);
          await loadCaptures();
        } catch (e) {
          setToast(t('清空失败', 'Clear failed', 'クリア失敗') + ': ' + String(e.message || e));
        }
      };

      const openTriage = (item) => {
        const c = item.capture || {};
        const tr = item.triage || {};
        if (tri.note_id === c.note_id) {
          setTri(EMPTY_TRI);
          return;
        }
        setTri({
          note_id: c.note_id,
          episode: tr && tr.episode ? String(tr.episode) : guessEpisode(c.title),
          phenomena: Array.isArray(tr.phenomena) ? tr.phenomena.slice() : [],
          speculations: Array.isArray(tr.speculations)
            ? tr.speculations.map((s) => (s && s.tag) || '').filter(Boolean)
            : [],
          my_take: typeof tr.my_take === 'string' ? tr.my_take : '',
          evidence: Array.isArray(tr.evidence) && tr.evidence[0] && tr.evidence[0].url ? tr.evidence[0].url : '',
        });
      };

      const saveTriage = async () => {
        if (!tri.note_id) return;
        const payload = {
          note_id: tri.note_id,
          episode: Number(tri.episode) || undefined,
          phenomena: Array.isArray(tri.phenomena) ? tri.phenomena.slice() : [],
          speculations: (Array.isArray(tri.speculations) ? tri.speculations : []).map((tag) => ({ tag })),
          my_take: tri.my_take,
          evidence: tri.evidence.trim() ? [{ type: 'url', url: tri.evidence.trim() }] : [],
        };
        try {
          const res = await fetch('/api/animebar/triage', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
          setToast(t('已保存复盘', 'Triage saved', '保存しました'));
          setTri(EMPTY_TRI);
          await loadCaptures();
        } catch (e) {
          setToast(t('保存失败', 'Save failed', '保存に失敗') + ': ' + String(e.message || e));
        }
      };

      // 导出草稿：纯客户端生成，结果只进剪贴板，不经过模型
      const buildDraft = (items) => {
        const labelFor = (slug) => {
          const tag = tags.find((x) => x.slug === slug);
          return tag ? labelOf(tag) : slug;
        };
        const groups = new Map();
        (items || []).forEach((item) => {
          const c = item.capture || {};
          const key = c.title || t('（无标题）', '(untitled)', '（無題）');
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(item);
        });

        const out = [];
        out.push(t('# 季度复盘草稿', '# Season review draft', '# クール振り返り草稿'));
        out.push('');
        out.push(t('生成于 ', 'Generated ', '生成: ') + new Date().toLocaleString());
        out.push('');

        Array.from(groups.keys()).sort().forEach((title) => {
          const rows = groups.get(title).slice().sort((a, b) => (a.capture.t_start || 0) - (b.capture.t_start || 0));
          out.push('## ' + title);
          out.push('');
          rows.forEach((item) => {
            const c = item.capture || {};
            const tr = item.triage || {};
            const ph = (Array.isArray(tr.phenomena) ? tr.phenomena : []).map(labelFor);
            const sp = (Array.isArray(tr.speculations) ? tr.speculations : [])
              .map((x) => (x && x.tag ? labelFor(x.tag) : ''))
              .filter(Boolean);
            const ev = Array.isArray(tr.evidence) ? tr.evidence.filter((x) => x && x.url) : [];

            out.push('- **' + fmtClock(c.t_start) + '**' + (ph.length ? ' · ' + ph.join(' / ') : ''));
            if (sp.length) out.push('  - ' + t('推测', 'Speculation', '推測') + ': ' + sp.join(' / '));
            if (tr.my_take) out.push('  - ' + t('如果是我', 'What I would do', '自分なら') + ': ' + tr.my_take);
            if (ev.length) out.push('  - ' + t('证据', 'Evidence', '根拠') + ': ' + ev.map((x) => x.url).join(' '));
            if (!tr.note_id) out.push('  - ' + t('（尚未复盘）', '(not triaged)', '（未整理）'));
          });
          out.push('');
        });

        return out.join('\n');
      };

      // 导出范围：按记录创建时间归属季度
      const quarterOf = (it) => {
        const created = String((it.capture || {}).created_at || '');
        const y = created.slice(0, 4);
        const m = Number(created.slice(5, 7));
        if (!y || !m) return '';
        return y + '-Q' + Math.floor((m - 1) / 3 + 1);
      };

      const quarters = useMemo(() => {
        const set = new Set();
        (captures || []).forEach((it) => { const q = quarterOf(it); if (q) set.add(q); });
        return Array.from(set).sort().reverse();
      }, [captures]);

      const exportDraft = async () => {
        const all = captures || [];
        const items = exportRange === 'all' ? all : all.filter((it) => quarterOf(it) === exportRange);
        if (items.length === 0) {
          setToast(t('还没有可导出的记录', 'Nothing to export', '書き出す記録がありません'));
          return;
        }
        const text = buildDraft(items);
        try {
          await navigator.clipboard.writeText(text);
          setToast(t('草稿已复制到剪贴板', 'Draft copied to clipboard', '下書きをコピーしました'));
        } catch (e) {
          setToast(t('复制失败', 'Copy failed', 'コピーに失敗') + ': ' + String(e.message || e));
        }
      };

      const addNote = () => {
        const entry = {
          id: String(Date.now()) + Math.random().toString(16).slice(2, 6),
          title: '', phenomena: [], speculations: [], evidence: '', reflection: '', dims: {},
          createdAt: new Date().toISOString(),
        };
        const next = [entry].concat(notes);
        setNotes(next);
        saveNotes(next);
      };

      const updateNote = (id, patch) => {
        const next = notes.map((n) => (n.id === id ? Object.assign({}, n, patch) : n));
        setNotes(next);
        saveNotes(next);
      };

      const toggleNoteTag = (n, field, value) => {
        const cur = n[field] || [];
        updateNote(n.id, { [field]: cur.includes(value) ? cur.filter((x) => x !== value) : cur.concat(value) });
      };

      const noteCard = (n) => h('div', { key: 'note-' + n.id, style: S.noteRow },
        h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
          h('span', { style: { fontSize: 10, color: '#64748b', border: '1px solid #1e293b', borderRadius: 999, padding: '0 6px' } },
            t('手记', 'Note', '手記')),
          h('input', {
            value: n.title,
            placeholder: t('作品名', 'Title', '作品名'),
            onChange: (e) => updateNote(n.id, { title: e.target.value }),
            style: Object.assign({}, S.field, { flex: 1, minWidth: 0 }),
          }),
          h('button', { type: 'button', style: S.act, onClick: () => removeNote(n.id) },
            t('删除', 'Delete', '削除')),
        ),
        h('div', { style: S.label }, t('现象', 'Observed', '現象')),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
          PHENOMENA.map((tag) => h('button', {
            key: 'np-' + tag, type: 'button',
            style: Object.assign({}, S.chip, (n.phenomena || []).includes(tag) ? S.chipOn : null),
            onClick: () => toggleNoteTag(n, 'phenomena', tag),
          }, ttag(tag))),
        ),
        h('div', { style: S.label }, t('推测', 'Speculation', '推測')),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
          SPECULATIONS.map((tag) => h('button', {
            key: 'ns-' + tag, type: 'button',
            style: Object.assign({}, S.chip, (n.speculations || []).includes(tag) ? S.chipOn : null),
            onClick: () => toggleNoteTag(n, 'speculations', tag),
          }, ttag(tag))),
        ),
        h('button', {
          type: 'button',
          style: Object.assign({}, S.act, { marginTop: 6 }),
          onClick: () => setDimsOpen((m) => Object.assign({}, m, { [n.id]: !m[n.id] })),
        }, (dimsOpen[n.id] ? '▾ ' : '▸ ') + t('更多（维度）', 'More (dimensions)', 'その他（評価軸）')),
        dimsOpen[n.id]
          ? h('div', { style: { borderLeft: '2px solid #1e293b', paddingLeft: 8, marginTop: 4 } },
              [['art', t('作画', 'sakuga', '作画')], ['staging', t('演出', 'direction', '演出')], ['sound', t('声音', 'sound', '音響')]]
                .map(([facet, label]) => h('div', { key: 'dim-' + facet },
                  h('div', { style: S.label }, label),
                  h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
                    tags.filter((x) => x.kind === 'note' && x.facet === facet).map((tag) => {
                      const zh = (tag.label && tag.label.zh) || tag.slug;
                      const on = (n.dims || {})[facet] === zh;
                      return h('button', {
                        key: 'd-' + facet + tag.slug,
                        type: 'button',
                        style: Object.assign({}, S.chip, on ? S.chipOn : null),
                        onClick: () => updateNote(n.id, {
                          dims: Object.assign({}, n.dims || {}, { [facet]: on ? '' : zh }),
                        }),
                      }, labelOf(tag));
                    }),
                  ),
                )),
            )
          : null,
        h('div', { style: S.label }, t('如果是我', 'What I would do', '自分なら')),
        h('textarea', {
          value: n.reflection,
          onChange: (e) => updateNote(n.id, { reflection: e.target.value }),
          style: S.ta,
        }),
      );

      // 标签管理独立于记录条目：不再依赖某条记录是否展开
      const manageView = () => {
        const custom = tags.filter((x) => seedSlugs.indexOf(x.slug) < 0);
        return h('div', { style: { padding: '8px 12px', borderBottom: '1px solid #0f172a' } },
          h('div', { style: S.label }, t('新增标签（slug + 三语名）', 'New tag (slug + labels)', '新規タグ')),
          h('input', {
            value: newTag.slug,
            placeholder: 'hand_drawn_fx',
            onChange: (e) => setNewTag(Object.assign({}, newTag, { slug: e.target.value })),
            style: Object.assign({}, S.field, { marginBottom: 4 }),
          }),
          h('div', { style: { display: 'flex', gap: 4, marginBottom: 4 } },
            h('input', {
              value: newTag.zh,
              placeholder: t('中文名', 'Chinese', '中国語'),
              onChange: (e) => setNewTag(Object.assign({}, newTag, { zh: e.target.value })),
              style: Object.assign({}, S.field, { flex: 1, minWidth: 0 }),
            }),
            h('input', {
              value: newTag.en,
              placeholder: t('英文名', 'English', '英語'),
              onChange: (e) => setNewTag(Object.assign({}, newTag, { en: e.target.value })),
              style: Object.assign({}, S.field, { flex: 1, minWidth: 0 }),
            }),
            h('input', {
              value: newTag.ja,
              placeholder: t('日文名', 'Japanese', '日本語'),
              onChange: (e) => setNewTag(Object.assign({}, newTag, { ja: e.target.value })),
              style: Object.assign({}, S.field, { flex: 1, minWidth: 0 }),
            }),
          ),
          h('div', { style: { display: 'flex', gap: 4, marginBottom: 8 } },
            h('button', { type: 'button', style: S.act, onClick: () => addSlug('phenomenon') },
              t('加为现象', 'As observed', '現象に')),
            h('button', { type: 'button', style: S.act, onClick: () => addSlug('speculation') },
              t('加为推测', 'As speculation', '推測に')),
          ),
          h('div', { style: S.label }, t('自建标签（可删除）', 'Custom tags (deletable)', '自作タグ（削除可）')),
          custom.length === 0
            ? h('div', { style: { fontSize: 11, color: '#64748b', marginBottom: 4 } },
                t('还没有自建标签', 'None yet', 'まだありません'))
            : h('div', { style: { maxHeight: 132, overflowY: 'auto', marginBottom: 4 } },
                custom.map((tag) =>
                  h('div', { key: 'mg-' + tag.slug, style: { display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0' } },
                    h('span', { style: { flex: 1, minWidth: 0, fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                      labelOf(tag) + '  ' + tag.slug),
                    h('button', { type: 'button', style: S.act, onClick: () => removeTag(tag.slug) },
                      t('删除', 'Delete', '削除')),
                  )),
              ),
          h('div', { style: { fontSize: 10, color: '#475569' } },
            seedSlugs.length + t(' 个内置标签只读，不能删除', ' built-in tags are read-only', ' 個の内蔵タグは削除できません')),
        );
      };

      const triageView = () => {
        if (captures === null) {
          return h('div', { style: S.status }, t('正在读取…', 'Loading…', '読み込み中…'));
        }
        if (captures.length === 0 && notes.length === 0) {
          return h('div', { style: S.status },
            t('还没有记录。播放时按 ⌃⌥K，或点「＋手记」。', 'No records yet.', 'まだありません。'));
        }
        return h('div', null,
          h('div', { style: { fontSize: 12, fontWeight: 600, padding: '8px 12px 0', color: '#e2e8f0' } },
            t('记录', 'Records', '記録')),
          h('div', { style: { display: 'flex', gap: 6, padding: '6px 12px 0', alignItems: 'center' } },
            h('span', { style: { flex: 1, fontSize: 11, color: '#64748b' } },
              (captures.length + notes.length) + t(' 条记录', ' records', ' 件')),
            quarters.length
              ? h('select', {
                  value: exportRange,
                  onChange: (e) => setExportRange(e.target.value),
                  style: Object.assign({}, S.field, { width: 92, padding: '2px 4px', fontSize: 11 }),
                },
                  h('option', { value: 'all' }, t('全部', 'All', '全て')),
                  quarters.map((q) => h('option', { key: q, value: q }, q)),
                )
              : null,
            h('button', { type: 'button', style: S.act, onClick: addNote },
              t('＋手记', '+ Note', '＋手記')),
            h('button', { type: 'button', style: S.act, onClick: () => setManage((v) => !v) },
              manage ? t('完成', 'Done', '完了') : t('管理标签', 'Manage tags', 'タグ管理')),
            h('button', { type: 'button', style: S.act, onClick: exportDraft },
              t('导出草稿', 'Export draft', '下書きを書き出す')),
          ),
          manage ? manageView() : null,
          h('div', { style: S.list },
            captures.map((item) => {
            const c = item.capture || {};
            const tr = item.triage;
            const active = tri.note_id === c.note_id;
            return h('div', { key: c.note_id, style: S.noteRow },
              h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                  fmtClock(c.t_start) + '  ' + (c.title || t('（无片名）', '(untitled)', '（無題）'))),
                tr ? h('span', { style: S.score }, t('已复盘', 'done', '済')) : null,
                h('button', { type: 'button', style: S.act, onClick: () => openTriage(item) },
                  active ? t('收起', 'Close', '閉じる') : t('复盘', 'Triage', '整理')),
                h('button', {
                  type: 'button',
                  style: S.act,
                  title: t('删除这条捕获', 'Delete this capture', 'このキャプチャを削除'),
                  onClick: () => (pendingDelete === c.note_id ? deleteCapture(c.note_id) : setPendingDelete(c.note_id)),
                }, pendingDelete === c.note_id ? t('确认', 'Sure?', '確認') : t('删', 'Del', '削')),
              ),
              active
                ? h('div', null,
                    h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 } },
                      h('span', { style: { fontSize: 11, color: '#64748b' } }, t('集数', 'Episode', '話')),
                      h('input', {
                        value: tri.episode,
                        placeholder: '7',
                        onChange: (e) => setTri(Object.assign({}, tri, { episode: e.target.value })),
                        style: Object.assign({}, S.field, { width: 64, flex: '0 0 auto' }),
                      }),
                    ),
                    h('div', { style: S.label }, t('现象', 'Observed', '現象')),
                    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 } },
                      tags.filter((x) => x.kind === 'phenomenon').map((tag) =>
                        h('button', {
                          key: 'ph-' + tag.slug,
                          type: 'button',
                          title: tag.slug,
                          style: Object.assign({}, S.chip, (tri.phenomena || []).indexOf(tag.slug) >= 0 ? S.chipOn : null),
                          onClick: () => toggleTriTag('phenomenon', tag.slug),
                        }, labelOf(tag))),
                    ),
                    h('div', { style: S.label }, t('推测', 'Speculation', '推測')),
                    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 } },
                      tags.filter((x) => x.kind === 'speculation').map((tag) =>
                        h('button', {
                          key: 'sp-' + tag.slug,
                          type: 'button',
                          title: tag.slug,
                          style: Object.assign({}, S.chip, (tri.speculations || []).indexOf(tag.slug) >= 0 ? S.chipOn : null),
                          onClick: () => toggleTriTag('speculation', tag.slug),
                        }, labelOf(tag))),
                    ),
                    h('div', { style: S.label }, t('如果是我', 'What I would do', '自分なら')),
                    h('textarea', {
                      value: tri.my_take,
                      onChange: (e) => setTri(Object.assign({}, tri, { my_take: e.target.value })),
                      style: S.ta,
                    }),
                    h('div', { style: S.label }, t('证据链接', 'Evidence URL', '根拠 URL')),
                    h('input', {
                      value: tri.evidence,
                      placeholder: 'https://…',
                      onChange: (e) => setTri(Object.assign({}, tri, { evidence: e.target.value })),
                      style: S.field,
                    }),
                    h('div', { style: { marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' } },
                      h('button', { type: 'button', style: S.primary, onClick: saveTriage },
                        t('保存复盘', 'Save triage', '保存')),
                      tr
                        ? h('button', { type: 'button', style: S.act, onClick: () => clearTriage(c.note_id) },
                            t('清空复盘', 'Clear triage', '整理をクリア'))
                        : null,
                    ),
                  )
                : null,
              );
            }).concat(notes.map((n) => noteCard(n))),
          ),
        );
      };


      const toggleTag = (field, value) => {
        setDraft((d) => {
          const has = d[field].includes(value);
          return Object.assign({}, d, { [field]: has ? d[field].filter((x) => x !== value) : d[field].concat(value) });
        });
      };

      const saveDraft = () => {
        if (!draft.title.trim()) {
          setToast(t('先填作品名', 'Enter a title first', '作品名を入力してください'));
          return;
        }
        const entry = {
          id: String(Date.now()) + Math.random().toString(16).slice(2, 6),
          title: draft.title.trim(),
          phenomena: draft.phenomena,
          speculations: draft.speculations,
          evidence: draft.evidence.trim(),
          reflection: draft.reflection.trim(),
          dims: draft.dims,
          createdAt: new Date().toISOString(),
        };
        const next = [entry].concat(notes);
        setNotes(next);
        saveNotes(next);
        setDraft({ title: entry.title, phenomena: [], speculations: [], evidence: '', reflection: '', dims: {} });
        setToast(t('已记录', 'Saved', '記録しました'));
      };

      const removeNote = (id) => {
        const next = notes.filter((n) => n.id !== id);
        setNotes(next);
        saveNotes(next);
      };

      const exportNotes = () => {
        try {
          const blob = new Blob([notesToMarkdown(notes, lang)], { type: 'text/markdown;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'directors-view.md';
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 3000);
          setToast(t('已导出 Markdown', 'Markdown exported', 'Markdown を書き出しました'));
        } catch (e) {
          setToast(t('导出失败', 'Export failed', '書き出し失敗'));
        }
      };

      useEffect(() => {
        if (!toast) return undefined;
        const timer = setTimeout(() => setToast(''), 2000);
        return () => clearTimeout(timer);
      }, [toast]);

      const load = useCallback(async (force) => {
        if (!force) {
          const cached = readCache();
          if (cached) {
            setTv(cached.tv || []);
            setMovies(cached.movies || []);
            return;
          }
        }
        setError('');
        try {
          const tvData = await fetchTv();
          setTv(tvData);
          writeCache({ tv: tvData, movies });
          // 剧场版单独抓，失败不影响新番
          try {
            const movieData = await fetchMovies();
            setMovies(movieData);
            writeCache({ tv: tvData, movies: movieData });
          } catch (e) {
            setMovies([]);
          }
        } catch (e) {
          setError('抓取失败，稍后再试');
        }
      }, [movies]);

      useEffect(() => {
        if (open && tv === null && !error) load(false);
      }, [open, tv, error, load]);

      useEffect(() => {
        if (lang !== 'en' || !tv || !tv.length) return;
        let cancelled = false;
        let stored = {};
        try { stored = JSON.parse(localStorage.getItem(EN_CACHE) || '{}'); } catch (e) { stored = {}; }
        Object.keys(stored).forEach((k) => { titleCache.set(k, stored[k]); });
        setEnTitles((prev) => Object.assign({}, stored, prev));
        (async () => {
          const items = (tv || []).concat(movies || []);
          for (const it of items) {
            if (cancelled) return;
            if (titleCache.has(it.id)) continue;
            const al = await altScore(it.orig || it.title);
            if (al && al.en) {
              titleCache.set(it.id, al.en);
              stored[it.id] = al.en;
              try { localStorage.setItem(EN_CACHE, JSON.stringify(stored)); } catch (e) {}
              if (!cancelled) setEnTitles((prev) => Object.assign({}, prev, { [it.id]: al.en }));
            }
            await new Promise((r) => setTimeout(r, 700));
          }
        })();
        return () => { cancelled = true; };
      }, [lang, tv, movies]);

      const source = tab === 'tv' ? tv || [] : movies || [];
      const rows = useMemo(() => {
        const k = kw.trim().toLowerCase();
        const list = source.filter((it) => {
          if (tab === 'tv' && wd !== 0 && it.wd !== wd) return false;
          if (k && !(it.title + (it.orig || '')).toLowerCase().includes(k)) return false;
          return true;
        });
        return list.sort((a, b) => (sortKey === 'date'
          ? (b.date || '').localeCompare(a.date || '')
          : (b.pop || 0) - (a.pop || 0)));
      }, [source, tab, wd, kw, sortKey]);

      const dismissHint = () => {
        if (!hint) return;
        setHint(false);
        try { localStorage.setItem('animebar.hint', 'seen'); } catch (e) { /* 忽略 */ }
      };


      const notesView = () => h('div', { style: { overflowY: 'auto', padding: '10px 12px' } },
        h('div', { style: S.label }, t('作品名', 'Title', '作品名')),
        h('input', {
          value: draft.title,
          placeholder: t('哪一部', 'Which title', 'どの作品'),
          onChange: (e) => setDraft(Object.assign({}, draft, { title: e.target.value })),
          style: S.field,
        }),
        h('div', { style: S.label }, t('现象（肉眼可见的事实）', 'Symptoms (visible facts)', '兆候（目に見える事実）')),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
          PHENOMENA.map((t) => chip(ttag(t), draft.phenomena.includes(t), () => toggleTag('phenomena', t), 'ph-' + t)),
        ),
        h('div', { style: S.label }, t('推测（允许猜错）', 'Speculation (guessing is fine)', '推測（外れてもいい）')),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
          SPECULATIONS.map((t) => chip(ttag(t), draft.speculations.includes(t), () => toggleTag('speculations', t), 'sp-' + t)),
        ),
        h('input', {
          value: draft.evidence,
          placeholder: t('依据（表记、总集篇、特写修得好…）', 'Evidence (credits, recap, a well-fixed close-up…)', '根拠（クレジット、総集編、上手いクローズアップ…）'),
          onChange: (e) => setDraft(Object.assign({}, draft, { evidence: e.target.value })),
          style: Object.assign({}, S.field, { marginTop: 6 }),
        }),
        DIMENSIONS.map((dim) => h('div', { key: dim.key },
          h('div', { style: S.label }, t(dim.label, dim.label === '作画' ? 'sakuga' : dim.label === '演出' ? 'direction' : 'sound', dim.label === '声音' ? '音響' : dim.label)),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
            dim.options.map((opt) => chip(ttag(opt), draft.dims[dim.key] === opt, () => {
              setDraft((d) => Object.assign({}, d, { dims: Object.assign({}, d.dims, { [dim.key]: d.dims[dim.key] === opt ? '' : opt }) }));
            }, dim.key + '-' + opt)),
          ),
        )),
        h('div', { style: S.label }, t('如果是我，会怎么处理', 'What I would do', '自分ならどうするか')),
        h('textarea', {
          value: draft.reflection,
          placeholder: t('有限资源下你会怎么改这段镜头', 'How would you handle this shot with limited resources?', '限られたリソースでこのカットをどうするか'),
          onChange: (e) => setDraft(Object.assign({}, draft, { reflection: e.target.value })),
          style: S.ta,
        }),
        h('div', { style: { display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' } },
          h('button', { type: 'button', onClick: saveDraft, style: S.primary }, t('保存', 'Save', '保存')),
          h('button', { type: 'button', onClick: exportNotes, style: Object.assign({}, S.chip, { padding: '4px 10px' }) }, t('导出 Markdown', 'Export Markdown', 'Markdown を書き出す')),
          h('span', { style: { fontSize: 11, color: '#64748b', marginLeft: 'auto' } }, notes.length + t(' 条记录', ' notes', ' 件')),
        ),
        notes.length ? h('div', { style: { marginTop: 10, borderTop: '1px solid #1e293b' } },
          notes.map((n) => h('div', { key: n.id, style: S.noteRow },
            h('div', { style: { display: 'flex', gap: 6, alignItems: 'baseline' } },
              h('span', { style: { fontSize: 12, color: '#e2e8f0' } }, n.title),
              h('button', {
                type: 'button',
                style: Object.assign({}, S.act, { marginLeft: 'auto' }),
                onClick: () => removeNote(n.id),
              }, t('删除', 'Delete', '削除')),
            ),
            n.phenomena.length || n.speculations.length
              ? h('div', { style: { fontSize: 11, color: '#64748b', marginTop: 2 } },
                  n.phenomena.concat(n.speculations).map(ttag).join(' · '))
              : null,
            n.reflection ? h('div', { style: { fontSize: 11.5, color: '#94a3b8', marginTop: 2 } }, t('如果是我：', 'If it were me: ', '自分なら：') + n.reflection) : null,
          )),
        ) : null,
      );

      const chip = (label, active, onClick, key) => h('button', {
        key, type: 'button', onClick,
        style: active ? Object.assign({}, S.chip, S.chipOn) : S.chip,
      }, label);

      return h('div', { style: { display: 'inline-flex', position: 'relative' } },
        hint && !open ? h('div', { style: S.hint }, '点这里看今天的番') : null,
        h('button', {
          type: 'button',
          title: '番表（Bangumi）',
          onClick: () => { setOpen((v) => !v); dismissHint(); },
          style: S.btn,
        }, '番表'),

        open ? h('div', { style: S.panel },
          h('div', { style: S.head },
            h('div', { style: S.tabs },
              h('button', { type: 'button', onClick: () => setTab('tv'), style: Object.assign({}, S.tab, tab === 'tv' ? S.tabOn : null) }, t('新番', 'TV', '新作')),
              h('button', { type: 'button', onClick: () => setTab('movie'), style: Object.assign({}, S.tab, tab === 'movie' ? S.tabOn : null) }, t('剧场版', 'Films', '劇場版')),
              h('button', { type: 'button', onClick: () => setTab('notes'), style: Object.assign({}, S.tab, tab === 'notes' ? S.tabOn : null) }, t('记录', 'Notes', '記録')),
            ),
            ['zh', 'en', 'ja'].map((l) => h('button', {
              key: 'lang-' + l,
              type: 'button',
              title: '语言',
              style: Object.assign({}, S.tab, lang === l ? S.tabOn : null),
              onClick: () => { setLang(l); try { localStorage.setItem('animebar.panel.lang', l); } catch (e) {} },
            }, l === 'zh' ? '中文' : l === 'en' ? 'EN' : '日本語')),
            h('button', { type: 'button', title: t('刷新', 'Refresh', '更新'), style: S.icon, onClick: () => load(true) }, '↻'),
            h('button', { type: 'button', title: t('关闭', 'Close', '閉じる'), style: S.icon, onClick: () => setOpen(false) }, '×'),
          ),

          tab === 'notes' ? null : h('div', { style: S.filters },
            tab === 'tv' ? chip(t('全部', 'All', '全て'), wd === 0, () => setWd(0), 'wd0') : null,
            tab === 'tv' ? DAYS.map((d, i) => chip(lang === 'en' ? DAYS_EN[i] : lang === 'ja' ? DAYS_JA[i] : d, wd === i + 1, () => setWd(i + 1), 'wd' + (i + 1))) : null,
            chip(t('按热度', 'Popular', '人気順'), sortKey === 'pop', () => setSortKey('pop'), 'k1'),
            chip(t('按最新', 'Newest', '新着順'), sortKey === 'date', () => setSortKey('date'), 'k2'),
            h('input', {
              value: kw,
              placeholder: t('搜名字…', 'Search title…', '検索…'),
              onChange: (e) => setKw(e.target.value),
              style: S.search,
            }),
          ),

          tab === 'notes'
            ? triageView()
            : error
              ? h('div', { style: S.status }, error)
            : source.length === 0
              ? h('div', { style: S.status }, t('正在抓取…', 'Loading…', '取得中…'))
              : rows.length === 0
                ? h('div', { style: S.status }, t('没有符合条件的作品', 'No matching titles', '該当なし'))
                : h('div', { style: S.list },
                    rows.map((it) => h('div', {
                      key: tab + '-' + it.id,
                      style: S.row,
                    },
                      h('a', { href: detailHref(it), target: '_blank', rel: 'noopener noreferrer', style: { display: 'flex', flex: 1, gap: 9, alignItems: 'center', textDecoration: 'none', color: 'inherit', minWidth: 0 } },
                        h('div', { style: S.coverBox },
                          it.img
                            ? h('img', {
                                src: it.img,
                                alt: '',
                                loading: 'lazy',
                                style: S.cover,
                                onError: (e) => { e.currentTarget.style.display = 'none'; },
                              })
                            : null,
                        ),
                        h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 2 } },
                          h('p', { style: S.title }, titleText(it)),
                          h('span', { style: S.score }, scoreMap[it.id] || ('BGM ' + (it.score ? it.score.toFixed(1) : '—'))),
                        ),
                      ),
                      h('button', {
                        type: 'button',
                        style: S.act,
                        title: t('多方评分（Bangumi / AniList / Kitsu）', 'Scores (Bangumi / AniList / Kitsu)', '評価（Bangumi / AniList / Kitsu）'),
                        onClick: async () => {
                          if (scoreMap[it.id]) {
                            setScoreMap((m) => { const n = Object.assign({}, m); delete n[it.id]; return n; });
                            return;
                          }
                          const r = await multiScore(it);
                          setScoreMap((m) => Object.assign({}, m, { [it.id]: r }));
                        },
                      }, t('评分', 'Scores', '評価')),
                      h('button', {
                        type: 'button',
                        style: S.act,
                        title: t('记一笔（制作人视角）', 'Note (Director view)', '記録（制作者視点）'), 
                        onClick: () => {
                          setDraft(Object.assign({}, draft, { title: it.title }));
                          setTab('notes');
                        },
                      }, t('打点', 'Note', '記録')),
                      h('a', {
                        href: watchHref(it),
                        style: Object.assign({}, S.act, { textDecoration: 'none' }),
                        title: t('唤起 AniCh 并复制标题（需安装 AnimeBar.app）', 'Open AniCh and copy title (requires AnimeBar.app)', 'AniCh を起動してタイトルをコピー（AnimeBar.app 必要）'),
                        onClick: () => {
                          try { navigator.clipboard.writeText(it.title); } catch (e) { /* 忽略 */ }
                          setToast(t('已复制：', 'Copied: ', 'コピーしました：') + it.title);
                        },
                      }, t('AniCh', 'Watch', '視聴')),
                    )),
                  ),
        ) : null,
        toast ? h('div', { style: S.toast }, toast) : null,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'animebar-button',
          order: 5,
        }, AnimePanel));
      },
    };
  },
});
