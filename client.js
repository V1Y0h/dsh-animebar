window.__ModuleLoader__.load({
  id: 'dsh-animebar',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useCallback } = React;

    const UA = { 'user-agent': 'dsh-animebar/0.3' };
    const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const CACHE_KEY = 'animebar.panel.cache.v2';
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
      const lines = [tt('# 制作人视角记录', "# Director's View", '# 制作者視点'), ''];
      const byTitle = {};
      for (const n of list) {
        (byTitle[n.title] = byTitle[n.title] || []).push(n);
      }
      for (const title of Object.keys(byTitle)) {
        lines.push('## ' + title, '');
        for (const n of byTitle[title]) {
          lines.push('- ' + tt('记录', 'Note', '記録'));
          if (n.phenomena.length) lines.push('  - ' + tt('现象：', 'Symptoms: ', '兆候：') + n.phenomena.map(tg).join('、'));
          if (n.speculations.length) lines.push('  - ' + tt('推测：', 'Speculation: ', '推測：') + n.speculations.map(tg).join('、') + (n.evidence ? tt('（依据：', ' (evidence: ', '（根拠：') + n.evidence + '）' : ''));
          const dims = Object.keys(n.dims || {}).filter((k) => n.dims[k]);
          if (dims.length) {
            const dl = (k) => D[k][lang === 'ja' ? 2 : lang === 'en' ? 1 : 0];
            lines.push('  - ' + tt('维度：', 'Dimensions: ', '軸：') + dims.map((k) => dl(k) + '·' + tg(n.dims[k])).join('，'));
          }
          if (n.reflection) lines.push('  - ' + tt('如果是我：', 'If it were me: ', '自分なら：') + n.reflection);
        }
        lines.push('');
      }
      return lines.join('\n');
    }

    function AnimePanel() {
      const [open, setOpen] = useState(false);
      const [lang, setLang] = useState(() => { try { return localStorage.getItem('animebar.panel.lang') || 'zh'; } catch (e) { return 'zh'; } });
      const t = (zh, en, ja) => (lang === 'ja' ? (ja || en) : lang === 'en' ? en : zh);
      const ttag = (zh) => { const p = TAG[zh]; return p ? (lang === 'ja' ? p[1] : lang === 'en' ? p[0] : zh) : zh; };
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
      const [notes, setNotes] = useState(loadNotes);
      const [draft, setDraft] = useState({ title: '', phenomena: [], speculations: [], evidence: '', reflection: '', dims: {} });

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
          a.download = 'producer-lens.md';
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
            h('button', { type: 'button', title: '刷新', style: S.icon, onClick: () => load(true) }, '↻'),
            h('button', { type: 'button', title: '关闭', style: S.icon, onClick: () => setOpen(false) }, '×'),
          ),

          tab === 'notes' ? null : h('div', { style: S.filters },
            tab === 'tv' ? chip(t('全部', 'All', '全て'), wd === 0, () => setWd(0), 'wd0') : null,
            tab === 'tv' ? DAYS.map((d, i) => chip(d, wd === i + 1, () => setWd(i + 1), 'wd' + (i + 1))) : null,
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
            ? notesView()
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
                        h('span', { style: S.score }, it.score ? ('BGM ' + it.score.toFixed(1)) : 'BGM —'),
                      ),
                      h('button', {
                        type: 'button',
                        style: S.act,
                        title: t('多方评分（Bangumi / AniList / Kitsu）', 'Scores (Bangumi / AniList / Kitsu)', '評価（Bangumi / AniList / Kitsu）'),
                        onClick: async () => {
                          setToast(t('查分中…', 'Looking up scores…', 'スコア取得中…'));
                          const r = await multiScore(it);
                          setToast(r);
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
                        href: 'animebar://anich?title=' + encodeURIComponent(it.title),
                        style: Object.assign({}, S.act, { textDecoration: 'none' }),
                        title: t('唤起 AniCh 并复制标题（需安装 AnimeBar.app）', 'Open AniCh and copy title (requires AnimeBar.app)', 'AniCh を起動してタイトルをコピー（AnimeBar.app 必要）'),
                        onClick: () => {
                          try { navigator.clipboard.writeText(it.title); } catch (e) { /* 忽略 */ }
                          setToast('已复制：' + it.title);
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
