window.__ModuleLoader__.load({
  id: 'dsh-animebar',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useCallback } = React;

    const UA = { 'user-agent': 'dsh-animebar/0.3' };
    const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const CACHE_KEY = 'animebar.panel.cache.v2';

    function todayKey() {
      return new Date().toDateString();
    }

    function readCache() {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && parsed.day === todayKey() ? parsed : null;
      } catch (e) {
        return null;
      }
    }

    function writeCache(data) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(Object.assign({ day: todayKey() }, data)));
      } catch (e) {
        /* 存储不可用时每次重新抓 */
      }
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
            img: (it.images && (it.images.common || it.images.large)) || '',
            date: (it.date || '').slice(0, 10),
            url: 'https://bgm.tv/subject/' + it.id,
          });
        }
      }
      return out;
    }


    // 无封面时用同款阿卡林幽灵占位（内联 SVG，不依赖文件）
    const GHOST = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 84'>" +
      "<rect width='60' height='84' fill='#1e293b'/>" +
      "<path d='M30 20c-9 0-14 7-14 15v20c0 4 3 4 5 2l3-3 3 4c1 2 5 2 6 0l3-4 3 4c2 2 5 2 5-2V35c0-8-5-15-14-15z' fill='#475569' opacity='.65'/>" +
      "<circle cx='25' cy='38' r='2.4' fill='#1e293b'/><circle cx='35' cy='38' r='2.4' fill='#1e293b'/>" +
      "</svg>");

    const S = {
      btn: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        height: 28, padding: '0 11px', borderRadius: 999, cursor: 'pointer',
        border: '1px solid #22c55e', background: '#22c55e', color: '#04140a',
        fontSize: 12, fontWeight: 600, lineHeight: 1,
      },
      hint: {
        position: 'absolute', left: 0, bottom: 36, whiteSpace: 'nowrap',
        background: '#0f172a', color: '#e2e8f0', border: '1px solid #22c55e',
        borderRadius: 8, padding: '5px 9px', fontSize: 11,
        boxShadow: '0 8px 20px rgba(0,0,0,.35)',
      },
      panel: {
        position: 'fixed', right: 16, bottom: 88, width: 400, maxHeight: '76vh',
        display: 'flex', flexDirection: 'column', zIndex: 60,
        background: '#020617', color: '#e2e8f0', borderRadius: 14,
        border: '1px solid #1e293b', boxShadow: '0 18px 48px rgba(0,0,0,.5)',
        fontFamily: 'system-ui, -apple-system, "PingFang SC", sans-serif',
        overflow: 'hidden', fontSize: 13,
      },
      head: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 8px', borderBottom: '1px solid #1e293b' },
      tabs: { display: 'flex', gap: 4, flex: 1 },
      tab: {
        border: '1px solid transparent', background: 'transparent', color: '#94a3b8',
        borderRadius: 7, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
      },
      tabOn: { background: 'rgba(34,197,94,.16)', color: '#22c55e', border: '1px solid #166534' },
      icon: { border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 2 },
      filters: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 12px', borderBottom: '1px solid #0f172a' },
      chip: {
        border: '1px solid #1e293b', background: 'transparent', color: '#94a3b8',
        borderRadius: 999, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
      },
      chipOn: { background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' },
      search: {
        flex: 1, minWidth: 90, background: 'transparent', border: '1px solid #1e293b',
        borderRadius: 999, color: 'inherit', fontSize: 11, padding: '3px 9px', outline: 'none',
      },
      list: { overflowY: 'auto', padding: 6 },
      row: { display: 'flex', gap: 9, alignItems: 'center', padding: '5px 7px', borderRadius: 8, textDecoration: 'none', color: 'inherit' },
      coverBox: {
        width: 32, height: 45, borderRadius: 5, flex: '0 0 auto', overflow: 'hidden',
        backgroundColor: '#1e293b', backgroundImage: 'url("' + GHOST + '")',
        backgroundSize: 'cover', backgroundPosition: 'center',
      },
      cover: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
      title: { fontSize: 12.5, lineHeight: 1.35, margin: 0, flex: 1, minWidth: 0 },
      score: { fontSize: 11, fontVariantNumeric: 'tabular-nums', color: '#94a3b8', flex: '0 0 auto' },
      act: { border: '1px solid #1e293b', background: 'transparent', color: '#64748b', borderRadius: 6, fontSize: 10, padding: '2px 6px', cursor: 'pointer', flex: '0 0 auto' },
      status: { padding: 16, fontSize: 12, color: '#94a3b8', textAlign: 'center' },
      toast: {
        position: 'fixed', right: 24, bottom: 96, zIndex: 70,
        background: '#166534', color: '#dcfce7', border: '1px solid #22c55e',
        borderRadius: 8, padding: '6px 12px', fontSize: 12,
        boxShadow: '0 8px 20px rgba(0,0,0,.4)',
      },
    };

    function scoreMatch(score, filter) {
      if (filter === 'all') return true;
      if (filter === '8') return score >= 8;
      if (filter === '7') return score >= 7 && score < 8;
      return score < 7;
    }

    function AnimePanel() {
      const [open, setOpen] = useState(false);
      const [hint, setHint] = useState(() => {
        try { return localStorage.getItem('animebar.hint') !== 'seen'; } catch (e) { return true; }
      });
      const [tab, setTab] = useState('tv');
      const [tv, setTv] = useState(null);
      const [movies, setMovies] = useState(null);
      const [error, setError] = useState('');
      const [wd, setWd] = useState(0);
      const [score, setScore] = useState('all');
      const [sortKey, setSortKey] = useState('score');
      const [kw, setKw] = useState('');
      const [toast, setToast] = useState('');

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

      const source = tab === 'tv' ? tv || [] : movies || [];
      const rows = useMemo(() => {
        const k = kw.trim().toLowerCase();
        const list = source.filter((it) => {
          if (tab === 'tv' && wd !== 0 && it.wd !== wd) return false;
          if (!scoreMatch(it.score, score)) return false;
          if (k && !(it.title + (it.orig || '')).toLowerCase().includes(k)) return false;
          return true;
        });
        return list.sort((a, b) => (sortKey === 'date'
          ? (b.date || '').localeCompare(a.date || '')
          : b.score - a.score));
      }, [source, tab, wd, score, kw, sortKey]);

      const dismissHint = () => {
        if (!hint) return;
        setHint(false);
        try { localStorage.setItem('animebar.hint', 'seen'); } catch (e) { /* 忽略 */ }
      };

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
              h('button', { type: 'button', onClick: () => setTab('tv'), style: Object.assign({}, S.tab, tab === 'tv' ? S.tabOn : null) }, '新番'),
              h('button', { type: 'button', onClick: () => setTab('movie'), style: Object.assign({}, S.tab, tab === 'movie' ? S.tabOn : null) }, '剧场版'),
            ),
            h('button', { type: 'button', title: '刷新', style: S.icon, onClick: () => load(true) }, '↻'),
            h('button', { type: 'button', title: '关闭', style: S.icon, onClick: () => setOpen(false) }, '×'),
          ),

          h('div', { style: S.filters },
            tab === 'tv' ? chip('全部', wd === 0, () => setWd(0), 'wd0') : null,
            tab === 'tv' ? DAYS.map((d, i) => chip(d, wd === i + 1, () => setWd(i + 1), 'wd' + (i + 1))) : null,
            chip('评分不限', score === 'all', () => setScore('all'), 's0'),
            chip('≥8', score === '8', () => setScore('8'), 's8'),
            chip('7–8', score === '7', () => setScore('7'), 's7'),
            chip('<7', score === 'low', () => setScore('low'), 'slow'),
            chip('按评分', sortKey === 'score', () => setSortKey('score'), 'k1'),
            chip('按最新', sortKey === 'date', () => setSortKey('date'), 'k2'),
            h('input', {
              value: kw,
              placeholder: '搜名字…',
              onChange: (e) => setKw(e.target.value),
              style: S.search,
            }),
          ),

          error
            ? h('div', { style: S.status }, error)
            : source.length === 0
              ? h('div', { style: S.status }, '正在抓取…')
              : rows.length === 0
                ? h('div', { style: S.status }, '没有符合条件的作品')
                : h('div', { style: S.list },
                    rows.map((it) => h('div', {
                      key: tab + '-' + it.id,
                      style: S.row,
                    },
                      h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer', style: { display: 'flex', flex: 1, gap: 9, alignItems: 'center', textDecoration: 'none', color: 'inherit', minWidth: 0 } },
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
                        h('p', { style: S.title }, it.title),
                        h('span', { style: S.score }, it.score ? it.score.toFixed(1) : '—'),
                      ),
                      h('a', {
                        href: 'animebar://anich?title=' + encodeURIComponent(it.title),
                        style: Object.assign({}, S.act, { textDecoration: 'none' }),
                        title: '唤起 AniCh 并复制标题（需安装 AnimeBar.app）',
                        onClick: () => {
                          try { navigator.clipboard.writeText(it.title); } catch (e) { /* 忽略 */ }
                          setToast('已复制：' + it.title);
                        },
                      }, 'AniCh'),
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
